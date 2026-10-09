"""Comprehensive verification tests for VisionNav AI Simulation Environment."""
import math
import time
import pytest
from fastapi.testclient import TestClient

from backend.app.main import app, simulator
from backend.app.simulation.simulator import SimulationCoordinator
from backend.app.simulation.environment import create_warehouse_environment, EnvironmentType
from backend.app.simulation.robot import SimulatedRobot
from backend.app.simulation.sensors import (
    SimulatedLiDAR,
    SimulatedRGBCamera,
    SimulatedDepthCamera,
    SimulatedIMU,
    SimulatedOdometrySensor
)
from backend.app.models.robot import Pose2D, Twist2D, ControlMode


client = TestClient(app)


class TestWarehouseEnvironment:
    """Requirement 1, 7, 8, 9, 10: Realistic Warehouse, Obstacles, Person, Targets."""

    def test_warehouse_dimensions_and_perimeter_walls(self):
        env = create_warehouse_environment()
        assert env.width == 20.0
        assert env.height == 14.0
        assert env.robot_start == (2.0, 2.0, 0.0)

        # Check perimeter walls exist
        wall_ids = [obs.id for obs in env.static_obstacles if obs.class_name == "wall"]
        assert "wall_north" in wall_ids
        assert "wall_south" in wall_ids
        assert "wall_west" in wall_ids
        assert "wall_east" in wall_ids

    def test_warehouse_static_storage_racks_and_furniture(self):
        env = create_warehouse_environment()
        shelf_ids = [obs.id for obs in env.static_obstacles if obs.class_name == "shelf"]
        assert "shelf_1" in shelf_ids
        assert "shelf_2" in shelf_ids
        assert "shelf_3" in shelf_ids

        table_ids = [obs.id for obs in env.static_obstacles if obs.class_name == "table"]
        assert "table_pack" in table_ids
        assert "table_inspect" in table_ids

    def test_warehouse_targets_and_key_objects(self):
        env = create_warehouse_environment()
        tgt_ids = [t.id for t in env.targets]
        assert "tgt_blue_box" in tgt_ids
        assert "tgt_charge" in tgt_ids
        assert "tgt_inspect" in tgt_ids
        assert "tgt_red_box" in tgt_ids

        blue_pkg = next(t for t in env.targets if t.id == "tgt_blue_box")
        assert blue_pkg.attribute == "blue"
        assert blue_pkg.class_name == "box"
        assert blue_pkg.x == 16.5
        assert blue_pkg.y == 5.5

    def test_simulated_person_dynamic_obstacle(self):
        env = create_warehouse_environment()
        assert len(env.dynamic_obstacles) >= 1
        person = env.dynamic_obstacles[0]
        assert person.class_name == "person"
        assert "Alex" in person.name
        assert person.speed > 0
        assert len(person.waypoints) >= 4
        assert person.radius >= 0.35


class TestDifferentialDriveRobot:
    """Requirement 2: Differential-drive robot kinematics and behavior."""

    def test_robot_spawn(self):
        robot = SimulatedRobot(start_pose=(2.0, 2.0, 0.0))
        assert robot.state.pose.x == 2.0
        assert robot.state.pose.y == 2.0
        assert robot.state.pose.theta == 0.0
        assert robot.state.status == "IDLE"
        assert robot.state.battery.percentage > 90.0

    def test_robot_forward_motion(self):
        robot = SimulatedRobot(start_pose=(2.0, 2.0, 0.0))
        robot.set_target_velocity(0.5, 0.0)
        # Step kinematics
        for _ in range(20):
            robot.step(0.05)

        assert robot.state.pose.x > 2.0
        assert robot.state.pose.y == pytest.approx(2.0, abs=1e-3)
        assert robot.state.twist.linear > 0.0
        assert robot.total_distance > 0.0
        assert robot.left_ticks > 0
        assert robot.right_ticks > 0

    def test_robot_reverse_motion(self):
        robot = SimulatedRobot(start_pose=(5.0, 5.0, 0.0))
        robot.set_target_velocity(-0.4, 0.0)
        for _ in range(20):
            robot.step(0.05)

        assert robot.state.pose.x < 5.0
        assert robot.state.twist.linear < 0.0
        assert robot.left_ticks < 0
        assert robot.right_ticks < 0

    def test_robot_in_place_rotation(self):
        robot = SimulatedRobot(start_pose=(2.0, 2.0, 0.0))
        robot.set_target_velocity(0.0, 0.8)
        for _ in range(20):
            robot.step(0.05)

        # Wheels must spin in opposite directions for pure rotation
        assert robot.state.wheels.left < 0
        assert robot.state.wheels.right > 0
        assert robot.state.pose.theta > 0.0  # counter-clockwise rotation

    def test_kinematic_velocity_clamping(self):
        robot = SimulatedRobot()
        # Request speed exceeding limits
        robot.set_target_velocity(5.0, 10.0)
        assert robot.state.target_twist.linear <= robot.kinematics.max_linear_velocity
        assert robot.state.target_twist.angular <= robot.kinematics.max_angular_velocity


