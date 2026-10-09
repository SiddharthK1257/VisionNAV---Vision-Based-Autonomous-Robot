"""
Comprehensive Verification Tests for Autonomous Navigation Pipeline and Dynamic Replanning.

Pipeline:
Mission -> Target identification -> Target localization -> Navigation goal ->
Global path -> Local path -> Obstacle checking -> Velocity controller -> Robot movement.

Scenario:
Robot starts at A, target is at B, obstacle placed directly on route:
1. Robot detects obstacle.
2. Robot does not drive through it.
3. Robot slows/stops.
4. Local environment is updated.
5. New route is calculated.
6. Robot follows new route.
7. Robot reaches B.
"""
import math
import time
import pytest
from fastapi.testclient import TestClient

from backend.app.main import app, simulator
from backend.app.navigation.occupancy_grid import OccupancyGrid
from backend.app.navigation.planner import AStarPlanner
from backend.app.navigation.navigator import AutonomousNavigator
from backend.app.navigation.velocity_controller import VelocityController
from backend.app.models.navigation import (
    NavigationPipelineStage,
    NavigationStateEnum,
    TargetObjective,
    Waypoint
)
from backend.app.models.robot import Pose2D, Twist2D
from backend.app.models.perception import Detection, BoundingBox
from backend.app.models.world import StaticObstacle, DynamicObstacle, TargetLocation

client = TestClient(app)


class TestAutonomousPipelineStages:
    """Verifies all 9 stages of the autonomous navigation pipeline."""

    def test_pipeline_initialization_to_localization(self):
        grid = OccupancyGrid(width=20.0, height=14.0, resolution=0.2)
        nav = AutonomousNavigator(grid)
        robot_pose = Pose2D(x=2.0, y=2.0, theta=0.0)

        # 1. Mission
        objective = TargetObjective(
            raw_prompt="Find the blue package and navigate to it.",
            target_type="object",
            target_class="box",
            target_attribute="blue"
        )
        nav.initiate_mission(objective, robot_pose)

        assert nav.status.state == NavigationStateEnum.TARGET_SEARCHING
        assert nav.status.pipeline_stage == NavigationPipelineStage.TARGET_IDENTIFICATION.value
        assert len(nav.status.state_history) >= 2
        assert nav.status.state_history[0].to_state == NavigationStateEnum.MISSION_RECEIVED.value
        assert nav.status.state_history[1].to_state == NavigationStateEnum.TARGET_SEARCHING.value

        # 2. Target Identification & 3. Localization
        detection = Detection(
            track_id="trk_01",
            class_name="box",
            confidence=0.94,
            distance=4.5,
            bbox=BoundingBox(x=0.45, y=0.35, width=0.10, height=0.15),
            position_3d=(4.5, 0.0, 0.0),
            is_target=True,
            attribute="blue"
        )

        success = nav.process_target_identification([detection], robot_pose)
        assert success is True

        # Check Target Localization record
        assert nav.status.target_localization is not None
        assert nav.status.target_localization.confirmed is True
        assert nav.status.target_localization.world_x > 2.0
        assert nav.status.target_localization.confidence == 0.94

        # 4. Navigation Goal
        assert nav.status.current_goal is not None
        assert nav.status.goal_name is not None

        # 5. Global Path & 6. Local Path
        assert len(nav.status.global_path.waypoints) >= 2
        assert len(nav.status.local_path.waypoints) >= 1
        assert nav.status.state == NavigationStateEnum.NAVIGATING
        assert nav.status.pipeline_stage == NavigationPipelineStage.OBSTACLE_CHECKING.value


