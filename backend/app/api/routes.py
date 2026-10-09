import base64
import time
import numpy as np
import cv2
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel, Field
from typing import Dict, Any, List, Optional
from ..simulation.simulator import SimulationCoordinator
from ..services.mission_manager import MissionManager
from ..models.world import EnvironmentType
from ..models.robot import Twist2D, Pose2D


class MissionRequest(BaseModel):
    prompt: Optional[str] = "Find the blue package and navigate to it safely."


class EnvironmentSwitchRequest(BaseModel):
    environment: str  # warehouse, office, smart_laboratory


class EmergencyStopRequest(BaseModel):
    enable: bool = True


class DetectFrameRequest(BaseModel):
    image_base64: str
    source: str = "webcam"  # webcam or upload


class CmdVelRequest(BaseModel):
    linear: float = Field(0.0, description="Forward/backward linear velocity in m/s")
    angular: float = Field(0.0, description="Rotational angular velocity in rad/s")
    duration: float = Field(1.0, ge=0.05, le=30.0, description="Duration in seconds")


class MoveRequest(BaseModel):
    direction: str = Field(..., description="forward, backward, rotate_left, rotate_right, stop")
    speed: float = Field(0.4, ge=0.05, le=1.0, description="Speed factor")
    duration: float = Field(1.0, ge=0.05, le=30.0, description="Duration in seconds")


class SimSpeedRequest(BaseModel):
    multiplier: float = Field(1.0, ge=0.1, le=5.0, description="Simulation speed multiplier (0.1x to 5.0x)")