class TestSensors:
    """Requirement 3, 4, 5, 6: RGB Camera, Depth/LiDAR, Odometry, IMU."""

    def test_front_rgb_camera_capture(self):
        env = create_warehouse_environment()
        camera = SimulatedRGBCamera(width=320, height=240, fov_deg=80.0)
        frame = camera.capture(
            Pose2D(x=2.0, y=2.0, theta=0.0),
            env.static_obstacles,
            env.dynamic_obstacles,
            env.targets
        )
        assert frame.width == 320
        assert frame.height == 240
        assert frame.fov_degrees == 80.0
        assert frame.image_base64 is not None
        assert frame.image_base64.startswith("data:image/jpeg;base64,")

    def test_depth_camera_scan(self):
        env = create_warehouse_environment()
        depth_cam = SimulatedDepthCamera(fov_deg=80.0, num_columns=80, min_range=0.2, max_range=8.0)
        depth_data = depth_cam.scan(
            Pose2D(x=2.0, y=2.0, theta=0.0),
            env.static_obstacles,
            env.dynamic_obstacles,
            env.targets
        )
        assert len(depth_data.ranges) == 80
        assert depth_data.min_range == 0.2
        assert depth_data.max_range == 8.0
        assert depth_data.nearest_distance > 0.0
        assert depth_data.depth_image_base64.startswith("data:image/jpeg;base64,")

    def test_lidar_360_scan(self):
        env = create_warehouse_environment()
        lidar = SimulatedLiDAR(rays=72, max_range=8.0)
        hits, nearest = lidar.scan(
            Pose2D(x=2.0, y=2.0, theta=0.0),
            env.static_obstacles,
            env.dynamic_obstacles,
            env.targets
        )
        assert len(hits) == 72
        assert nearest <= 8.0
        # Robot is at (2.0, 2.0), west wall is at x=0.2 (dist ~1.8m)
        assert nearest < 3.0

    def test_imu_simulation(self):
        imu = SimulatedIMU()
        # Robot accelerating forward
        data = imu.update(Twist2D(linear=0.4, angular=0.1), theta=0.5, dt=0.05)
        assert data.linear_acceleration_z == pytest.approx(9.81, abs=0.2)  # gravity ~9.81 m/s^2
        assert data.yaw == 0.5
        assert abs(data.angular_velocity_z) > 0.0

    def test_odometry_sensor(self):
        odom_sensor = SimulatedOdometrySensor()
        odom = odom_sensor.update(
            pose=Pose2D(x=3.14, y=2.71, theta=0.8),
            twist=Twist2D(linear=0.4, angular=0.1),
            total_distance=1.25,
            left_ticks=1024,
            right_ticks=1024,
            left_rad_s=4.0,
            right_rad_s=4.0
        )
        assert odom.pose.x == 3.14
        assert odom.total_distance == 1.25
        assert odom.frame_id == "odom"
        assert odom.child_frame_id == "base_footprint"


class TestPerceptionSensorDataIntegration:
    """Requirement 11: All sensor data available to perception layer."""

    def test_object_detector_sensor_fusion(self):
        sim = SimulationCoordinator()
        sim.step()
        assert sim.current_camera_frame is not None
        assert sim.current_depth_scan is not None
        # Detections should have depth-fused distances
        assert len(sim.current_detections) > 0
        for det in sim.current_detections:
            assert det.distance > 0.0
            assert det.confidence > 0.5
            assert det.bbox.width > 0.0
            assert det.bbox.height > 0.0