class TestVelocityController:
    """Verifies Velocity Controller pure pursuit, acceleration limits, and safety braking."""

    def test_velocity_controller_stopping_state(self):
        controller = VelocityController()
        pose = Pose2D(x=2.0, y=2.0, theta=0.0)
        twist = Twist2D(linear=0.40, angular=0.0)

        # Braking command during ROBOT_STOPPING
        cmd = controller.compute_command(
            robot_pose=pose,
            current_twist=twist,
            target_waypoint=None,
            dist_to_goal=5.0,
            nearest_obstacle_dist=1.0,
            nav_state=NavigationStateEnum.ROBOT_STOPPING,
            dt=0.1
        )
        assert cmd.linear < twist.linear, "Velocity should decelerate during stopping"
        assert cmd.linear >= 0.0

        # Full zero when stopped
        cmd_stopped = controller.compute_command(
            robot_pose=pose,
            current_twist=Twist2D(linear=0.0, angular=0.0),
            target_waypoint=None,
            dist_to_goal=5.0,
            nearest_obstacle_dist=1.0,
            nav_state=NavigationStateEnum.ROBOT_STOPPED,
            dt=0.1
        )
        assert cmd_stopped.linear == 0.0
        assert cmd_stopped.angular == 0.0

    def test_velocity_controller_pure_pursuit_heading(self):
        controller = VelocityController()
        pose = Pose2D(x=2.0, y=2.0, theta=0.0)
        # Waypoint directly to the left (90 degrees, y=3.0)
        target_wp = Waypoint(x=2.0, y=3.0, theta=0.0)

        cmd = controller.compute_command(
            robot_pose=pose,
            current_twist=Twist2D(linear=0.1, angular=0.0),
            target_waypoint=target_wp,
            dist_to_goal=3.0,
            nearest_obstacle_dist=999.0,
            nav_state=NavigationStateEnum.NAVIGATING,
            dt=0.05
        )
        assert cmd.angular > 0.3, "Angular velocity should command positive turn towards left waypoint"


