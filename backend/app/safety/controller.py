"""Safety Controller: Hard-enforced safety envelope, collision prevention, and command validation."""
import math
from typing import Tuple, Dict, Any
from ..models.robot import Twist2D, RobotState
from ..core.config import settings


class SafetyController:
    """Independent safety supervisor that gates every velocity command before it touches actuators."""

    def __init__(self):
        self.critical_dist = settings.safety.critical_distance  # 0.45m
        self.warning_dist = settings.safety.warning_distance    # 1.20m
        self.max_linear_vel = settings.robot.max_linear_velocity  # 0.8 m/s
        self.max_angular_vel = settings.robot.max_angular_velocity # 1.2 rad/s

    def evaluate_command(
        self,
        cmd: Twist2D,
        robot_state: RobotState,
        nearest_obstacle_dist: float,
        sensor_healthy: bool = True
    ) -> Tuple[Twist2D, bool, str]:
        """Validates and trims command. Returns (safe_twist, is_modified_or_stopped, reason)."""

        # 1. Hard Emergency Stop Check
        if robot_state.emergency_stop:
            return (Twist2D(linear=0.0, angular=0.0), True, "E-Stop Engaged: All motor outputs inhibited.")

        # 2. Sensor Integrity Check
        if not sensor_healthy:
            return (Twist2D(linear=0.0, angular=0.0), True, "Sensor Failure: Perception pipeline degraded.")

        # 3. Critical Distance Proximity Brake
        if nearest_obstacle_dist < self.critical_dist:
            return (
                Twist2D(linear=0.0, angular=cmd.angular * 0.3),  # Allow gentle pivot, zero forward
                True,
                f"SAFETY INTERVENTION: Critical proximity threshold violated ({nearest_obstacle_dist:.2f}m < {self.critical_dist}m). Hard brake engaged."
            )

        # 4. Warning Distance Slowdown
        safe_linear = cmd.linear
        modified = False
        reason = "Nominal trajectory"

        if nearest_obstacle_dist < self.warning_dist:
            # Scale linear speed ceiling proportionally between critical and warning distance
            factor = (nearest_obstacle_dist - self.critical_dist) / max(0.01, (self.warning_dist - self.critical_dist))
            factor = max(0.20, min(1.0, factor))
            max_safe_linear = max(0.20, self.max_linear_vel * factor)
            if safe_linear > max_safe_linear:
                safe_linear = max_safe_linear
                modified = True
                reason = f"Speed reduced for safety clearance: Obstacle at {nearest_obstacle_dist:.2f}m (clamped to {max_safe_linear:.2f} m/s)."

        # 5. Velocity and Acceleration Limits
        if safe_linear > self.max_linear_vel:
            safe_linear = self.max_linear_vel
            modified = True
            reason = "Linear velocity clamped to maximum robot kinematic limit."

        safe_angular = cmd.angular
        if abs(safe_angular) > self.max_angular_vel:
            safe_angular = math.copysign(self.max_angular_vel, safe_angular)
            modified = True
            reason = "Angular velocity clamped to maximum robot kinematic limit."

        # Reject NaN or Inf commands
        if math.isnan(safe_linear) or math.isnan(safe_angular) or math.isinf(safe_linear) or math.isinf(safe_angular):
            return (Twist2D(linear=0.0, angular=0.0), True, "Invalid numerical command rejected.")

        return (Twist2D(linear=round(safe_linear, 3), angular=round(safe_angular, 3)), modified, reason)