def create_api_router(simulator: SimulationCoordinator, mission_mgr: MissionManager) -> APIRouter:
    router = APIRouter(prefix="/api")

    @router.get("/health")
    def health_check():
        return {
            "status": "healthy",
            "system": "VisionNav AI",
            "simulation_mode": True,
            "version": "1.0.0"
        }

    # --- ROBOT STATE & CONTROL ---

    @router.get("/robot/state")
    def get_robot_state():
        return simulator.robot.state.model_dump()

    @router.post("/robot/cmd_vel")
    def set_cmd_vel(req: CmdVelRequest):
        """Programmatic velocity command for mobile robot differential drive."""
        simulator.set_manual_velocity(req.linear, req.angular, req.duration)
        return {
            "status": "command_accepted",
            "linear": req.linear,
            "angular": req.angular,
            "duration": req.duration,
            "control_mode": simulator.control_mode.value,
            "robot_state": simulator.robot.state.model_dump()
        }

    @router.post("/robot/move")
    def move_robot(req: MoveRequest):
        """Directional programmatic movement command (forward, backward, rotate_left, rotate_right, stop)."""
        try:
            simulator.move_robot(req.direction, req.speed, req.duration)
            return {
                "status": "executing",
                "direction": req.direction,
                "speed": req.speed,
                "duration": req.duration,
                "control_mode": simulator.control_mode.value,
                "behavior": simulator.robot.state.current_behavior
            }
        except ValueError as e:
            raise HTTPException(status_code=400, detail=str(e))

    @router.post("/robot/stop")
    def stop_robot():
        """Immediately stops programmatic velocity and autonomous navigation."""
        simulator.stop_robot()
        return {
            "status": "stopped",
            "robot_state": simulator.robot.state.model_dump()
        }

    # --- SENSORS ---

    @router.get("/sensors")
    def get_sensors():
        hits, nearest = simulator.lidar.scan(
            simulator.robot.state.pose,
            simulator.env_def.static_obstacles,
            simulator.env_def.dynamic_obstacles,
            simulator.env_def.targets
        )
        return {
            "camera_fps": 20,
            "lidar_points_count": len(hits),
            "nearest_obstacle": round(nearest, 2),
            "robot_pose": simulator.robot.state.pose.model_dump(),
            "odometry": simulator.robot.state.odometry_distance,
            "odometry_data": simulator.robot.state.odometry.model_dump() if simulator.robot.state.odometry else None,
            "sensor_health": simulator.robot.state.sensor_health,
            "imu": simulator.latest_imu.model_dump(),
            "camera_info": {
                "width": simulator.camera.width,
                "height": simulator.camera.height,
                "fov_degrees": simulator.camera.fov_deg
            },
            "depth_info": {
                "fov_degrees": simulator.depth_camera.fov_deg,
                "min_range": simulator.depth_camera.min_range,
                "max_range": simulator.depth_camera.max_range,
                "nearest_distance": simulator.current_depth_scan.nearest_distance if simulator.current_depth_scan else round(nearest, 2)
            }
        }

    @router.get("/sensors/imu")
    def get_imu():
        return simulator.latest_imu.model_dump()

    @router.get("/sensors/odometry")
    def get_odometry():
        if simulator.robot.state.odometry:
            return simulator.robot.state.odometry.model_dump()
        return {
            "pose": simulator.robot.state.pose.model_dump(),
            "twist": simulator.robot.state.twist.model_dump(),
            "total_distance": simulator.robot.total_distance,
            "left_ticks": simulator.robot.left_ticks,
            "right_ticks": simulator.robot.right_ticks,
            "left_wheel_rad_s": simulator.robot.state.wheels.left_rad_s,
            "right_wheel_rad_s": simulator.robot.state.wheels.right_rad_s
        }

    @router.get("/sensors/lidar")
    def get_lidar():
        hits, nearest = simulator.lidar.scan(
            simulator.robot.state.pose,
            simulator.env_def.static_obstacles,
            simulator.env_def.dynamic_obstacles,
            simulator.env_def.targets
        )
        return {
            "nearest_distance": round(nearest, 2),
            "total_rays": len(hits),
            "hits": [h.model_dump() for h in hits]
        }

    @router.get("/camera/rgb")
    @router.get("/camera/frame")
    def get_camera_rgb():
        if not simulator.current_camera_frame:
            simulator.step()
        return simulator.current_camera_frame.model_dump() if simulator.current_camera_frame else {}

    @router.get("/camera/depth")
    def get_camera_depth():
        if not simulator.current_depth_scan:
            simulator.step()
        return simulator.current_depth_scan.model_dump() if simulator.current_depth_scan else {}

    # --- PERCEPTION & WORLD ---

    @router.get("/detections")
    def get_detections():
        return {
            "detections": [d.model_dump() for d in simulator.current_detections],
            "tracked": [t.model_dump() for t in simulator.current_tracked],
            "pipeline_status": simulator.get_perception_status().model_dump(),
            "vlm_reasoning": simulator.vlm_output.model_dump() if simulator.vlm_output else None
        }

    @router.get("/perception/status")
    def get_perception_status():
        """Returns details on the active object detector (preferred neural vs local fallback)."""
        return simulator.get_perception_status().model_dump()

    @router.post("/perception/pipeline/run")
    def run_perception_pipeline():
        """Triggers single execution of full perception pipeline with step-by-step trace."""
        simulator.step()
        status = simulator.get_perception_status().model_dump()
        return {
            "status": "success",
            "pipeline_steps": [
                "1. Camera Frame Acquisition",
                "2. Frame Preprocessing (Letterboxing & Tensor Normalization)",
                "3. Object Detector Inference (Bounding Boxes & Class Probabilities)",
                "4. Confidence Evaluation",
                "5. Multi-Object Tracking (IoU & Centroid Matching, Velocity Vector Estimation)",
                "6. Metric Distance Estimation (Pinhole Optics fused with Depth Buffer)",
                "7. 3D World Model Integration (Robot-to-World Coordinate Transformations)"
            ],
            "detector_type": status["detector_type"],
            "is_fallback": status["is_fallback"],
            "model_source": "fallback_geometric" if status["is_fallback"] else "onnx_neural",
            "documentation": status["documentation"],
            "detections": [d.model_dump() for d in simulator.current_detections],
            "tracked": [t.model_dump() for t in simulator.current_tracked],
            "timestamp": simulator.last_update_time
        }

    @router.get("/world")
    def get_world():
        return simulator.get_full_world_state().model_dump()

    @router.get("/navigation")
    def get_navigation():
        return simulator.navigator.status.model_dump()

    @router.get("/decisions")
    def get_decisions():
        return {
            "decisions": [d.model_dump() for d in simulator.decision_engine.get_history()]
        }

    @router.get("/analytics")
    def get_analytics():
        return mission_mgr.get_analytics().model_dump()

    @router.get("/navigation/transitions")
    def get_navigation_transitions():
        return {
            "transitions": [t.model_dump() for t in simulator.navigator.status.state_history],
            "current_state": simulator.navigator.status.state,
            "pipeline_stage": simulator.navigator.status.pipeline_stage
        }

    @router.post("/navigation/scenario/obstacle_on_route")
    def run_obstacle_scenario():
        """Launches the benchmark test scenario:
        Robot starts at A, target is at B, obstacle is placed directly on original route.
        Expected behavior: detect -> slow/stop -> update map -> replan detour -> follow route -> reach B.
        """
        simulator.start_obstacle_scenario(start_pos=(2.0, 3.0), target_pos=(10.0, 3.0))
        return {
            "status": "scenario_started",
            "scenario": "Obstacle Placed on Route",
            "start": [2.0, 3.0],
            "target": [10.0, 3.0],
            "obstacle": [6.0, 3.0],
            "state": simulator.navigator.status.state,
            "pipeline_stage": simulator.navigator.status.pipeline_stage
        }

    class PlaceObstacleRequest(BaseModel):
        x: Optional[float] = None
        y: Optional[float] = None
        distance_ahead: float = 2.0
        width: float = 1.0
        height: float = 1.0
        name: str = "Unexpected Storage Crate"

    @router.post("/navigation/place_obstacle")
    def place_obstacle_endpoint(req: PlaceObstacleRequest):
        """Dynamically injects an obstacle on the route or at specified (x, y) coordinates."""
        if req.x is not None and req.y is not None:
            obs = simulator.place_obstacle(req.x, req.y, req.width, req.height, req.name)
        else:
            obs = simulator.spawn_obstacle_on_route(req.distance_ahead, req.width, req.height, req.name)

        if not obs:
            raise HTTPException(status_code=400, detail="Cannot spawn obstacle: Robot has no active route.")

        return {
            "status": "obstacle_placed",
            "obstacle": obs.model_dump(),
            "robot_state": simulator.robot.state.model_dump()
        }

    @router.post("/navigation/clear_obstacles")
    def clear_obstacles_endpoint():
        """Clears all dynamically placed obstacles and resets costmap."""
        if simulator.placed_obstacles:
            placed_ids = {obs.id for obs in simulator.placed_obstacles}
            simulator.env_def.static_obstacles = [o for o in simulator.env_def.static_obstacles if o.id not in placed_ids]
            simulator.placed_obstacles.clear()
        simulator.grid.clear_local_obstacles()
        simulator.grid.load_static_obstacles(simulator.env_def.static_obstacles)
        return {"status": "obstacles_cleared"}

    # --- MISSION & DEMO ---

    @router.get("/mission")
    def get_mission():
        curr = mission_mgr.current_mission
        return {
            "active": curr is not None,
            "current_mission": curr.model_dump() if curr else None,
            "latest_completed_mission": mission_mgr.history[-1].model_dump() if mission_mgr.history else None,
            "history_count": len(mission_mgr.history),
            "recent_history": [m.model_dump() for m in mission_mgr.history[-5:]],
            "state": simulator.navigator.status.state,
            "pipeline_stage": simulator.navigator.status.pipeline_stage,
            "goal_name": simulator.navigator.status.goal_name,
            "metrics": simulator.navigator.status.metrics.model_dump(),
            "active_target": simulator.navigator.status.goal_name,
            "objective": simulator.active_objective.model_dump() if simulator.active_objective else None
        }

    @router.get("/simulation/speed")
    def get_simulation_speed():
        return {
            "status": "success",
            "speed_multiplier": simulator.sim_speed_multiplier
        }

    @router.post("/simulation/speed")
    def set_simulation_speed(req: SimSpeedRequest):
        simulator.sim_speed_multiplier = req.multiplier
        return {
            "status": "speed_updated",
            "speed_multiplier": simulator.sim_speed_multiplier
        }

    @router.post("/mission")
    @router.post("/mission/start")
    def start_mission(req: Optional[MissionRequest] = None):
        prompt = req.prompt if (req and req.prompt) else "Find the blue package and navigate to it safely."
        success = mission_mgr.start_mission(prompt)
        if not success:
            raise HTTPException(status_code=400, detail="Could not resolve target or calculate route for given prompt.")
        return {"status": "started", "prompt": prompt, "target": simulator.navigator.status.goal_name}

    @router.post("/mission/pause")
    def pause_mission():
        mission_mgr.pause_mission()
        return {"status": "paused"}

    @router.post("/mission/resume")
    def resume_mission():
        mission_mgr.resume_mission()
        return {"status": "resumed"}

    @router.post("/mission/reset")
    def reset_mission():
        mission_mgr.reset_mission()
        return {"status": "reset"}

    @router.post("/emergency-stop")
    def emergency_stop(req: Optional[EmergencyStopRequest] = None):
        enable = req.enable if req is not None else True
        simulator.robot.trigger_emergency_stop(enable)
        return {
            "emergency_stop": enable,
            "status": "STOPPED" if enable else "OPERATIONAL"
        }

    @router.post("/demo/start")
    def start_judge_demo():
        mission_mgr.trigger_judge_demo()
        return {
            "status": "judge_demo_started",
            "scenario": "Warehouse Blue Package Mission with Dynamic Obstacle Replan"
        }

    @router.post("/environment/switch")
    def switch_environment(req: EnvironmentSwitchRequest):
        try:
            env_type = EnvironmentType(req.environment)
            simulator.set_environment(env_type)
            return {"status": "switched", "environment": env_type.value}
        except ValueError:
            raise HTTPException(status_code=400, detail=f"Unknown environment: {req.environment}")

    @router.post("/perception/detect_uploaded_frame")
    def detect_uploaded_frame(req: DetectFrameRequest):
        """Processes real webcam frame or uploaded image using OpenCV detection pipeline."""
        try:
            raw_b64 = req.image_base64
            if "," in raw_b64:
                raw_b64 = raw_b64.split(",", 1)[1]
            img_bytes = base64.b64decode(raw_b64)
            nparr = np.frombuffer(img_bytes, np.uint8)
            img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
            if img is None:
                raise HTTPException(status_code=400, detail="Invalid image payload could not be decoded by OpenCV.")

            h, w, _ = img.shape
            detections = []

            # 1. OpenCV Blue target package detection via HSV color space
            hsv = cv2.cvtColor(img, cv2.COLOR_BGR2HSV)
            lower_blue = np.array([95, 60, 50])
            upper_blue = np.array([135, 255, 255])
            blue_mask = cv2.inRange(hsv, lower_blue, upper_blue)
            contours, _ = cv2.findContours(blue_mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

            for cnt in contours:
                area = cv2.contourArea(cnt)
                if area > (w * h * 0.004):  # Significant region
                    bx, by, bw, bh = cv2.boundingRect(cnt)
                    est_dist = round(max(0.4, min(8.0, 1.2 / max(0.05, bh / h))), 2)
                    detections.append({
                        "track_id": f"PKG-{len(detections)+1:02d}",
                        "class_name": "package",
                        "attribute": "blue",
                        "is_target": True,
                        "confidence": 0.94,
                        "distance": est_dist,
                        "bbox": {
                            "x": round(bx / w, 3),
                            "y": round(by / h, 3),
                            "width": round(bw / w, 3),
                            "height": round(bh / h, 3)
                        },
                        "model_source": "opencv_color_segmentation",
                        "is_fallback": True
                    })

            # 2. Salient contours if no blue package found
            if not detections:
                gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
                edges = cv2.Canny(gray, 50, 150)
                edge_cnts, _ = cv2.findContours(edges, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
                sorted_cnts = sorted(edge_cnts, key=cv2.contourArea, reverse=True)[:3]
                for cnt in sorted_cnts:
                    if cv2.contourArea(cnt) > (w * h * 0.02):
                        bx, by, bw, bh = cv2.boundingRect(cnt)
                        detections.append({
                            "track_id": f"OBJ-{len(detections)+1:02d}",
                            "class_name": "obstacle",
                            "attribute": "salient_object",
                            "is_target": False,
                            "confidence": 0.81,
                            "distance": round(max(0.5, 1.0 / max(0.05, bh / h)), 2),
                            "bbox": {
                                "x": round(bx / w, 3),
                                "y": round(by / h, 3),
                                "width": round(bw / w, 3),
                                "height": round(bh / h, 3)
                            },
                            "model_source": "opencv_edge_contour",
                            "is_fallback": True
                        })

            return {
                "status": "success",
                "source": "WEBCAM MODE" if req.source == "webcam" else "UPLOADED IMAGE",
                "detections_count": len(detections),
                "detections": detections,
                "image_width": w,
                "image_height": h,
                "timestamp": round(time.time(), 3)
            }
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"Perception frame analysis error: {e}")

    return router
