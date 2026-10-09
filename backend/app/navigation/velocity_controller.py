"""Velocity Controller: Pure Pursuit Steering, Speed Profiling, and Kinematic Clamping."""
import math
from typing import Optional
from ..models.robot import Pose2D, Twist2D
from ..models.navigation import Waypoint, NavigationStateEnum


class VelocityController:
    """Computes smooth linear and angular velocity commands for differential drive mobile robot."""

    def __init__(
        self,
        max_linear_vel: float = 0.55,
        max_angular_vel: float = 1.20,
        max_linear_accel: float = 0.80,
        max_linear_decel: float = 1.50,
        lookahead_distance: float = 0.50,
    ):
        self.max_linear_vel = max_linear_vel
        self.max_angular_vel = max_angular_vel
        self.max_linear_accel = max_linear_accel
        self.max_linear_decel = max_linear_decel
        self.lookahead_distance = lookahead_distance
        self.kp_angular = 1.8
        self.kd_angular = 0.15
        self.last_angle_error = 0.0

    def compute_command(
        self,
        robot_pose: Pose2D,
        current_twist: Twist2D,
        target_waypoint: Optional[Waypoint],
        dist_to_goal: float,
        nearest_obstacle_dist: float,
        nav_state: NavigationStateEnum,
        dt: float = 0.05
    ) -> Twist2D:
        """Calculates commanded Twist2D based on navigation state, target waypoint, and obstacles."""

        # 1. Zero velocity for stopped or inactive states
        stopped_states = {
            NavigationStateEnum.IDLE,
            NavigationStateEnum.ROBOT_STOPPED,
            NavigationStateEnum.LOCAL_MAP_UPDATED,
            NavigationStateEnum.REPLANNING,
            NavigationStateEnum.TARGET_REACHED,
            NavigationStateEnum.PAUSED,
            NavigationStateEnum.ERROR
        }
        if nav_state in stopped_states:
            self.last_angle_error = 0.0
            return Twist2D(linear=0.0, angular=0.0)

        # 2. Hard Braking / Deceleration for stopping
        if nav_state in [NavigationStateEnum.ROBOT_STOPPING, NavigationStateEnum.OBSTACLE_DETECTED]:
            # Rapid controlled deceleration to complete stop
            new_linear = max(0.0, current_twist.linear - self.max_linear_decel * dt)
            new_angular = current_twist.angular * 0.5
            if new_linear < 0.03:
                new_linear = 0.0
                new_angular = 0.0
            return Twist2D(linear=round(new_linear, 3), angular=round(new_angular, 3))

        # 3. Target Searching: Gentle rotation in place to scan FOV
        if nav_state in [NavigationStateEnum.TARGET_SEARCHING, NavigationStateEnum.SEARCHING]:
            return Twist2D(linear=0.0, angular=0.35)

        # 4. Waypoint Tracking (NAVIGATING, LOCAL_PATH_GENERATED, NEW_ROUTE_CALCULATED)
        if not target_waypoint:
            return Twist2D(linear=0.0, angular=0.0)

        # Vector to waypoint
        dx = target_waypoint.x - robot_pose.x
        dy = target_waypoint.y - robot_pose.y
        target_angle = math.atan2(dy, dx)

        # Heading error normalized to [-pi, pi]
        angle_error = (target_angle - robot_pose.theta + math.pi) % (2.0 * math.pi) - math.pi
        d_error = (angle_error - self.last_angle_error) / max(0.001, dt)
        self.last_angle_error = angle_error

        # PD steering controller for angular velocity
        angular_cmd = self.kp_angular * angle_error + self.kd_angular * d_error
        angular_cmd = max(-self.max_angular_vel, min(self.max_angular_vel, angular_cmd))

        # Linear speed calculation with curvature and proximity throttling
        target_linear = self.max_linear_vel

        # A) Reduce linear velocity during sharp turns
        turn_factor = max(0.15, math.cos(angle_error))
        if abs(angle_error) > 0.8:
            target_linear = 0.08  # Nearly rotate in place for steep angles
        else:
            target_linear *= turn_factor

        # B) Decelerate as robot nears goal destination
        if dist_to_goal < 1.2:
            goal_factor = max(0.20, dist_to_goal / 1.2)
            target_linear *= goal_factor

        # C) Slow down when in proximity to obstacles (warning zone)
        if nearest_obstacle_dist < 1.0:
            prox_factor = max(0.60, (nearest_obstacle_dist - 0.35) / 0.65)
            target_linear *= min(1.0, prox_factor)

        # D) Acceleration Rate Limiter (trapezoidal profile)
        max_speed_change_up = self.max_linear_accel * dt
        max_speed_change_down = self.max_linear_decel * dt

        if target_linear > current_twist.linear:
            linear_cmd = min(target_linear, current_twist.linear + max_speed_change_up)
        else:
            linear_cmd = max(target_linear, current_twist.linear - max_speed_change_down)

        linear_cmd = max(0.0, min(self.max_linear_vel, linear_cmd))

        return Twist2D(linear=round(linear_cmd, 3), angular=round(angular_cmd, 3))
