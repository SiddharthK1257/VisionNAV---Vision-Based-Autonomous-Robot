"""Comprehensive integration tests for all VisionNav AI FastAPI REST & WebSocket Endpoints."""
import pytest
from fastapi.testclient import TestClient
from backend.app.main import app


@pytest.fixture
def client():
    return TestClient(app)


# 1. Health Endpoint
def test_health_endpoint(client):
    response = client.get("/api/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "healthy"
    assert data["system"] == "VisionNav AI"
    assert data["simulation_mode"] is True
    assert data["version"] == "1.0.0"


# 2. Robot State & Control Endpoints
def test_robot_state_endpoint(client):
    response = client.get("/api/robot/state")
    assert response.status_code == 200
    data = response.json()
    assert "pose" in data
    assert "twist" in data
    assert "battery" in data
    assert "status" in data
    assert "odometry_distance" in data


def test_robot_cmd_vel_endpoint(client):
    resp = client.post("/api/robot/cmd_vel", json={"linear": 0.35, "angular": 0.2, "duration": 1.0})
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "command_accepted"
    assert data["linear"] == 0.35
    assert data["angular"] == 0.2


def test_robot_move_endpoint(client):
    resp = client.post("/api/robot/move", json={"direction": "forward", "speed": 0.4, "duration": 0.5})
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "executing"
    assert data["direction"] == "forward"


def test_robot_stop_endpoint(client):
    resp = client.post("/api/robot/stop")
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "stopped"


# 3. Sensors Endpoints
def test_sensors_endpoint(client):
    response = client.get("/api/sensors")
    assert response.status_code == 200
    data = response.json()
    assert "camera_fps" in data
    assert "lidar_points_count" in data
    assert "nearest_obstacle" in data
    assert "robot_pose" in data
    assert "sensor_health" in data
    assert "imu" in data


def test_sensors_imu_endpoint(client):
    response = client.get("/api/sensors/imu")
    assert response.status_code == 200
    data = response.json()
    assert "linear_acceleration_z" in data
    assert "angular_velocity_z" in data
    assert "yaw" in data
    assert "pitch" in data
    assert "roll" in data


def test_sensors_odometry_endpoint(client):
    response = client.get("/api/sensors/odometry")
    assert response.status_code == 200
    data = response.json()
    assert "pose" in data
    assert "twist" in data


def test_sensors_lidar_endpoint(client):
    response = client.get("/api/sensors/lidar")
    assert response.status_code == 200
    data = response.json()
    assert "total_rays" in data
    assert "hits" in data
    assert len(data["hits"]) > 0


def test_camera_rgb_endpoint(client):
    response = client.get("/api/camera/rgb")
    assert response.status_code == 200
    data = response.json()
    assert "image_base64" in data
    assert "width" in data
    assert "height" in data


def test_camera_frame_alias_endpoint(client):
    response = client.get("/api/camera/frame")
    assert response.status_code == 200
    data = response.json()
    assert "image_base64" in data


def test_camera_depth_endpoint(client):
    response = client.get("/api/camera/depth")
    assert response.status_code == 200
    data = response.json()
    assert "depth_image_base64" in data
    assert "nearest_distance" in data


# 4. Perception & World Endpoints
def test_detections_endpoint(client):
    response = client.get("/api/detections")
    assert response.status_code == 200
    data = response.json()
    assert "detections" in data
    assert "tracked" in data
    assert "pipeline_status" in data


def test_perception_status_endpoint(client):
    response = client.get("/api/perception/status")
    assert response.status_code == 200
    data = response.json()
    assert "detector_name" in data
    assert "detector_type" in data
    assert "is_fallback" in data


def test_perception_pipeline_run_endpoint(client):
    response = client.post("/api/perception/pipeline/run")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "success"
    assert "pipeline_steps" in data
    assert len(data["pipeline_steps"]) == 7


def test_world_endpoint(client):
    response = client.get("/api/world")
    assert response.status_code == 200
    data = response.json()
    assert "environment_type" in data
    assert "robot" in data
    assert "static_obstacles" in data
    assert "dynamic_obstacles" in data
    assert "targets" in data


def test_navigation_endpoint(client):
    response = client.get("/api/navigation")
    assert response.status_code == 200
    data = response.json()
    assert "state" in data
    assert "path" in data
    assert "metrics" in data


def test_decisions_endpoint(client):
    response = client.get("/api/decisions")
    assert response.status_code == 200
    data = response.json()
    assert "decisions" in data


def test_analytics_endpoint(client):
    response = client.get("/api/analytics")
    assert response.status_code == 200
    data = response.json()
    assert "total_missions" in data
    assert "navigation_success_rate" in data
    assert "average_path_efficiency" in data


def test_navigation_transitions_endpoint(client):
    response = client.get("/api/navigation/transitions")
    assert response.status_code == 200
    data = response.json()
    assert "transitions" in data
    assert "current_state" in data


# 5. Obstacle Injection & Detour Scenario Endpoints
def test_navigation_obstacle_scenario_endpoint(client):
    response = client.post("/api/navigation/scenario/obstacle_on_route")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "scenario_started"
    assert "start" in data
    assert "target" in data
    assert "obstacle" in data


def test_navigation_place_and_clear_obstacle_endpoint(client):
    # Place obstacle
    resp_place = client.post("/api/navigation/place_obstacle", json={"x": 5.0, "y": 4.0, "width": 1.0, "height": 1.0, "name": "Test Box"})
    assert resp_place.status_code == 200
    assert resp_place.json()["status"] == "obstacle_placed"

    # Clear obstacles
    resp_clear = client.post("/api/navigation/clear_obstacles")
    assert resp_clear.status_code == 200
    assert resp_clear.json()["status"] == "obstacles_cleared"


# 6. Mission Dispatch, Pause, Resume, Reset Endpoints
def test_mission_lifecycle(client):
    # Reset first
    resp_reset = client.post("/api/mission/reset")
    assert resp_reset.status_code == 200

    # Start mission
    resp_start = client.post("/api/mission/start", json={"prompt": "Find the blue package and navigate to it."})
    assert resp_start.status_code == 200
    assert resp_start.json()["status"] == "started"

    # Pause mission
    resp_pause = client.post("/api/mission/pause")
    assert resp_pause.status_code == 200
    assert resp_pause.json()["status"] == "paused"

    # Resume mission
    resp_resume = client.post("/api/mission/resume")
    assert resp_resume.status_code == 200
    assert resp_resume.json()["status"] == "resumed"

    # Reset
    resp_reset2 = client.post("/api/mission/reset")
    assert resp_reset2.status_code == 200
    assert resp_reset2.json()["status"] == "reset"


def test_emergency_stop_endpoint(client):
    # Enable emergency stop
    resp_enable = client.post("/api/emergency-stop", json={"enable": True})
    assert resp_enable.status_code == 200
    assert resp_enable.json()["emergency_stop"] is True
    assert resp_enable.json()["status"] == "STOPPED"

    # Disable emergency stop
    resp_disable = client.post("/api/emergency-stop", json={"enable": False})
    assert resp_disable.status_code == 200
    assert resp_disable.json()["emergency_stop"] is False
    assert resp_disable.json()["status"] == "OPERATIONAL"


def test_judge_demo_start_endpoint(client):
    resp = client.post("/api/demo/start")
    assert resp.status_code == 200
    assert resp.json()["status"] == "judge_demo_started"


def test_environment_switch_endpoint(client):
    # Switch to office
    resp_office = client.post("/api/environment/switch", json={"environment": "office"})
    assert resp_office.status_code == 200
    assert resp_office.json()["environment"] == "office"

    # Switch back to warehouse
    resp_wh = client.post("/api/environment/switch", json={"environment": "warehouse"})
    assert resp_wh.status_code == 200
    assert resp_wh.json()["environment"] == "warehouse"


# 7. WebSocket Endpoint Verification
def test_websocket_robot_endpoint(client):
    with client.websocket_connect("/ws/robot") as ws:
        # Send heartbeat ping
        ws.send_text("ping")
        response = ws.receive_text()
        assert response == "pong"


# 8. Simulation Speed Endpoints
def test_simulation_speed_endpoints(client):
    # GET initial speed
    resp = client.get("/api/simulation/speed")
    assert resp.status_code == 200
    assert "speed_multiplier" in resp.json()

    # POST new speed multiplier
    resp_set = client.post("/api/simulation/speed", json={"multiplier": 2.5})
    assert resp_set.status_code == 200
    assert resp_set.json()["speed_multiplier"] == 2.5

    # Verify updated speed
    resp_get = client.get("/api/simulation/speed")
    assert resp_get.status_code == 200
    assert resp_get.json()["speed_multiplier"] == 2.5

    # Restore default speed
    resp_restore = client.post("/api/simulation/speed", json={"multiplier": 1.0})
    assert resp_restore.status_code == 200
    assert resp_restore.json()["speed_multiplier"] == 1.0


# 9. Perception Frame Upload & Real-Time Detection
def test_perception_detect_uploaded_frame(client):
    import base64
    import numpy as np
    import cv2

    # Create synthetic test frame with a blue square package (BGR: 255, 0, 0)
    img = np.zeros((200, 200, 3), dtype=np.uint8)
    img[50:150, 50:150] = [255, 0, 0]  # Bright blue block
    _, buffer = cv2.imencode(".png", img)
    b64_str = f"data:image/png;base64,{base64.b64encode(buffer).decode('utf-8')}"

    # Test upload detection with webcam mode tag
    resp = client.post("/api/perception/detect_uploaded_frame", json={
        "image_base64": b64_str,
        "source": "webcam"
    })
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "success"
    assert data["source"] == "WEBCAM MODE"
    assert data["detections_count"] >= 1
    pkg_det = next((d for d in data["detections"] if d["class_name"] == "package"), None)
    assert pkg_det is not None
    assert pkg_det["attribute"] == "blue"
    assert pkg_det["is_target"] is True
    assert pkg_det["is_fallback"] is True
    assert "bbox" in pkg_det
    assert "distance" in pkg_det

    # Test invalid base64 payload error handling
    resp_bad = client.post("/api/perception/detect_uploaded_frame", json={
        "image_base64": "not_valid_base64_data!!!",
        "source": "upload"
    })
    assert resp_bad.status_code == 400


# 10. Mission Section 20 Metrics & Latest Completed Mission
def test_mission_endpoint_section_20_metrics(client):
    resp = client.get("/api/mission")
    assert resp.status_code == 200
    data = resp.json()
    assert "active" in data
    assert "latest_completed_mission" in data
    assert "history_count" in data
    assert "recent_history" in data
    assert "pipeline_stage" in data