class TestObstacleScenario:
    """
    Tests the exact scenario specified by the user:
    Robot starts at A.
    Target is at B.
    An obstacle is placed directly on the original route.

    Expected behavior:
    1. Robot detects obstacle.
    2. Robot does not drive through it.
    3. Robot slows/stops.
    4. Local environment is updated.
    5. New route is calculated.
    6. Robot follows new route.
    7. Robot reaches B.
    """

    def test_full_scenario_execution(self):
        simulator.start_obstacle_scenario(start_pos=(2.0, 3.0), target_pos=(10.0, 3.0))

        # Check initial state
        assert simulator.robot.state.pose.x == pytest.approx(2.0, abs=0.1)
        assert simulator.robot.state.pose.y == pytest.approx(3.0, abs=0.1)
        assert len(simulator.placed_obstacles) == 1

        placed_obs = simulator.placed_obstacles[0]
        assert placed_obs.x == pytest.approx(6.0, abs=0.1)
        assert placed_obs.y == pytest.approx(3.0, abs=0.1)

        # Simulator should have planned an initial route towards B
        assert simulator.navigator.status.current_goal is not None

        # Track scenario milestones
        obstacle_detected = False
        robot_stopped = False
        map_updated = False
        replan_occurred = False
        target_reached = False
        min_distance_to_obstacle = 999.0

        # Step simulation iteratively (simulating 20 Hz loop)
        max_steps = 600  # Up to 30 seconds of simulated time
        for step_idx in range(max_steps):
            simulator.step()

            pose = simulator.robot.state.pose
            twist = simulator.robot.state.twist
            nav_state = simulator.navigator.status.state

            # Measure physical distance to the placed obstacle
            dist_to_obs = math.hypot(placed_obs.x - pose.x, placed_obs.y - pose.y)
            min_distance_to_obstacle = min(min_distance_to_obstacle, dist_to_obs)

            # 1. Detect obstacle
            if nav_state == NavigationStateEnum.OBSTACLE_DETECTED or simulator.navigator.status.active_obstacle is not None:
                obstacle_detected = True

            # 2 & 3. Robot does not drive through it; slows/stops
            if nav_state in [NavigationStateEnum.ROBOT_STOPPING, NavigationStateEnum.ROBOT_STOPPED]:
                if twist.linear <= 0.05:
                    robot_stopped = True

            # 4. Local environment updated
            if nav_state == NavigationStateEnum.LOCAL_MAP_UPDATED or len(simulator.grid.local_obstacles) > 0:
                map_updated = True

            # 5. New route calculated
            if simulator.navigator.status.metrics.replans_count > 0:
                replan_occurred = True

            # 7. Robot reaches B
            if nav_state == NavigationStateEnum.TARGET_REACHED:
                target_reached = True
                break

        # Verification of Expected Behavior:
        # 1. Robot detects obstacle
        assert obstacle_detected is True, "Expected robot to detect the obstacle on route"

        # 2. Robot does not drive through it (cleared obstacle without crashing)
        # Critical safety boundary is 0.45m + obstacle footprint
        assert min_distance_to_obstacle >= 0.50, f"Robot violated obstacle safety envelope! Min dist: {min_distance_to_obstacle}m"

        # 3. Robot slows/stops
        assert robot_stopped is True, "Expected robot to slow down and come to a safe stop"

        # 4. Local environment is updated
        assert map_updated is True, "Expected local occupancy costmap to register obstacle"
        # Grid cell at obstacle must not be free
        c, r = simulator.grid.world_to_grid(placed_obs.x, placed_obs.y)
        assert not simulator.grid.is_free(c, r), "Grid cell at obstacle location should be occupied"

        # 5. New route is calculated
        assert replan_occurred is True, "Expected dynamic replanning to calculate new route"

        # 6 & 7. Robot follows new route and reaches B
        assert target_reached is True, "Expected robot to successfully reach destination B along replanned route"

        # Verify state history captures every single transition
        history = simulator.navigator.status.state_history
        recorded_states = [rec.to_state for rec in history]

        assert NavigationStateEnum.MISSION_RECEIVED.value in recorded_states
        assert NavigationStateEnum.GLOBAL_PATH_COMPUTED.value in recorded_states
        assert NavigationStateEnum.OBSTACLE_DETECTED.value in recorded_states
        assert NavigationStateEnum.ROBOT_STOPPING.value in recorded_states
        assert NavigationStateEnum.ROBOT_STOPPED.value in recorded_states
        assert NavigationStateEnum.LOCAL_MAP_UPDATED.value in recorded_states
        assert NavigationStateEnum.REPLANNING.value in recorded_states
        assert NavigationStateEnum.NEW_ROUTE_CALCULATED.value in recorded_states
        assert NavigationStateEnum.TARGET_REACHED.value in recorded_states


class TestScenarioAPIEndpoints:
    """Verifies scenario trigger and state transition inspection via REST endpoints."""

    def test_scenario_trigger_endpoint(self):
        resp = client.post("/api/navigation/scenario/obstacle_on_route")
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "scenario_started"
        assert data["start"] == [2.0, 3.0]
        assert data["target"] == [10.0, 3.0]
        assert data["obstacle"] == [6.0, 3.0]

    def test_transitions_endpoint(self):
        resp = client.get("/api/navigation/transitions")
        assert resp.status_code == 200
        data = resp.json()
        assert "transitions" in data
        assert "current_state" in data
        assert "pipeline_stage" in data
        assert len(data["transitions"]) > 0

    def test_place_obstacle_endpoint(self):
        resp = client.post("/api/navigation/place_obstacle", json={
            "x": 8.0,
            "y": 4.0,
            "width": 1.0,
            "height": 1.0,
            "name": "Dynamic Hazard Crate"
        })
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "obstacle_placed"
        assert data["obstacle"]["x"] == 8.0
        assert data["obstacle"]["y"] == 4.0

    def test_clear_obstacles_endpoint(self):
        resp = client.post("/api/navigation/clear_obstacles")
        assert resp.status_code == 200
        assert resp.json()["status"] == "obstacles_cleared"
