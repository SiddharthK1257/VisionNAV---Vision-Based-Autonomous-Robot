"""Tests for kinematics conversions, scene understanding, unreachable targets, and new API routes."""
import math
import base64
import numpy as np
import cv2
import pytest
from fastapi.testclient import TestClient

from backend.app.main import app, simulator
from backend.app.simulation.robot import SimulatedRobot
from backend.app.navigation.occupancy_grid import OccupancyGrid
from backend.app.navigation.planner import AStarPlanner
from backend.app.models.world import StaticObstacle
from backend.app.perception.scene_understanding import SceneUnderstandingEngine
from backend.app.models.robot import Pose2D

client = TestClient(app)


def test_differential_drive_kinematics_roundtrip():
    """Verify differential-drive kinematics formulas:
    v_left = v - w * L / 2
    v_right = v + w * L / 2
    v = (v_right + v_left) / 2
    w = (v_right - v_left) / L
    """
    wheel_base = 0.45
    linear_cmd = 0.50
    angular_cmd = 0.80

    v_left, v_right = SimulatedRobot.twist_to_wheels(linear_cmd, angular_cmd, wheel_base)
    assert v_left == pytest.approx(0.50 - 0.80 * 0.45 / 2.0, abs=1e-3)
    assert v_right == pytest.approx(0.50 + 0.80 * 0.45 / 2.0, abs=1e-3)

    # Invert back to twist
    v_rec, w_rec = SimulatedRobot.wheels_to_twist(v_left, v_right, wheel_base)
    assert v_rec == pytest.approx(linear_cmd, abs=1e-3)
    assert w_rec == pytest.approx(angular_cmd, abs=1e-3)


def test_scene_understanding_module():
    """Verify Scene Understanding engine produces structured and explainable output."""
    engine = SceneUnderstandingEngine()
    grid = OccupancyGrid(width=20.0, height=14.0, resolution=0.2)
    robot_pose = Pose2D(x=2.0, y=2.0, theta=0.0)

    result = engine.analyze(
        detections=[],
        tracked_objects=[],
        robot_pose=robot_pose,
        occupancy_grid=grid,
        static_obstacles=[],
        dynamic_obstacles=[],
        target_objective=None,
        navigation_status=simulator.navigator.status,
        nearest_distance=3.5
    )

    assert result.navigable_space is not None
    assert len(result.concise_explanation) > 0
    assert "clearance" in result.navigable_space.lower() or "unobstructed" in result.navigable_space.lower()


def test_unreachable_target_handling():
    """Verify A* planner gracefully returns None when a target is completely walled off."""
    grid = OccupancyGrid(width=10.0, height=10.0, resolution=0.2)
    # Box in target at (5.0, 5.0) with four solid walls
    walls = [
        StaticObstacle(id="w1", name="Wall 1", class_name="wall", x=5.0, y=4.2, width=2.0, height=0.4),
        StaticObstacle(id="w2", name="Wall 2", class_name="wall", x=5.0, y=5.8, width=2.0, height=0.4),
        StaticObstacle(id="w3", name="Wall 3", class_name="wall", x=4.2, y=5.0, width=0.4, height=2.0),
        StaticObstacle(id="w4", name="Wall 4", class_name="wall", x=5.8, y=5.0, width=0.4, height=2.0),
    ]
    grid.load_static_obstacles(walls)
    planner = AStarPlanner(grid)

    start = (1.0, 1.0)
    goal = (5.0, 5.0)
    plan = planner.plan_path(start, goal)
    # Target inside impenetrable box is unreachable
    assert plan is None or not plan.is_valid or len(plan.waypoints) == 0


def test_get_mission_endpoint():
    """Verify GET /api/mission returns structured mission status."""
    res = client.get("/api/mission")
    assert res.status_code == 200
    data = res.json()
    assert "active" in data
    assert "state" in data
    assert "pipeline_stage" in data
    assert "metrics" in data


def test_detect_uploaded_frame_endpoint():
    """Verify POST /api/perception/detect_uploaded_frame processes base64 images."""
    # Create a synthetic image with a blue rectangle
    img = np.zeros((240, 320, 3), dtype=np.uint8)
    # BGR blue: high blue, low red/green
    img[60:140, 80:180] = [220, 100, 20]
    _, buffer = cv2.imencode(".jpg", img)
    b64_str = base64.b64encode(buffer).decode("utf-8")

    res = client.post("/api/perception/detect_uploaded_frame", json={
        "image_base64": b64_str,
        "source": "webcam"
    })
    assert res.status_code == 200
    data = res.json()
    assert data["status"] == "success"
    assert data["source"] == "WEBCAM MODE"
    assert "detections" in data
    assert data["detections_count"] >= 1
    assert data["detections"][0]["class_name"] == "package"
    assert data["detections"][0]["attribute"] == "blue"
