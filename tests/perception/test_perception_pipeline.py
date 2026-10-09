"""
Comprehensive Unit & Integration Tests for AI Perception Pipeline:
Camera -> Frame Preprocessor -> Object Detector -> Bounding Boxes -> Confidence ->
Tracking -> Distance Estimation -> World Model
"""
import math
import time
import numpy as np
import pytest
from fastapi.testclient import TestClient

from backend.app.main import app, simulator
from backend.app.models.perception import BoundingBox, Detection, TrackedObject, PerceptionPipelineStatus
from backend.app.models.robot import Pose2D, Twist2D, CameraFrameData, DepthScanData
from backend.app.simulation.environment import create_warehouse_environment
from backend.app.simulation.sensors import SimulatedRGBCamera, SimulatedDepthCamera
from backend.app.perception.preprocessor import FramePreprocessor
from backend.app.perception.distance_estimator import DistanceEstimator, CLASS_REFERENCE_HEIGHTS
from backend.app.perception.tracker import MultiObjectTracker
from backend.app.perception.world_model import PerceptionWorldModel
from backend.app.perception.detector import (
    ComputerVisionFallbackDetector,
    ONNXNeuralDetector,
    SUPPORTED_MINIMUM_CLASSES,
    get_detector
)
from backend.app.perception.pipeline import AIPerceptionPipeline

client = TestClient(app)


class TestFramePreprocessor:
    """Verifies camera frame preprocessing: letterboxing, padding, normalization, bbox unpadding."""

    def test_preprocessor_shape_and_normalization(self):
        preprocessor = FramePreprocessor(target_size=(640, 640))
        # Simulated raw frame 240x320 RGB uint8
        raw_frame = np.random.randint(0, 256, (240, 320, 3), dtype=np.uint8)
        preprocessed = preprocessor.preprocess(raw_frame)

        # Output tensor must be NCHW (1, 3, 640, 640) float32 in [0.0, 1.0]
        assert preprocessed.tensor.shape == (1, 3, 640, 640)
        assert preprocessed.tensor.dtype == np.float32
        assert preprocessed.tensor.min() >= 0.0
        assert preprocessed.tensor.max() <= 1.0
        assert preprocessed.orig_shape == (240, 320)
        assert preprocessed.target_shape == (640, 640)

    def test_unpad_bbox_coordinate_recovery(self):
        preprocessor = FramePreprocessor(target_size=(640, 640))
        raw_frame = np.zeros((480, 640, 3), dtype=np.uint8)
        meta = preprocessor.preprocess(raw_frame)

        # Center bounding box in target letterbox canvas
        target_box = BoundingBox(x=0.25, y=0.25, width=0.5, height=0.5)
        orig_box = preprocessor.unpad_bbox(target_box, meta)

        assert 0.0 <= orig_box.x <= 1.0
        assert 0.0 <= orig_box.y <= 1.0
        assert 0.0 < orig_box.width <= 1.0
        assert 0.0 < orig_box.height <= 1.0


class TestDetectorRequirements:
    """Verifies minimum classes, labeling, fallback transparency, and detection schema."""

    def test_minimum_supported_classes(self):
        required_classes = [
            "person", "chair", "table", "box", "backpack",
            "bottle", "laptop", "door", "obstacle"
        ]
        detector = get_detector()
        for c in required_classes:
            assert c in detector.supported_classes, f"Required class {c} missing from detector supported_classes"

    def test_clearly_labeled_fallback_detector(self):
        fallback = ComputerVisionFallbackDetector()
        assert fallback.is_fallback is True
        assert fallback.model_source == "fallback_geometric"
        assert fallback.detector_type == "LOCAL_FALLBACK_GEOMETRIC_PROJECTOR"
        assert "fallback" in fallback.detector_name.lower()

    def test_detection_schema_fields(self):
        env = create_warehouse_environment()
        detector = ComputerVisionFallbackDetector()
        # Robot facing towards central corridor with worker person and racks
        robot_pose = Pose2D(x=8.0, y=5.0, theta=math.pi / 2.0)

        detections = detector.detect(
            frame=None,
            robot_pose=robot_pose,
            static_obstacles=env.static_obstacles,
            dynamic_obstacles=env.dynamic_obstacles,
            targets=env.targets
        )

        assert len(detections) > 0, "Expected detections in front of robot in warehouse"

        for det in detections:
            # Check every required detection field:
            # class, confidence, bbox, track_id, distance, position, timestamp
            dumped = det.model_dump()
            assert "class" in dumped
            assert "class_name" in dumped
            assert isinstance(det.class_name, str)
            assert det.class_name in SUPPORTED_MINIMUM_CLASSES

            assert "confidence" in dumped
            assert 0.0 <= det.confidence <= 1.0

            assert "bbox" in dumped
            assert 0.0 <= det.bbox.x <= 1.0
            assert 0.0 <= det.bbox.y <= 1.0
            assert 0.0 < det.bbox.width <= 1.0
            assert 0.0 < det.bbox.height <= 1.0

            assert "track_id" in dumped
            assert len(det.track_id) > 0

            assert "distance" in dumped
            assert det.distance > 0.0

            assert "position" in dumped
            assert len(det.position) == 3

            assert "timestamp" in dumped
            assert det.timestamp > 0

            # Clearly labeled fallback attributes
            assert "model_source" in dumped
            assert "is_fallback" in dumped
            assert det.is_fallback is True
            assert det.model_source == "fallback_geometric"


