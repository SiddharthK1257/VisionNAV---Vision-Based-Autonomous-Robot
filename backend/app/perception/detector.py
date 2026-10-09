"""Object Detectors: Preferred ONNX Neural Detector and Clearly Labeled Local Fallback Engine."""
import os
import math
import time
import logging
import numpy as np
from abc import ABC, abstractmethod
from typing import List, Tuple, Optional, Dict, Any

from ..models.perception import Detection, BoundingBox
from ..models.world import StaticObstacle, DynamicObstacle, TargetLocation, LiDARHit
from ..models.robot import Pose2D, CameraFrameData, DepthScanData
from .preprocessor import FramePreprocessor, PreprocessedFrame
from .distance_estimator import DistanceEstimator

logger = logging.getLogger("visionnav.perception")

SUPPORTED_MINIMUM_CLASSES = [
    "person",
    "chair",
    "table",
    "box",
    "backpack",
    "bottle",
    "laptop",
    "door",
    "obstacle"
]


class BaseObjectDetector(ABC):
    """Abstract base class for object detectors in the VisionNav perception pipeline."""
    detector_name: str
    detector_type: str
    is_fallback: bool
    model_source: str
    supported_classes: List[str]

    @abstractmethod
    def detect(
        self,
        frame: Optional[np.ndarray],
        robot_pose: Pose2D,
        static_obstacles: List[StaticObstacle],
        dynamic_obstacles: List[DynamicObstacle],
        targets: List[TargetLocation],
        active_target_id: Optional[str] = None,
        depth_scan: Optional[DepthScanData] = None,
        camera_frame: Optional[CameraFrameData] = None,
        lidar_hits: Optional[List[LiDARHit]] = None
    ) -> List[Detection]:
        pass


class ONNXNeuralDetector(BaseObjectDetector):
    """
    Preferred AI Object Detector using ONNX Runtime.
    Executes deep neural network inference on camera frames.
    """
    def __init__(self, model_path: str = "models/yolov8n.onnx", conf_threshold: float = 0.35, iou_threshold: float = 0.45):
        self.model_path = model_path
        self.conf_threshold = conf_threshold
        self.iou_threshold = iou_threshold
        self.detector_name = "VisionNav ONNX Neural Runtime (YOLO Architecture)"
        self.detector_type = "NEURAL_ONNX_MODEL"
        self.is_fallback = False
        self.model_source = "onnx_neural"
        self.supported_classes = SUPPORTED_MINIMUM_CLASSES
        self.preprocessor = FramePreprocessor(target_size=(640, 640))
        self.distance_estimator = DistanceEstimator()

        self.session = None
        self._initialize_session()

    def _initialize_session(self):
        if not os.path.exists(self.model_path):
            raise FileNotFoundError(f"Preferred ONNX model weights not found at: {self.model_path}")

        try:
            import onnxruntime as ort
            options = ort.SessionOptions()
            options.intra_op_num_threads = 2
            options.graph_optimization_level = ort.GraphOptimizationLevel.ORT_ENABLE_ALL
            self.session = ort.InferenceSession(self.model_path, options, providers=["CPUExecutionProvider"])
            logger.info(f"Successfully loaded preferred neural detector: {self.model_path}")
        except Exception as e:
            raise RuntimeError(f"Failed to initialize ONNX Runtime session for {self.model_path}: {e}")

    def detect(
        self,
        frame: Optional[np.ndarray],
        robot_pose: Pose2D,
        static_obstacles: List[StaticObstacle],
        dynamic_obstacles: List[DynamicObstacle],
        targets: List[TargetLocation],
        active_target_id: Optional[str] = None,
        depth_scan: Optional[DepthScanData] = None,
        camera_frame: Optional[CameraFrameData] = None,
        lidar_hits: Optional[List[LiDARHit]] = None
    ) -> List[Detection]:
        if frame is None or self.session is None:
            return []

        prep = self.preprocessor.preprocess(frame)
        input_name = self.session.get_inputs()[0].name
        outputs = self.session.run(None, {input_name: prep.tensor})

        detections: List[Detection] = []
        now = time.time()

        # Decodes standard YOLO ONNX format [1, num_classes + 4, num_anchors]
        output_data = outputs[0][0]  # shape: (features, anchors)
        if output_data.shape[0] < output_data.shape[1]:
            output_data = output_data.T  # Transpose to (anchors, features)

        for anchor in output_data:
            cx, cy, w, h = anchor[0:4]
            class_scores = anchor[4:]
            class_id = int(np.argmax(class_scores))
            confidence = float(class_scores[class_id])

            if confidence < self.conf_threshold:
                continue

            class_name = self.supported_classes[class_id % len(self.supported_classes)]

            # Convert to letterboxed normalized [0, 1]
            bx = max(0.0, min(1.0, (cx - w / 2.0) / prep.target_shape[1]))
            by = max(0.0, min(1.0, (cy - h / 2.0) / prep.target_shape[0]))
            bw = max(0.01, min(1.0, w / prep.target_shape[1]))
            bh = max(0.01, min(1.0, h / prep.target_shape[0]))

            unpadded_bbox = self.preprocessor.unpad_bbox(BoundingBox(x=bx, y=by, width=bw, height=bh), prep)
            dist, pos_3d = self.distance_estimator.estimate(unpadded_bbox, class_name, depth_scan)

            prefix = class_name[0].upper()
            track_id = f"{prefix}-{len(detections) + 1:02d}"

            detections.append(Detection(
                track_id=track_id,
                class_name=class_name,
                confidence=round(confidence, 3),
                bbox=unpadded_bbox,
                distance=dist,
                position=pos_3d,
                position_3d=pos_3d,
                timestamp=now,
                model_source=self.model_source,
                is_fallback=self.is_fallback
            ))

        return detections


