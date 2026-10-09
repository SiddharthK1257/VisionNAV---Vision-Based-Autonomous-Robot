"""Autonomous Navigator: 9-Stage Autonomous Pipeline and Dynamic Replanning State Machine."""
import math
import time
from typing import Optional, Tuple, List, Dict, Any
from ..models.navigation import (
    NavigationPipelineStage,
    NavigationStateEnum,
    NavigationStatus,
    PathPlan,
    Waypoint,
    NavigationMetrics,
    TargetObjective,
    StateTransitionRecord,
    TargetLocalizationData,
    ObstacleDetectionData
)
from ..models.robot import Pose2D, Twist2D, DepthScanData
from ..models.world import DynamicObstacle, StaticObstacle
from ..models.perception import Detection
from .occupancy_grid import OccupancyGrid
from .planner import AStarPlanner
from .velocity_controller import VelocityController


class AutonomousNavigator:
    """Master Autonomous Navigation Engine executing the full 9-step pipeline:
    Mission -> Target identification -> Target localization -> Navigation goal ->
    Global path -> Local path -> Obstacle checking -> Velocity controller -> Robot movement.
    """

    def __init__(self, occupancy_grid: OccupancyGrid):
        self.grid = occupancy_grid
        self.planner = AStarPlanner(self.grid)
        self.velocity_controller = VelocityController()
        self.status = NavigationStatus()
        self.active_objective: Optional[TargetObjective] = None

        self.lookahead_dist = 0.50
        self.waypoint_tolerance = 0.25  # Tighter waypoint radius to prevent corner cutting
        self.goal_tolerance = 0.50  # Arrival radius (m)
        self.start_time: Optional[float] = None
        self.nominal_speed = 0.45   # m/s
        self.last_replan_timestamp = 0.0

        # Pending obstacle info for multi-step stopping & replanning
        self.pending_obstacle: Optional[Dict[str, Any]] = None

    def record_transition(
        self,
        to_state: NavigationStateEnum,
        stage: NavigationPipelineStage,
        reason: str,
        details: Optional[Dict[str, Any]] = None
    ):
        """Records state transition into history log with timestamp and stage."""
        from_state_val = self.status.state.value if hasattr(self.status.state, 'value') else str(self.status.state)
        to_state_val = to_state.value if hasattr(to_state, 'value') else str(to_state)
        now = time.time()
        time_str = time.strftime("%H:%M:%S", time.localtime(now)) + f".{int((now % 1) * 1000):03d}"

        record = StateTransitionRecord(
            timestamp=now,
            time_str=time_str,
            from_state=from_state_val,
            to_state=to_state_val,
            stage=stage.value,
            reason=reason,
            details=details or {}
        )
        self.status.state_history.append(record)
        # Keep last 50 transitions
        if len(self.status.state_history) > 50:
            self.status.state_history.pop(0)

        self.status.state = to_state
        self.status.pipeline_stage = stage.value

    def initiate_mission(self, objective: TargetObjective, robot_pose: Pose2D):
        """Step 1: Mission initiation without hardcoded target coordinates."""
        self.active_objective = objective
        self.status.current_goal = None
        self.status.goal_name = objective.target_class or objective.location_name or "Target"
        self.status.path = PathPlan()
        self.status.global_path = PathPlan()
        self.status.local_path = PathPlan()
        self.status.current_waypoint_index = 0
        self.status.target_localization = None
        self.status.active_obstacle = None
        self.pending_obstacle = None
        self.start_time = time.time()
        self.status.metrics = NavigationMetrics()

        self.record_transition(
            to_state=NavigationStateEnum.MISSION_RECEIVED,
            stage=NavigationPipelineStage.MISSION,
            reason=f"Mission objective received: '{objective.raw_prompt}'",
            details={"raw_prompt": objective.raw_prompt, "target_type": objective.target_type}
        )

        self.record_transition(
            to_state=NavigationStateEnum.TARGET_SEARCHING,
            stage=NavigationPipelineStage.TARGET_IDENTIFICATION,
            reason=f"Searching visual field of view to identify target '{self.status.goal_name}'",
            details={"target_class": objective.target_class, "target_attribute": objective.target_attribute}
        )

    def process_target_identification(
        self,
        detections: List[Detection],
        robot_pose: Pose2D,
        depth_scan: Optional[DepthScanData] = None,
        manual_target_hint: Optional[Tuple[float, float]] = None
    ) -> bool:
        """Steps 2, 3, 4, 5, 6: Visual Identification -> Localization -> Goal -> Global Path -> Local Path."""
        if not self.active_objective:
            return False

        # Look for target in detections matching objective class or attribute or marked is_target
        matched_det: Optional[Detection] = None
        for d in detections:
            if d.is_target:
                matched_det = d
                break
            if self.active_objective.target_class and d.class_name.lower() == self.active_objective.target_class.lower():
                if not self.active_objective.target_attribute or d.attribute == self.active_objective.target_attribute:
                    matched_det = d
                    break

        # Fallback to hint if provided and no detection in FOV yet
        if not matched_det and manual_target_hint:
            dist = math.hypot(manual_target_hint[0] - robot_pose.x, manual_target_hint[1] - robot_pose.y)
            # Simulate detection if close enough or known
            target_world_x, target_world_y = manual_target_hint
            confidence = 0.95
            target_name = self.status.goal_name or "Target"
        elif matched_det:
            target_name = f"{matched_det.attribute or ''} {matched_det.class_name}".strip().title()
            confidence = matched_det.confidence
            dist = matched_det.distance
            # Target ground-plane world coordinate calculation (Step 3: Target localization)
            center_x = (matched_det.bbox.x + matched_det.bbox.width / 2.0)
            bearing_offset = (center_x - 0.5) * 1.22  # camera horizontal FOV ~ 70 deg (1.22 rad)
            abs_angle = robot_pose.theta + bearing_offset
            target_world_x = round(robot_pose.x + dist * math.cos(abs_angle), 2)
            target_world_y = round(robot_pose.y + dist * math.sin(abs_angle), 2)
        else:
            return False

        # Step 2: Target Identification Transition
        self.record_transition(
            to_state=NavigationStateEnum.TARGET_IDENTIFIED,
            stage=NavigationPipelineStage.TARGET_IDENTIFICATION,
            reason=f"Target '{target_name}' visually identified in camera frame (Confidence: {int(confidence * 100)}%)",
            details={"name": target_name, "confidence": confidence}
        )

        # Step 3: Target Localization Transition
        loc_data = TargetLocalizationData(
            target_class=self.active_objective.target_class or "target",
            target_attribute=self.active_objective.target_attribute,
            target_name=target_name,
            confidence=confidence,
            distance=round(dist, 2),
            world_x=target_world_x,
            world_y=target_world_y,
            confirmed=True
        )
        self.status.target_localization = loc_data

        self.record_transition(
            to_state=NavigationStateEnum.TARGET_LOCALIZED,
            stage=NavigationPipelineStage.TARGET_LOCALIZATION,
            reason=f"Target localized at ({target_world_x:.2f}, {target_world_y:.2f}) with distance {dist:.2f}m",
            details={"world_x": target_world_x, "world_y": target_world_y, "distance": dist}
        )

        # Step 4: Navigation Goal Generation (0.75m safe standoff approach)
        dx = target_world_x - robot_pose.x
        dy = target_world_y - robot_pose.y
        dist_full = math.hypot(dx, dy)
        standoff = 0.75

        if dist_full > standoff:
            goal_x = round(target_world_x - (standoff * dx / dist_full), 2)
            goal_y = round(target_world_y - (standoff * dy / dist_full), 2)
        else:
            goal_x = target_world_x
            goal_y = target_world_y

        # Snap goal to free space in grid
        c, r = self.grid.world_to_grid(goal_x, goal_y)
        if not self.grid.is_free(c, r):
            free_c, free_r = self.planner._find_nearest_free_cell(c, r)
            if free_c is not None:
                goal_x, goal_y = self.grid.grid_to_world(free_c, free_r)

        self.status.current_goal = (goal_x, goal_y)
        self.status.goal_name = target_name

        self.record_transition(
            to_state=NavigationStateEnum.GOAL_SET,
            stage=NavigationPipelineStage.NAVIGATION_GOAL,
            reason=f"Approach goal generated at ({goal_x:.2f}, {goal_y:.2f}) with 0.75m standoff margin",
            details={"goal_x": goal_x, "goal_y": goal_y, "standoff": standoff}
        )

        # Step 5: Global Path Planning
        return self._compute_global_and_local_path(robot_pose, (goal_x, goal_y))

    def _compute_global_and_local_path(self, start_pose: Pose2D, goal: Tuple[float, float]) -> bool:
        """Step 5 & 6: Computes Global A* Path and extracts Local Path window."""
        self.record_transition(
            to_state=NavigationStateEnum.PLANNING_GLOBAL_PATH,
            stage=NavigationPipelineStage.GLOBAL_PATH,
            reason=f"Invoking A* path planner from ({start_pose.x:.2f}, {start_pose.y:.2f}) to ({goal[0]:.2f}, {goal[1]:.2f})",
            details={"start": (start_pose.x, start_pose.y), "goal": goal}
        )

        plan = self.planner.plan_path((start_pose.x, start_pose.y), goal)
        if plan and len(plan.waypoints) > 0:
            self.status.global_path = plan
            self.status.path = plan
            self.status.current_waypoint_index = 0
            self.status.metrics.path_length = plan.total_length
            self.status.metrics.distance_remaining = plan.total_length

            self.record_transition(
                to_state=NavigationStateEnum.GLOBAL_PATH_COMPUTED,
                stage=NavigationPipelineStage.GLOBAL_PATH,
                reason=f"Global path computed: {len(plan.waypoints)} waypoints, {plan.total_length:.2f}m",
                details={"waypoints_count": len(plan.waypoints), "length": plan.total_length}
            )

            # Step 6: Local Path Extraction
            local_plan = self.extract_local_path(start_pose, horizon=2.5)
            self.status.local_path = local_plan

            self.record_transition(
                to_state=NavigationStateEnum.LOCAL_PATH_GENERATED,
                stage=NavigationPipelineStage.LOCAL_PATH,
                reason=f"Extracted local path horizon with {len(local_plan.waypoints)} upcoming waypoints",
                details={"local_waypoints": len(local_plan.waypoints)}
            )

            # Move to NAVIGATING
            self.record_transition(
                to_state=NavigationStateEnum.NAVIGATING,
                stage=NavigationPipelineStage.OBSTACLE_CHECKING,
                reason="Autonomous navigation trajectory tracking active",
                details={"initial_speed": self.nominal_speed}
            )
            return True
        else:
            self.record_transition(
                to_state=NavigationStateEnum.ERROR,
                stage=NavigationPipelineStage.GLOBAL_PATH,
                reason="No collision-free path found to navigation goal",
                details={"goal": goal}
            )
            return False

    def set_goal(self, goal: Tuple[float, float], goal_name: str, start_pose: Pose2D) -> bool:
        """Backwards compatibility direct goal setting."""
        self.status.current_goal = goal
        self.status.goal_name = goal_name
        self.start_time = time.time()
        self.status.metrics = NavigationMetrics()
        return self._compute_global_and_local_path(start_pose, goal)

    def cancel_navigation(self):
        self.record_transition(
            to_state=NavigationStateEnum.IDLE,
            stage=NavigationPipelineStage.MISSION,
            reason="Navigation canceled by operator",
            details={}
        )
        self.status.current_goal = None
        self.status.path = PathPlan()
        self.status.global_path = PathPlan()
        self.status.local_path = PathPlan()
        self.status.current_waypoint_index = 0
        self.active_objective = None
        self.pending_obstacle = None

    def pause_navigation(self):
        if self.status.state in [NavigationStateEnum.NAVIGATING, NavigationStateEnum.TARGET_SEARCHING]:
            self.record_transition(
                to_state=NavigationStateEnum.PAUSED,
                stage=NavigationPipelineStage.VELOCITY_CONTROLLER,
                reason="Navigation temporarily paused by user",
                details={}
            )

    def resume_navigation(self):
        if self.status.state == NavigationStateEnum.PAUSED:
            self.record_transition(
                to_state=NavigationStateEnum.NAVIGATING,
                stage=NavigationPipelineStage.ROBOT_MOVEMENT,
                reason="Navigation resumed by user",
                details={}
            )

    def extract_local_path(self, robot_pose: Pose2D, horizon: float = 2.5) -> PathPlan:
        """Extracts upcoming waypoints within lookahead window horizon along the global path."""
        waypoints = self.status.path.waypoints
        if not waypoints:
            return PathPlan()

        start_idx = self.status.current_waypoint_index
        local_wps = []
        accum_dist = 0.0
        prev_pt = (robot_pose.x, robot_pose.y)

        for i in range(start_idx, len(waypoints)):
            wp = waypoints[i]
            d = math.hypot(wp.x - prev_pt[0], wp.y - prev_pt[1])
            accum_dist += d
            local_wps.append(wp)
            prev_pt = (wp.x, wp.y)
            if accum_dist >= horizon:
                break

        return PathPlan(
            waypoints=local_wps,
            total_length=round(accum_dist, 2),
            generated_at=time.time(),
            is_valid=True
        )

    @staticmethod
    def _dist_point_to_segment(px: float, py: float, x1: float, y1: float, x2: float, y2: float) -> float:
        dx = x2 - x1
        dy = y2 - y1
        l2 = dx * dx + dy * dy
        if l2 == 0:
            return math.hypot(px - x1, py - y1)
        t = max(0.0, min(1.0, ((px - x1) * dx + (py - y1) * dy) / l2))
        return math.hypot(px - (x1 + t * dx), py - (y1 + t * dy))

    def check_corridor_obstacle(
        self,
        robot_pose: Pose2D,
        dynamic_obstacles: List[DynamicObstacle],
        static_obstacles: List[StaticObstacle],
        corridor_radius: float = 0.65
    ) -> Optional[Dict[str, Any]]:
        """Step 7: Obstacle checking.
        Detects if any dynamic or newly placed obstacle directly blocks upcoming path segments or forward trajectory.
        """
        if not self.status.path or not self.status.path.waypoints:
            return None

        # Check upcoming waypoints in the local path corridor (next 8 waypoints)
        remaining_pts = self.status.path.waypoints[self.status.current_waypoint_index:self.status.current_waypoint_index + 8]
        if not remaining_pts:
            return None

        # Path segments starting from robot pose through upcoming waypoints
        path_nodes = [(robot_pose.x, robot_pose.y)] + [(wp.x, wp.y) for wp in remaining_pts]

        # 1. Check Dynamic Obstacles (e.g. humanoid workers)
        for dyn in dynamic_obstacles:
            d_to_robot = math.hypot(dyn.x - robot_pose.x, dyn.y - robot_pose.y)
            # Direct forward vision / proximity check along heading
            if d_to_robot < 1.6:
                angle_to_dyn = math.atan2(dyn.y - robot_pose.y, dyn.x - robot_pose.x)
                angle_err = abs((angle_to_dyn - robot_pose.theta + math.pi) % (2 * math.pi) - math.pi)
                if angle_err < 0.60:
                    return {
                        "id": dyn.id,
                        "name": dyn.name,
                        "x": dyn.x,
                        "y": dyn.y,
                        "radius": dyn.radius,
                        "distance": d_to_robot,
                        "type": "dynamic"
                    }

            # Check corridor segment intersection
            if d_to_robot < 3.5:
                for idx in range(min(8, len(path_nodes) - 1)):
                    p1 = path_nodes[idx]
                    p2 = path_nodes[idx + 1]
                    dist_to_seg = self._dist_point_to_segment(dyn.x, dyn.y, p1[0], p1[1], p2[0], p2[1])
                    if dist_to_seg < (dyn.radius + corridor_radius):
                        return {
                            "id": dyn.id,
                            "name": dyn.name,
                            "x": dyn.x,
                            "y": dyn.y,
                            "radius": dyn.radius,
                            "distance": d_to_robot,
                            "type": "dynamic"
                        }

        # 2. Check Static Obstacles on the route (newly placed unexpected obstacles)
        for obs in static_obstacles:
            # Baseline furniture and walls are already in the static occupancy grid and avoided by A*
            if obs.class_name in ["wall", "shelf"] or obs.is_furniture or obs.attribute in ["rack"]:
                continue

            # Only consider dynamically placed or unexpected obstacles
            is_unexpected = obs.id.startswith("placed_obs_") or obs.attribute in ["unexpected_block", "barrier"]
            if not is_unexpected:
                continue

            # Skip if this obstacle has already been registered in local costmap and replanned around
            already_registered = False
            for local_obs in self.grid.local_obstacles:
                if (local_obs.get("id") and local_obs["id"] == obs.id) or math.hypot(obs.x - local_obs["x"], obs.y - local_obs["y"]) < 0.4:
                    already_registered = True
                    break
            if already_registered:
                continue

            obs_radius = max(0.4, math.hypot(obs.width, obs.height) / 2.0)
            d_to_robot = math.hypot(obs.x - robot_pose.x, obs.y - robot_pose.y)

            # Check corridor segment intersection
            if d_to_robot < 3.5:
                for idx in range(min(8, len(path_nodes) - 1)):
                    p1 = path_nodes[idx]
                    p2 = path_nodes[idx + 1]
                    dist_to_seg = self._dist_point_to_segment(obs.x, obs.y, p1[0], p1[1], p2[0], p2[1])
                    if dist_to_seg < (obs_radius + corridor_radius):
                        return {
                            "id": obs.id,
                            "name": obs.name,
                            "x": obs.x,
                            "y": obs.y,
                            "radius": obs_radius,
                            "distance": d_to_robot,
                            "type": "static_on_route"
                        }

        return None

    def update(
        self,
        robot_pose: Pose2D,
        current_twist: Twist2D,
        dynamic_obstacles: List[DynamicObstacle],
        static_obstacles: List[StaticObstacle],
        nearest_obstacle_dist: float,
        detections: List[Detection],
        dt: float = 0.05
    ) -> Tuple[Twist2D, Optional[str]]:
        """Main Navigator update step synchronizing the 9-stage pipeline and dynamic replanning."""
        now = time.time()
        if self.start_time and self.status.state != NavigationStateEnum.IDLE:
            self.status.metrics.navigation_time = round(now - self.start_time, 1)

        # A. Handlers for stopped or idle states
        if self.status.state in [NavigationStateEnum.IDLE, NavigationStateEnum.PAUSED, NavigationStateEnum.ERROR]:
            return (Twist2D(linear=0.0, angular=0.0), None)

        if self.status.state == NavigationStateEnum.TARGET_REACHED:
            return (Twist2D(linear=0.0, angular=0.0), "TARGET_REACHED")

        # B. Handle Visual Target Searching (Stages 2 & 3)
        if self.status.state == NavigationStateEnum.TARGET_SEARCHING:
            # Attempt to identify and localize target from current detections
            found = self.process_target_identification(detections, robot_pose)
            if found:
                return (Twist2D(linear=0.0, angular=0.0), "TARGET_LOCALIZED")
            else:
                # Pivot in place to visually sweep FOV
                cmd = self.velocity_controller.compute_command(
                    robot_pose=robot_pose,
                    current_twist=current_twist,
                    target_waypoint=None,
                    dist_to_goal=999.0,
                    nearest_obstacle_dist=nearest_obstacle_dist,
                    nav_state=self.status.state,
                    dt=dt
                )
                return (cmd, "SEARCHING")

        # C. Ensure goal exists
        if not self.status.current_goal:
            self.status.state = NavigationStateEnum.IDLE
            return (Twist2D(linear=0.0, angular=0.0), None)

        # D. Check Goal Arrival
        dist_to_goal = math.hypot(
            self.status.current_goal[0] - robot_pose.x,
            self.status.current_goal[1] - robot_pose.y
        )
        self.status.metrics.distance_remaining = round(dist_to_goal, 2)

        if dist_to_goal <= self.goal_tolerance:
            self.record_transition(
                to_state=NavigationStateEnum.TARGET_REACHED,
                stage=NavigationPipelineStage.ROBOT_MOVEMENT,
                reason=f"Successfully arrived at destination target '{self.status.goal_name}' (distance: {dist_to_goal:.2f}m <= {self.goal_tolerance:.2f}m)",
                details={"final_distance": dist_to_goal, "target": self.status.goal_name}
            )
            self.status.path = PathPlan()
            self.status.local_path = PathPlan()
            return (Twist2D(linear=0.0, angular=0.0), "TARGET_REACHED")

        # E. Multi-step Dynamic Replanning State Machine
        # Step 1 -> Step 2 -> Step 3 -> Step 4 -> Step 5 -> Step 6 -> Step 7

        # E1. Handling ROBOT_STOPPING state
        if self.status.state == NavigationStateEnum.ROBOT_STOPPING:
            if current_twist.linear < 0.05 and abs(current_twist.angular) < 0.05:
                # Robot has completely stopped! Transition to ROBOT_STOPPED
                self.record_transition(
                    to_state=NavigationStateEnum.ROBOT_STOPPED,
                    stage=NavigationPipelineStage.VELOCITY_CONTROLLER,
                    reason="Robot brought to safe complete standstill before obstacle",
                    details={"speed": current_twist.linear}
                )
                # Next immediately update local environment
                if self.pending_obstacle:
                    obs_info = self.pending_obstacle
                    self.grid.add_local_obstacle(obs_info["x"], obs_info["y"], obs_info["radius"])
                    self.record_transition(
                        to_state=NavigationStateEnum.LOCAL_MAP_UPDATED,
                        stage=NavigationPipelineStage.OBSTACLE_CHECKING,
                        reason=f"Local costmap updated: Registered obstacle footprint at ({obs_info['x']:.2f}, {obs_info['y']:.2f}) with inflation clearance",
                        details={"obstacle": obs_info}
                    )
                    # Next trigger replanning
                    self.record_transition(
                        to_state=NavigationStateEnum.REPLANNING,
                        stage=NavigationPipelineStage.GLOBAL_PATH,
                        reason="Dynamic A* replanner computing new collision-free detour around obstacle",
                        details={"start": (robot_pose.x, robot_pose.y), "goal": self.status.current_goal}
                    )
                    new_plan = self.planner.plan_path((robot_pose.x, robot_pose.y), self.status.current_goal)
                    if new_plan and len(new_plan.waypoints) > 0:
                        self.status.path = new_plan
                        self.status.global_path = new_plan
                        self.status.current_waypoint_index = 0
                        self.status.metrics.replans_count += 1
                        self.last_replan_timestamp = now

                        self.record_transition(
                            to_state=NavigationStateEnum.NEW_ROUTE_CALCULATED,
                            stage=NavigationPipelineStage.GLOBAL_PATH,
                            reason=f"New detour path calculated: {len(new_plan.waypoints)} waypoints, {new_plan.total_length:.2f}m",
                            details={"waypoints_count": len(new_plan.waypoints), "length": new_plan.total_length}
                        )

                        # Extract new local path
                        local_plan = self.extract_local_path(robot_pose, horizon=2.5)
                        self.status.local_path = local_plan
                        self.record_transition(
                            to_state=NavigationStateEnum.LOCAL_PATH_GENERATED,
                            stage=NavigationPipelineStage.LOCAL_PATH,
                            reason=f"Extracted local path for new route ({len(local_plan.waypoints)} waypoints)",
                            details={"local_waypoints": len(local_plan.waypoints)}
                        )

                        # Resume navigation along new route
                        self.record_transition(
                            to_state=NavigationStateEnum.NAVIGATING,
                            stage=NavigationPipelineStage.ROBOT_MOVEMENT,
                            reason="Following new replanned detour route to target",
                            details={"replans_count": self.status.metrics.replans_count}
                        )
                        self.pending_obstacle = None
                        return (Twist2D(linear=0.10, angular=0.0), "REPLAN_SUCCESS")
                    else:
                        self.pending_obstacle = None
                        return (Twist2D(linear=0.0, angular=0.0), "REPLAN_BLOCKED")
            else:
                # Keep decelerating
                cmd = self.velocity_controller.compute_command(
                    robot_pose=robot_pose,
                    current_twist=current_twist,
                    target_waypoint=None,
                    dist_to_goal=dist_to_goal,
                    nearest_obstacle_dist=nearest_obstacle_dist,
                    nav_state=NavigationStateEnum.ROBOT_STOPPING,
                    dt=dt
                )
                return (cmd, "STOPPING")

        # F. Active Obstacle Checking during NAVIGATING (Step 7)
        if self.status.state in [NavigationStateEnum.NAVIGATING, NavigationStateEnum.LOCAL_PATH_GENERATED]:
            obs_hit = self.check_corridor_obstacle(robot_pose, dynamic_obstacles, static_obstacles)
            if obs_hit and (now - self.last_replan_timestamp > 1.5):
                # 1. Robot detects obstacle
                self.pending_obstacle = obs_hit
                self.status.metrics.obstacle_encounters += 1
                self.status.active_obstacle = ObstacleDetectionData(
                    detected=True,
                    obstacle_id=obs_hit["id"],
                    name=obs_hit["name"],
                    x=obs_hit["x"],
                    y=obs_hit["y"],
                    distance=round(obs_hit["distance"], 2),
                    cleared=False,
                    detection_type=obs_hit["type"]
                )

                self.record_transition(
                    to_state=NavigationStateEnum.OBSTACLE_DETECTED,
                    stage=NavigationPipelineStage.OBSTACLE_CHECKING,
                    reason=f"Obstacle '{obs_hit['name']}' detected directly on path corridor at ({obs_hit['x']:.2f}, {obs_hit['y']:.2f})",
                    details=obs_hit
                )

                # 2. Robot does not drive through it. 3. Robot slows/stops
                self.record_transition(
                    to_state=NavigationStateEnum.ROBOT_STOPPING,
                    stage=NavigationPipelineStage.VELOCITY_CONTROLLER,
                    reason="Safety deceleration triggered: Halting robot before obstacle boundary",
                    details={"speed": current_twist.linear}
                )

                cmd = self.velocity_controller.compute_command(
                    robot_pose=robot_pose,
                    current_twist=current_twist,
                    target_waypoint=None,
                    dist_to_goal=dist_to_goal,
                    nearest_obstacle_dist=nearest_obstacle_dist,
                    nav_state=NavigationStateEnum.ROBOT_STOPPING,
                    dt=dt
                )
                return (cmd, "OBSTACLE_DETECTED")

        # G. Waypoint Tracking and Path Following
        waypoints = self.status.path.waypoints
        if not waypoints or self.status.current_waypoint_index >= len(waypoints):
            self.record_transition(
                to_state=NavigationStateEnum.TARGET_REACHED,
                stage=NavigationPipelineStage.ROBOT_MOVEMENT,
                reason="End of planned route reached",
                details={}
            )
            return (Twist2D(linear=0.0, angular=0.0), "TARGET_REACHED")

        # Advance current waypoint index as robot nears each waypoint
        curr_wp = waypoints[self.status.current_waypoint_index]
        dist_to_wp = math.hypot(curr_wp.x - robot_pose.x, curr_wp.y - robot_pose.y)

        while dist_to_wp < self.waypoint_tolerance and self.status.current_waypoint_index < len(waypoints) - 1:
            self.status.current_waypoint_index += 1
            curr_wp = waypoints[self.status.current_waypoint_index]
            dist_to_wp = math.hypot(curr_wp.x - robot_pose.x, curr_wp.y - robot_pose.y)

        # Update local path horizon for UI
        self.status.local_path = self.extract_local_path(robot_pose, horizon=2.5)

        # Step 8: Velocity Controller computation
        cmd = self.velocity_controller.compute_command(
            robot_pose=robot_pose,
            current_twist=current_twist,
            target_waypoint=curr_wp,
            dist_to_goal=dist_to_goal,
            nearest_obstacle_dist=nearest_obstacle_dist,
            nav_state=self.status.state,
            dt=dt
        )

        # ETA estimation & stage update
        if cmd.linear > 0.05:
            self.status.metrics.eta_seconds = round(dist_to_goal / cmd.linear, 1)
            if self.status.state == NavigationStateEnum.NAVIGATING:
                self.status.pipeline_stage = NavigationPipelineStage.ROBOT_MOVEMENT.value

        return (cmd, None)
