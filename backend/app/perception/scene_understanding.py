"""Scene Understanding Module for VisionNav AI (Section 8).
Inputs:
- Current perception results (detections, tracked objects)
- Robot position and heading
- Occupancy grid
- Nearby obstacles (static & dynamic)
- Target objective information
- Sensor measurements (LiDAR, nearest obstacle distance)

Outputs:
- Visible objects
- Target candidates
- Navigable space
- Blocked space
- Nearby people
- Static obstacles
- Dynamic obstacles
- Potential path conflicts
- Concise natural language explanation
"""
import math
from typing import List, Optional, Dict, Any, Tuple
from pydantic import BaseModel, Field

from ..models.perception import Detection, TrackedObject
from ..models.robot import Pose2D
from ..models.world import StaticObstacle, DynamicObstacle, TargetLocation
from ..models.navigation import TargetObjective, NavigationStatus, NavigationStateEnum
from ..navigation.occupancy_grid import OccupancyGrid


class SceneUnderstandingOutput(BaseModel):
    visible_objects: List[str] = Field(default_factory=list)
    target_candidates: List[str] = Field(default_factory=list)
    navigable_space: str = "Corridor unobstructed"
    blocked_space: Optional[str] = None
    nearby_people: List[str] = Field(default_factory=list)
    static_obstacles: List[str] = Field(default_factory=list)
    dynamic_obstacles: List[str] = Field(default_factory=list)
    potential_path_conflicts: List[str] = Field(default_factory=list)
    concise_explanation: str = "Scene nominal. Operating along planned route."


