"""Real-time Autonomous Decision Engine: Evaluates scene, telemetry, and navigation events."""
import time
import datetime
import uuid
from typing import List, Optional, Dict, Any
from ..models.decision import DecisionEntry, ActionType
from ..models.robot import RobotState
from ..models.perception import Detection, TrackedObject
from ..models.navigation import NavigationStatus, NavigationStateEnum


class DecisionEngine:
    def __init__(self, max_history: int = 100):
        self.max_history = max_history
        self.history: List[DecisionEntry] = []
        self.last_action: Optional[ActionType] = None
        self.last_reason: Optional[str] = None
        self.last_decision_time = 0.0

    def make_decision(
        self,
        robot_state: RobotState,
        navigation_status: NavigationStatus,
        detections: List[Detection],
        nearest_obstacle_dist: float,
        nav_event: Optional[str] = None
    ) -> Optional[DecisionEntry]:
        now_ts = time.time()
        time_str = datetime.datetime.fromtimestamp(now_ts).strftime("%H:%M:%S")

        action: ActionType = ActionType.WAIT
        reason: str = "Robot idle awaiting mission"
        confidence: float = 0.95

        # 1. E-Stop or Critical Emergency
        if robot_state.emergency_stop:
            action = ActionType.STOP
            reason = "Emergency Stop is engaged. All locomotion arrested."
            confidence = 1.0

        # 2. Critical proximity obstacle or obstacle detected
        elif navigation_status.state in [NavigationStateEnum.ROBOT_STOPPING, NavigationStateEnum.ROBOT_STOPPED]:
            action = ActionType.STOP
            reason = f"Obstacle obstructing path. Safely decelerating and halting robot before obstacle."
            confidence = 0.98

        elif navigation_status.state == NavigationStateEnum.OBSTACLE_DETECTED:
            action = ActionType.SLOW_DOWN
            reason = f"Obstacle detected on trajectory corridor. Slowing down to verify clearance."
            confidence = 0.96

        elif nearest_obstacle_dist < 0.45:
            action = ActionType.STOP
            reason = f"Obstacle breached critical boundary ({nearest_obstacle_dist:.2f}m < 0.45m)."
            confidence = 0.98

        # 3. Dynamic Replan Event
        elif nav_event == "REPLAN_SUCCESS" or navigation_status.state in [NavigationStateEnum.REPLANNING, NavigationStateEnum.LOCAL_MAP_UPDATED, NavigationStateEnum.NEW_ROUTE_CALCULATED]:
            action = ActionType.REPLAN
            reason = "Obstacle detected on planned trajectory. Recomputing collision-free A* route around obstacle."
            confidence = 0.95

        # 4. Target Reached Event
        elif nav_event == "TARGET_REACHED" or navigation_status.state == NavigationStateEnum.TARGET_REACHED:
            action = ActionType.TARGET_REACHED
            goal_lbl = navigation_status.goal_name or "target"
            reason = f"Successfully arrived at destination objective: {goal_lbl}."
            confidence = 0.99

        # 5. Proximity slowdown
        elif nearest_obstacle_dist < 1.10 and navigation_status.state == NavigationStateEnum.NAVIGATING:
            action = ActionType.SLOW_DOWN
            reason = f"Obstacle within warning perimeter ({nearest_obstacle_dist:.2f}m). Reducing speed for safe passing."
            confidence = 0.92

        # 6. Sharp turn maneuver
        elif navigation_status.state in [NavigationStateEnum.NAVIGATING, NavigationStateEnum.LOCAL_PATH_GENERATED]:
            if abs(robot_state.twist.angular) > 0.45 and robot_state.twist.linear < 0.2:
                action = ActionType.TURN
                reason = "Aligning robot heading with next path waypoint orientation."
                confidence = 0.90
            elif robot_state.twist.linear > 0.1:
                action = ActionType.FOLLOW_PATH
                remaining = navigation_status.metrics.distance_remaining
                reason = f"Tracking trajectory towards objective ({remaining:.1f}m remaining)."
                confidence = 0.93
            else:
                action = ActionType.MOVE_FORWARD
                reason = "Initiating forward motion along planned route."
                confidence = 0.91

        # 7. Searching for Target
        elif navigation_status.state in [NavigationStateEnum.SEARCHING, NavigationStateEnum.TARGET_SEARCHING, NavigationStateEnum.MISSION_RECEIVED]:
            action = ActionType.SEARCH
            reason = "Scanning environment FOV with vision detector to acquire target position."
            confidence = 0.88

        # Filter out noisy identical decisions unless enough time elapsed
        if action == self.last_action and (now_ts - self.last_decision_time) < 2.0:
            return None

        self.last_action = action
        self.last_reason = reason
        self.last_decision_time = now_ts

        entry = DecisionEntry(
            id=str(uuid.uuid4())[:8],
            timestamp=time_str,
            epoch=now_ts,
            action=action,
            reason=reason,
            confidence=confidence,
            context={
                "nearest_dist": round(nearest_obstacle_dist, 2),
                "speed": round(robot_state.twist.linear, 2),
                "nav_state": navigation_status.state.value
            }
        )

        self.history.insert(0, entry)
        if len(self.history) > self.max_history:
            self.history.pop()

        return entry

    def get_history(self) -> List[DecisionEntry]:
        return self.history