class TestMultiObjectTracker:
    """Verifies tracking across frames, velocity estimation, and track persistence."""

    def test_tracker_association_and_velocity_estimation(self):
        tracker = MultiObjectTracker()
        t0 = time.time()

        # Frame 1: Detection at (3.0, 0.0, 0.5)
        d1 = Detection(
            track_id="P-01",
            class_name="person",
            confidence=0.92,
            bbox=BoundingBox(x=0.4, y=0.3, width=0.2, height=0.5),
            distance=3.0,
            position=(3.0, 0.0, 0.5),
            timestamp=t0
        )
        tracks_t0 = tracker.update([d1], t0)
        assert len(tracks_t0) == 1
        assert tracks_t0[0].track_id == "P-01"
        assert tracks_t0[0].velocity == (0.0, 0.0)

        # Frame 2: Person moved to (3.2, 0.1, 0.5) after 0.5 seconds
        t1 = t0 + 0.5
        d2 = Detection(
            track_id="P-01",
            class_name="person",
            confidence=0.94,
            bbox=BoundingBox(x=0.42, y=0.3, width=0.2, height=0.5),
            distance=3.2,
            position=(3.2, 0.1, 0.5),
            timestamp=t1
        )
        tracks_t1 = tracker.update([d2], t1)
        assert len(tracks_t1) == 1
        track = tracks_t1[0]
        assert track.track_id == "P-01"
        # Velocity estimation: vx = (3.2 - 3.0)/0.5 = 0.4 m/s, vy = (0.1 - 0.0)/0.5 = 0.2 m/s
        assert pytest.approx(track.velocity[0], abs=0.05) == 0.4
        assert pytest.approx(track.velocity[1], abs=0.05) == 0.2
        assert track.is_dynamic is True

    def test_tracker_occlusion_and_stale_removal(self):
        tracker = MultiObjectTracker(max_disappeared_seconds=1.0)
        t0 = time.time()

        d1 = Detection(
            track_id="B-01",
            class_name="box",
            confidence=0.88,
            bbox=BoundingBox(x=0.3, y=0.3, width=0.2, height=0.2),
            distance=2.0,
            position=(2.0, 0.0, 0.25),
            timestamp=t0
        )
        tracker.update([d1], t0)

        # 0.2s later: object temporarily occluded (not detected)
        tracks_occluded = tracker.update([], t0 + 0.2)
        assert len(tracks_occluded) == 1
        assert tracks_occluded[0].status == "Occluded"

        # 1.5s later: object disappeared beyond max_disappeared_seconds
        tracks_stale = tracker.update([], t0 + 1.5)
        assert len(tracks_stale) == 0


class TestDistanceEstimator:
    """Verifies pinhole optical estimation and depth sensor fusion."""

    def test_pinhole_optical_estimation(self):
        estimator = DistanceEstimator(fov_deg=80.0, fov_v_deg=60.0, image_height=480)
        # Larger bounding box -> closer distance
        bbox_close = BoundingBox(x=0.3, y=0.2, width=0.4, height=0.6)
        d_close, pos_close = estimator.estimate(bbox_close, "person")

        # Smaller bounding box -> farther distance
        bbox_far = BoundingBox(x=0.4, y=0.4, width=0.1, height=0.15)
        d_far, pos_far = estimator.estimate(bbox_far, "person")

        assert d_close < d_far
        assert pos_close[0] > 0.0  # Positive forward direction

    def test_depth_fusion_refinement(self):
        estimator = DistanceEstimator()
        bbox = BoundingBox(x=0.4, y=0.3, width=0.2, height=0.4)

        # Synthetic depth scan returning 2.5 meters in center
        depth_scan = DepthScanData(
            width=64,
            min_range=0.2,
            max_range=8.0,
            ranges=[2.5] * 64
        )
        dist, pos = estimator.estimate(bbox, "box", depth_scan=depth_scan)
        # Result should be closely aligned with depth sensor measurement (2.5m)
        assert pytest.approx(dist, abs=0.5) == 2.5