class SceneUnderstandingEngine:
    """Evaluates spatial relationships and produces verifiable scene understanding descriptions."""

    def analyze(
        self,
        detections: List[Detection],
        tracked_objects: List[TrackedObject],
        robot_pose: Pose2D,
        occupancy_grid: OccupancyGrid,
        static_obstacles: List[StaticObstacle],
        dynamic_obstacles: List[DynamicObstacle],
        target_objective: Optional[TargetObjective],
        navigation_status: NavigationStatus,
        nearest_distance: float
    ) -> SceneUnderstandingOutput:
        visible_classes = []
        target_candidates = []
        nearby_people = []
        static_obs_summary = []
        dynamic_obs_summary = []
        path_conflicts = []

        # 1. Inspect visible detections
        target_det: Optional[Detection] = None
        for d in detections:
            desc = f"{d.class_name} ({d.distance:.1f}m)"
            visible_classes.append(desc)
            if d.is_target:
                target_det = d
                target_candidates.append(f"{d.attribute or ''} {d.class_name} ({d.confidence*100:.0f}% conf, {d.distance:.1f}m)")
            elif target_objective and target_objective.target_class and d.class_name.lower() == target_objective.target_class.lower():
                target_candidates.append(f"{d.class_name} ({d.distance:.1f}m)")

            if d.class_name == "person":
                nearby_people.append(f"Person at {d.distance:.1f}m (ID: {d.track_id})")

        # 2. Inspect dynamic obstacles
        for dyn in dynamic_obstacles:
            dist = math.hypot(dyn.x - robot_pose.x, dyn.y - robot_pose.y)
            if dist < 6.0:
                dynamic_obs_summary.append(f"{dyn.name} at ({dyn.x:.1f}, {dyn.y:.1f}), dist={dist:.1f}m")

        # 3. Inspect static obstacles in proximity
        for obs in static_obstacles:
            if obs.class_name == "wall":
                continue
            dist = math.hypot(obs.x - robot_pose.x, obs.y - robot_pose.y)
            if dist < 4.0:
                static_obs_summary.append(f"{obs.name} at {dist:.1f}m")

        # 4. Determine blocked space & potential path conflicts
        active_obs = navigation_status.active_obstacle
        blocked_space_str = None
        if active_obs and active_obs.detected:
            blocked_space_str = f"Corridor blocked by {active_obs.name or 'Obstacle'} at ({active_obs.x:.1f}, {active_obs.y:.1f})"
            path_conflicts.append(f"Route conflict with {active_obs.name or 'Obstacle'} ({active_obs.distance:.1f}m)")

        # 5. Navigable space description
        if nearest_distance > 3.0:
            nav_space = f"Wide open space. Forward clearance: {nearest_distance:.1f}m"
        elif nearest_distance > 1.2:
            nav_space = f"Standard corridor. Clearance: {nearest_distance:.1f}m"
        else:
            nav_space = f"Constrained corridor. Safety margin: {nearest_distance:.1f}m"

        # 6. Synthesize verified concise explanation
        nav_state = navigation_status.state
        target_name = (
            navigation_status.goal_name
            or (f"{target_objective.target_attribute or ''} {target_objective.target_class or 'target'}".strip() if target_objective else "target")
        ).title()

        # Determine location quadrant of target
        loc_str = "forward area"
        if target_det and target_det.position:
            # relative angle to target
            bearing = math.atan2(target_det.position[1], target_det.position[0])
            if bearing > 0.3:
                loc_str = "left sector"
            elif bearing < -0.3:
                loc_str = "right sector"
            else:
                loc_str = "ahead in corridor"
        elif navigation_status.current_goal:
            gx, gy = navigation_status.current_goal
            if gx > 10.0 and gy > 6.0:
                loc_str = "north-east storage zone"
            elif gx > 10.0:
                loc_str = "east storage aisle"
            elif gy > 8.0:
                loc_str = "north inspection bay"
            else:
                loc_str = "central transit corridor"

        if nav_state == NavigationStateEnum.TARGET_REACHED:
            explanation = f"{target_name} safely reached at {loc_str}. Autonomous mission completed."
        elif nav_state in [NavigationStateEnum.OBSTACLE_DETECTED, NavigationStateEnum.ROBOT_STOPPING, NavigationStateEnum.ROBOT_STOPPED]:
            obs_label = (active_obs.name if active_obs else None) or "A moving obstacle"
            explanation = f"{target_name} located in {loc_str}. {obs_label} is crossing the planned route. The robot is pausing to calculate a safer path."
        elif nav_state in [NavigationStateEnum.REPLANNING, NavigationStateEnum.NEW_ROUTE_CALCULATED]:
            explanation = f"Obstacle encountered on primary corridor. The robot is executing an A* dynamic detour toward {target_name}."
        elif nav_state == NavigationStateEnum.NAVIGATING:
            if nearby_people:
                explanation = f"Navigating toward {target_name} in {loc_str}. {nearby_people[0]} detected in vicinity; maintaining safety clearance."
            else:
                explanation = f"Navigating toward {target_name} in {loc_str}. Path corridor clear ({nearest_distance:.1f}m safety clearance)."
        elif nav_state in [NavigationStateEnum.TARGET_SEARCHING, NavigationStateEnum.MISSION_RECEIVED]:
            explanation = f"Visual sensors scanning environment to identify {target_name}. Analyzing object classes in field of view."
        elif nav_state == NavigationStateEnum.TARGET_IDENTIFIED:
            explanation = f"{target_name} identified in visual frame at {target_det.distance if target_det else 0.0:.1f}m. Computing ground plane coordinate localization."
        elif nav_state == NavigationStateEnum.GOAL_SET:
            explanation = f"Target {target_name} localized. Generated approach goal with 0.5m standoff margin. Invoking A* planner."
        elif nav_state == NavigationStateEnum.PAUSED:
            explanation = f"Autonomous navigation paused by operator. Holding position before {target_name}."
        elif robot_pose.x == 0.0 and robot_pose.y == 0.0:
            explanation = "Robot in initial standby state."
        else:
            explanation = f"Monitoring warehouse environment. Nearest obstacle at {nearest_distance:.1f}m."

        return SceneUnderstandingOutput(
            visible_objects=visible_classes[:6],
            target_candidates=target_candidates,
            navigable_space=nav_space,
            blocked_space=blocked_space_str,
            nearby_people=nearby_people,
            static_obstacles=static_obs_summary[:4],
            dynamic_obstacles=dynamic_obs_summary,
            potential_path_conflicts=path_conflicts,
            concise_explanation=explanation
        )
