"""Simulated Differential-Drive Mobile Robot with Kinematics and Battery model."""
import math
import time
from typing import Tuple
from ..models.robot import RobotState, Pose2D, Twist2D, WheelVelocities, BatteryState, OdometryData, ControlMode
from ..core.config import settings


class SimulatedRobot:
    def __init__(self, start_pose: Tuple[float, float, float] = (2.0, 2.0, 0.0)):
        self.state = RobotState()
        self.state.pose = Pose2D(x=start_pose[0], y=start_pose[1], theta=start_pose[2])
        self.kinematics = settings.robot
        self.total_distance = 0.0
        self.left_ticks = 0
        self.right_ticks = 0
        self._update_odometry()

    def reset(self, start_pose: Tuple[float, float, float] = (2.0, 2.0, 0.0)):
        self.state.pose = Pose2D(x=start_pose[0], y=start_pose[1], theta=start_pose[2])
        self.state.twist = Twist2D(linear=0.0, angular=0.0)
        self.state.target_twist = Twist2D(linear=0.0, angular=0.0)
        self.state.wheels = WheelVelocities(left=0.0, right=0.0, left_rad_s=0.0, right_rad_s=0.0)
        self.state.emergency_stop = False
        self.state.status = "IDLE"
        self.state.control_mode = ControlMode.AUTONOMOUS.value
        self.state.current_behavior = "Awaiting Mission Command"
        self.total_distance = 0.0
        self.left_ticks = 0
        self.right_ticks = 0
        self._update_odometry()

    def set_target_velocity(self, linear: float, angular: float):
        if self.state.emergency_stop:
            self.state.target_twist = Twist2D(linear=0.0, angular=0.0)
            return

        # Clamp to kinematic limits (allow negative linear velocity for reverse movement)
        clamped_linear = max(-self.kinematics.max_linear_velocity, min(self.kinematics.max_linear_velocity, linear))
        clamped_angular = max(-self.kinematics.max_angular_velocity, min(self.kinematics.max_angular_velocity, angular))
        self.state.target_twist = Twist2D(linear=clamped_linear, angular=clamped_angular)

    def trigger_emergency_stop(self, enable: bool = True):
        self.state.emergency_stop = enable
        if enable:
            self.state.twist = Twist2D(linear=0.0, angular=0.0)
            self.state.target_twist = Twist2D(linear=0.0, angular=0.0)
            self.state.wheels = WheelVelocities(left=0.0, right=0.0, left_rad_s=0.0, right_rad_s=0.0)
            self.state.status = "EMERGENCY_STOP"
            self.state.current_behavior = "E-Stop Engaged: Motors Disabled"

    def _update_odometry(self):
        w_left = self.state.wheels.left_rad_s
        w_right = self.state.wheels.right_rad_s
        self.state.odometry = OdometryData(
            pose=self.state.pose.model_copy(),
            twist=self.state.twist.model_copy(),
            total_distance=round(self.total_distance, 3),
            left_ticks=self.left_ticks,
            right_ticks=self.right_ticks,
            left_wheel_rad_s=w_left,
            right_wheel_rad_s=w_right,
            frame_id="odom",
            child_frame_id="base_footprint",
            timestamp=round(time.time(), 3)
        )

    def step(self, dt: float):
        if self.state.emergency_stop:
            self.state.twist = Twist2D(linear=0.0, angular=0.0)
            self.state.wheels = WheelVelocities(left=0.0, right=0.0, left_rad_s=0.0, right_rad_s=0.0)
            self._update_odometry()
            return

        # Acceleration and deceleration ramping
        target_v = self.state.target_twist.linear
        target_w = self.state.target_twist.angular

        curr_v = self.state.twist.linear
        curr_w = self.state.twist.angular

        # Linear acceleration/braking ramp
        if (target_v >= 0 and target_v > curr_v) or (target_v < 0 and target_v > curr_v):
            dv_max = self.kinematics.acceleration_limit * dt
            curr_v = min(curr_v + dv_max, target_v)
        else:
            decel_max = self.kinematics.braking_deceleration * dt
            curr_v = max(curr_v - decel_max, target_v)

        # Angular acceleration ramp
        dw_max = self.kinematics.acceleration_limit * 3.0 * dt
        if target_w > curr_w:
            curr_w = min(curr_w + dw_max, target_w)
        else:
            curr_w = max(curr_w - dw_max, target_w)

        self.state.twist.linear = round(curr_v, 4)
        self.state.twist.angular = round(curr_w, 4)

        # Differential-Drive kinematics:
        # v_left = v - (omega * wheel_base / 2)
        # v_right = v + (omega * wheel_base / 2)
        half_base = self.kinematics.wheel_base / 2.0
        v_left = curr_v - (curr_w * half_base)
        v_right = curr_v + (curr_w * half_base)
        wheel_radius = max(self.kinematics.wheel_radius, 0.01)
        w_left = v_left / wheel_radius
        w_right = v_right / wheel_radius

        self.state.wheels = WheelVelocities(
            left=round(v_left, 3),
            right=round(v_right, 3),
            left_rad_s=round(w_left, 3),
            right_rad_s=round(w_right, 3)
        )

        # Encoder ticks: 2048 pulses per wheel revolution
        ticks_per_meter = 2048.0 / (2.0 * math.pi * wheel_radius)
        self.left_ticks += int(v_left * dt * ticks_per_meter)
        self.right_ticks += int(v_right * dt * ticks_per_meter)

        # Update pose integration
        theta = self.state.pose.theta
        dx = curr_v * math.cos(theta) * dt
        dy = curr_v * math.sin(theta) * dt
        dtheta = curr_w * dt

        self.state.pose.x += dx
        self.state.pose.y += dy
        self.state.pose.theta = (theta + dtheta + math.pi) % (2.0 * math.pi) - math.pi

        dist_step = math.sqrt(dx * dx + dy * dy)
        self.total_distance += dist_step
        self.state.odometry_distance = round(self.total_distance, 3)

        # Battery simulation
        if abs(curr_v) > 0.01 or abs(curr_w) > 0.01:
            drain = self.state.battery.discharge_rate * dt
        else:
            drain = (self.state.battery.discharge_rate * 0.1) * dt
        self.state.battery.percentage = max(0.0, round(self.state.battery.percentage - drain, 3))

        self._update_odometry()

    @staticmethod
    def twist_to_wheels(linear_vel: float, angular_vel: float, wheel_base: float) -> Tuple[float, float]:
        """Differential-drive forward kinematics:
        left wheel velocity = linear velocity - angular velocity * wheelbase / 2
        right wheel velocity = linear velocity + angular velocity * wheelbase / 2
        """
        half_base = wheel_base / 2.0
        v_left = linear_vel - (angular_vel * half_base)
        v_right = linear_vel + (angular_vel * half_base)
        return (round(v_left, 4), round(v_right, 4))

    @staticmethod
    def wheels_to_twist(v_left: float, v_right: float, wheel_base: float) -> Tuple[float, float]:
        """Differential-drive inverse kinematics:
        linear velocity = (v_right + v_left) / 2
        angular velocity = (v_right - v_left) / wheelbase
        """
        linear = (v_right + v_left) / 2.0
        angular = (v_right - v_left) / max(0.001, wheel_base)
        return (round(linear, 4), round(angular, 4))