class TestPerceptionWorldModel:
    """Verifies map coordinate frame transformations and entity aggregation."""

    def test_transform_to_world_coordinates(self):
        wm = PerceptionWorldModel()
        # Robot at (5.0, 5.0) facing North (theta = pi/2)
        robot_pose = Pose2D(x=5.0, y=5.0, theta=math.pi / 2.0)
        # Object 2 meters forward in robot chassis frame (x=2.0, y=0.0, z=0.5)
        local_pos = (2.0, 0.0, 0.5)
        world_pos = wm.transform_to_world(local_pos, robot_pose)

        # In world frame, facing North means forward X points along positive global Y:
        # world_x = 5.0, world_y = 5.0 + 2.0 = 7.0
        assert pytest.approx(world_pos[0], abs=0.05) == 5.0
        assert pytest.approx(world_pos[1], abs=0.05) == 7.0
        assert world_pos[2] == 0.5


class TestEndToEndCameraToDetection:
    """End-to-End camera-to-detection test connecting sensor acquisition through to world model."""

    def test_end_to_end_camera_to_detection_pipeline(self):
        # 1. Instantiate Environment & Robot
        env = create_warehouse_environment()
        camera = SimulatedRGBCamera(width=320, height=240, fov_deg=80.0)
        depth_cam = SimulatedDepthCamera(fov_deg=80.0, num_columns=80)
        pipeline = AIPerceptionPipeline()

        # Place robot facing technician Alex and storage racks
        robot_pose = Pose2D(x=9.5, y=4.5, theta=math.pi / 2.0)

        # Step 1: Camera captures actual RGB frame
        camera_frame_data = camera.capture(
            robot_pose=robot_pose,
            static_obstacles=env.static_obstacles,
            dynamic_obstacles=env.dynamic_obstacles,
            targets=env.targets
        )
        assert camera.last_frame_array is not None
        assert camera.last_frame_array.shape == (240, 320, 3)

        depth_scan_data = depth_cam.scan(
            robot_pose=robot_pose,
            static_obstacles=env.static_obstacles,
            dynamic_obstacles=env.dynamic_obstacles,
            targets=env.targets
        )

        # Step 2: Feed camera frame into perception pipeline
        result = pipeline.process(
            frame=camera.last_frame_array,
            robot_pose=robot_pose,
            static_obstacles=env.static_obstacles,
            dynamic_obstacles=env.dynamic_obstacles,
            targets=env.targets,
            depth_scan=depth_scan_data,
            camera_frame=camera_frame_data
        )

        # Step 3: Verify pipeline execution output
        assert "detections" in result
        assert "tracked" in result
        assert "world_model" in result
        assert "pipeline_status" in result
        assert result["processing_time_ms"] >= 0.0

        detections = pipeline.latest_detections
        assert len(detections) > 0, "Camera in front of objects must yield detections"

        # Verify every detection has required fields
        for d in detections:
            assert d.class_name in SUPPORTED_MINIMUM_CLASSES
            assert d.confidence > 0.0
            assert d.distance > 0.0
            assert d.bbox.width > 0.0 and d.bbox.height > 0.0
            assert len(d.position_3d) == 3
            assert d.track_id != ""
            assert d.timestamp > 0.0

        # Step 4: Verify World Model integration
        entities = pipeline.world_model.get_all_entities()
        assert len(entities) > 0
        summary = pipeline.world_model.get_summary()
        assert summary["total_entities"] == len(entities)
        assert summary["people_count"] >= 1  # Person Alex is in front of robot


class TestPerceptionAPIEndpoints:
    """Verifies HTTP REST API endpoints and simulation integration."""

    def test_get_perception_status_endpoint(self):
        resp = client.get("/api/perception/status")
        assert resp.status_code == 200
        data = resp.json()
        assert "detector_name" in data
        assert "detector_type" in data
        assert "is_fallback" in data
        assert "supported_classes" in data
        assert "documentation" in data
        assert len(data["supported_classes"]) >= 9

    def test_get_detections_endpoint(self):
        # Step simulation to produce perception cycle
        client.post("/api/simulation/step")
        resp = client.get("/api/detections")
        assert resp.status_code == 200
        data = resp.json()
        assert "detections" in data
        assert "tracked" in data
        assert "pipeline_status" in data

    def test_run_perception_pipeline_endpoint(self):
        resp = client.post("/api/perception/pipeline/run")
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "success"
        assert "pipeline_steps" in data
        assert len(data["pipeline_steps"]) == 7
        assert "detections" in data
        assert "tracked" in data
        assert "detector_type" in data
        assert "model_source" in data