class TestProgrammaticMovement:
    """Requirement 12: Programmatic robot movement control."""

    def test_coordinator_programmatic_forward_velocity(self):
        sim = SimulationCoordinator()
        initial_x = sim.robot.state.pose.x
        sim.set_manual_velocity(0.5, 0.0, duration=1.0)
        assert sim.control_mode == ControlMode.PROGRAMMATIC

        for _ in range(15):
            sim.step()

        assert sim.robot.state.pose.x > initial_x
        assert sim.robot.state.twist.linear > 0.0

    def test_coordinator_programmatic_rotation(self):
        sim = SimulationCoordinator()
        sim.set_manual_velocity(0.0, 0.8, duration=1.0)
        for _ in range(15):
            sim.step()

        assert abs(sim.robot.state.pose.theta) > 0.01

    def test_coordinator_move_robot_directional(self):
        sim = SimulationCoordinator()
        sim.move_robot("forward", speed=0.3, duration=0.5)
        sim.step()
        assert sim.robot.state.target_twist.linear == pytest.approx(0.3)

        sim.move_robot("rotate_left", speed=0.4, duration=0.5)
        sim.step()
        assert sim.robot.state.target_twist.angular > 0.0

        sim.move_robot("stop")
        sim.step()
        assert sim.robot.state.target_twist.linear == 0.0
        assert sim.robot.state.target_twist.angular == 0.0


class TestBackendStateExposition:
    """Requirement 13: Expose robot state and sensors to backend REST API."""

    def test_robot_state_endpoint(self):
        res = client.get("/api/robot/state")
        assert res.status_code == 200
        data = res.json()
        assert "pose" in data
        assert "twist" in data
        assert "wheels" in data
        assert "battery" in data
        assert "odometry_distance" in data

    def test_cmd_vel_endpoint(self):
        res = client.post("/api/robot/cmd_vel", json={"linear": 0.35, "angular": 0.2, "duration": 1.0})
        assert res.status_code == 200
        data = res.json()
        assert data["status"] == "command_accepted"
        assert data["linear"] == 0.35
        assert data["angular"] == 0.2

    def test_move_endpoint(self):
        res = client.post("/api/robot/move", json={"direction": "forward", "speed": 0.4, "duration": 1.0})
        assert res.status_code == 200
        data = res.json()
        assert data["status"] == "executing"
        assert data["direction"] == "forward"

    def test_stop_endpoint(self):
        res = client.post("/api/robot/stop")
        assert res.status_code == 200
        data = res.json()
        assert data["status"] == "stopped"

    def test_sensors_full_suite(self):
        res = client.get("/api/sensors")
        assert res.status_code == 200
        data = res.json()
        assert "camera_fps" in data
        assert "lidar_points_count" in data
        assert "nearest_obstacle" in data
        assert "odometry" in data
        assert "imu" in data
        assert "camera_info" in data
        assert "depth_info" in data

    def test_camera_rgb_endpoint(self):
        res = client.get("/api/camera/rgb")
        assert res.status_code == 200
        data = res.json()
        assert data["width"] == 320
        assert data["height"] == 240
        assert data["image_base64"].startswith("data:image/jpeg;base64,")

    def test_camera_depth_endpoint(self):
        res = client.get("/api/camera/depth")
        assert res.status_code == 200
        data = res.json()
        assert len(data["ranges"]) == 80
        assert data["depth_image_base64"].startswith("data:image/jpeg;base64,")

    def test_odometry_endpoint(self):
        res = client.get("/api/sensors/odometry")
        assert res.status_code == 200
        data = res.json()
        assert "pose" in data
        assert "total_distance" in data
        assert "left_ticks" in data
        assert "right_ticks" in data

    def test_imu_endpoint(self):
        res = client.get("/api/sensors/imu")
        assert res.status_code == 200
        data = res.json()
        assert "linear_acceleration_z" in data
        assert "angular_velocity_z" in data
        assert "yaw" in data

    def test_world_endpoint(self):
        res = client.get("/api/world")
        assert res.status_code == 200
        data = res.json()
        assert data["environment_type"] == "warehouse"
        assert len(data["static_obstacles"]) > 0
        assert len(data["dynamic_obstacles"]) > 0
        assert len(data["targets"]) > 0