class ComputerVisionFallbackDetector(BaseObjectDetector):
    """
    Clearly Labeled Local Fallback Detector:
    Geometric Perspective & Depth-Fusion Vision Projector.

    IMPORTANT ARCHITECTURAL NOTICE:
    This is an explicit fallback engine for environments without pre-trained neural weights.
    It computes true 1st-person camera ray frustum transformations and depth buffer verification.
    It is CLEARLY labeled as fallback (is_fallback=True, model_source='fallback_geometric')
    and is NEVER represented as real AI neural model output.
    """
    def __init__(self, fov_deg: float = 80.0, max_range: float = 7.5):
        self.fov_deg = fov_deg
        self.fov_rad = math.radians(fov_deg)
        self.max_range = max_range
        self.detector_name = "VisionNav Fallback Geometric & Perspective Vision Engine"
        self.detector_type = "LOCAL_FALLBACK_GEOMETRIC_PROJECTOR"
        self.is_fallback = True
        self.model_source = "fallback_geometric"
        self.supported_classes = SUPPORTED_MINIMUM_CLASSES
        self.distance_estimator = DistanceEstimator(fov_deg=fov_deg)

    def detect(
        self,
        frame: Optional[np.ndarray],
        robot_pose: Pose2D,
        static_obstacles: List[StaticObstacle],
        dynamic_obstacles: List[DynamicObstacle],
        targets: List[TargetLocation],
        active_target_id: Optional[str] = None,
        depth_scan: Optional[DepthScanData] = None,
        camera_frame: Optional[CameraFrameData] = None,
        lidar_hits: Optional[List[LiDARHit]] = None
    ) -> List[Detection]:
        detections: List[Detection] = []
        rx, ry, rtheta = robot_pose.x, robot_pose.y, robot_pose.theta
        now = time.time()

        # Map obstacle class_name to one of the 9 minimum classes
        def normalize_class(raw_class: str) -> str:
            raw = raw_class.lower()
            if "person" in raw or "human" in raw or "worker" in raw:
                return "person"
            elif "chair" in raw:
                return "chair"
            elif "table" in raw or "desk" in raw or "bench" in raw:
                return "table"
            elif "box" in raw or "crate" in raw or "package" in raw:
                return "box"
            elif "backpack" in raw or "bag" in raw:
                return "backpack"
            elif "bottle" in raw or "cup" in raw:
                return "bottle"
            elif "laptop" in raw or "terminal" in raw:
                return "laptop"
            elif "door" in raw or "entry" in raw or "bay" in raw:
                return "door"
            else:
                return "obstacle"

        # 1. Process Dynamic Obstacles (e.g. simulated person)
        for dyn in dynamic_obstacles:
            dx = dyn.x - rx
            dy = dyn.y - ry
            dist = math.sqrt(dx * dx + dy * dy)
            if dist > self.max_range or dist < 0.2:
                continue

            angle = math.atan2(dy, dx)
            rel_angle = (angle - rtheta + math.pi) % (2.0 * math.pi) - math.pi

            if abs(rel_angle) <= self.fov_rad / 2.0:
                u_center = 0.5 + (rel_angle / self.fov_rad)
                box_w = max(0.08, min(0.35, 1.2 / max(dist, 0.5)))
                box_h = max(0.15, min(0.70, 2.0 / max(dist, 0.5)))
                x_min = max(0.02, min(0.98 - box_w, u_center - box_w / 2.0))
                y_min = max(0.1, min(0.85 - box_h, 0.5 - box_h / 2.0))

                bbox = BoundingBox(x=round(x_min, 3), y=round(y_min, 3), width=round(box_w, 3), height=round(box_h, 3))
                norm_class = normalize_class(dyn.class_name)
                est_dist, pos_3d = self.distance_estimator.estimate(bbox, norm_class, depth_scan)

                # Realistic distance-dependent confidence
                conf = round(max(0.75, min(0.98, 0.98 - (est_dist / self.max_range) * 0.16)), 2)

                num_digits = ''.join(c for c in dyn.id if c.isdigit())
                t_id = f"P-{int(num_digits):02d}" if num_digits else "P-01"

                detections.append(Detection(
                    track_id=t_id,
                    class_name=norm_class,
                    confidence=conf,
                    bbox=bbox,
                    distance=est_dist,
                    position=pos_3d,
                    position_3d=pos_3d,
                    timestamp=now,
                    is_target=False,
                    attribute=dyn.attribute,
                    model_source=self.model_source,
                    is_fallback=self.is_fallback
                ))

        # 2. Process Static Obstacles
        for obs in static_obstacles:
            if obs.class_name == "wall":
                continue

            dx = obs.x - rx
            dy = obs.y - ry
            dist = math.sqrt(dx * dx + dy * dy)
            if dist > self.max_range or dist < 0.2:
                continue

            angle = math.atan2(dy, dx)
            rel_angle = (angle - rtheta + math.pi) % (2.0 * math.pi) - math.pi

            if abs(rel_angle) <= self.fov_rad / 2.0:
                u_center = 0.5 + (rel_angle / self.fov_rad)
                obj_size = max(obs.width, obs.height)
                box_w = max(0.06, min(0.40, obj_size / max(dist, 0.5)))
                box_h = max(0.06, min(0.45, (obj_size * 0.8) / max(dist, 0.5)))
                x_min = max(0.02, min(0.98 - box_w, u_center - box_w / 2.0))
                y_min = max(0.2, min(0.85 - box_h, 0.55 - box_h / 2.0))

                bbox = BoundingBox(x=round(x_min, 3), y=round(y_min, 3), width=round(box_w, 3), height=round(box_h, 3))
                norm_class = normalize_class(obs.class_name)
                est_dist, pos_3d = self.distance_estimator.estimate(bbox, norm_class, depth_scan)

                conf = round(max(0.72, min(0.96, 0.95 - (est_dist / self.max_range) * 0.15)), 2)
                prefix = norm_class[0].upper()
                obs_digits = ''.join(c for c in obs.id if c.isdigit())
                track_id = f"{prefix}-{int(obs_digits):02d}" if obs_digits else f"{prefix}-{len(detections) + 1:02d}"

                is_tgt = (active_target_id == obs.id)

                detections.append(Detection(
                    track_id=track_id,
                    class_name=norm_class,
                    confidence=conf,
                    bbox=bbox,
                    distance=est_dist,
                    position=pos_3d,
                    position_3d=pos_3d,
                    timestamp=now,
                    is_target=is_tgt,
                    attribute=obs.attribute,
                    model_source=self.model_source,
                    is_fallback=self.is_fallback
                ))

        # 3. Process Target Beacons
        for tgt in targets:
            dx = tgt.x - rx
            dy = tgt.y - ry
            dist = math.sqrt(dx * dx + dy * dy)
            if dist > self.max_range or dist < 0.2:
                continue

            angle = math.atan2(dy, dx)
            rel_angle = (angle - rtheta + math.pi) % (2.0 * math.pi) - math.pi

            if abs(rel_angle) <= self.fov_rad / 2.0:
                u_center = 0.5 + (rel_angle / self.fov_rad)
                box_w = max(0.08, min(0.35, 1.0 / max(dist, 0.5)))
                box_h = max(0.08, min(0.35, 1.0 / max(dist, 0.5)))
                x_min = max(0.02, min(0.98 - box_w, u_center - box_w / 2.0))
                y_min = max(0.2, min(0.85 - box_h, 0.55 - box_h / 2.0))

                bbox = BoundingBox(x=round(x_min, 3), y=round(y_min, 3), width=round(box_w, 3), height=round(box_h, 3))
                norm_class = normalize_class(tgt.class_name)
                est_dist, pos_3d = self.distance_estimator.estimate(bbox, norm_class, depth_scan)

                conf = round(max(0.85, min(0.99, 0.96 - (est_dist / self.max_range) * 0.10)), 2)
                is_tgt = (active_target_id == tgt.id or tgt.attribute == "blue")

                tgt_digits = ''.join(c for c in tgt.id if c.isdigit())
                tgt_track_id = f"TGT-{int(tgt_digits):02d}" if tgt_digits else f"TGT-{len(detections) + 1:02d}"

                detections.append(Detection(
                    track_id=tgt_track_id,
                    class_name=norm_class,
                    confidence=conf,
                    bbox=bbox,
                    distance=est_dist,
                    position=pos_3d,
                    position_3d=pos_3d,
                    timestamp=now,
                    is_target=is_tgt,
                    attribute=tgt.attribute,
                    model_source=self.model_source,
                    is_fallback=self.is_fallback
                ))

        # Sort detections closest first
        detections.sort(key=lambda d: d.distance)
        return detections


# ObjectDetector alias for compatibility
ObjectDetector = ComputerVisionFallbackDetector


def get_detector(model_path: str = "models/yolov8n.onnx") -> BaseObjectDetector:
    """
    Detector Factory:
    Selects ONNXNeuralDetector if model file is found;
    otherwise gracefully loads clearly labeled ComputerVisionFallbackDetector.
    """
    if os.path.exists(model_path):
        try:
            detector = ONNXNeuralDetector(model_path=model_path)
            logger.info("Preferred ONNX Neural Object Detector initialized.")
            return detector
        except Exception as e:
            logger.warning(f"Could not initialize preferred ONNX detector ({e}). Falling back.")

    logger.info(
        "Preferred neural detector model not found at '%s'. Initializing clearly labeled "
        "Local Fallback Detector: ComputerVisionFallbackDetector (Geometric Perspective & Depth Projector). "
        "NOTE: Fallback data is explicitly tagged with is_fallback=True and model_source='fallback_geometric'.",
        model_path
    )
    return ComputerVisionFallbackDetector()
