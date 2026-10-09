"""Robot kinematics, state and telemetry data models."""
from enum import Enum
from pydantic import BaseModel, Field
from typing import Optional, List, Tuple


class ControlMode(str, Enum):
    AUTONOMOUS = "AUTONOMOUS"
    PROGRAMMATIC = "PROGRAMMATIC"
    MANUAL = "MANUAL"


class Pose2D(BaseModel):
    x: float = 0.0
    y: float = 0.0
    theta: float = 0.0  # radians (-pi to +pi)


class Twist2D(BaseModel):
    linear: float = 0.0   # forward velocity (m/s, can be negative for reverse)
    angular: float = 0.0  # rotational velocity (rad/s, positive=CCW, negative=CW)


class WheelVelocities(BaseModel):
    left: float = 0.0   # linear m/s
    right: float = 0.0  # linear m/s
    left_rad_s: float = 0.0  # angular rad/s
    right_rad_s: float = 0.0  # angular rad/s


class BatteryState(BaseModel):
    percentage: float = 98.5
    voltage: float = 24.2
    is_charging: bool = False
    discharge_rate: float = 0.02  # % per second when moving


class IMUData(BaseModel):
    linear_acceleration_x: float = 0.0
    linear_acceleration_y: float = 0.0
    linear_acceleration_z: float = 9.81
    angular_velocity_z: float = 0.0
    yaw: float = 0.0
    pitch: float = 0.0
    roll: float = 0.0
    timestamp: float = 0.0


class OdometryData(BaseModel):
    pose: Pose2D = Field(default_factory=Pose2D)
    twist: Twist2D = Field(default_factory=Twist2D)
    total_distance: float = 0.0
    left_ticks: int = 0
    right_ticks: int = 0
    left_wheel_rad_s: float = 0.0
    right_wheel_rad_s: float = 0.0
    frame_id: str = "odom"
    child_frame_id: str = "base_footprint"
    timestamp: float = 0.0


class CameraFrameData(BaseModel):
    width: int = 640
    height: int = 480
    fov_degrees: float = 80.0
    fps: int = 20
    image_base64: Optional[str] = None
    timestamp: float = 0.0


class DepthScanData(BaseModel):
    fov_degrees: float = 80.0
    num_points: int = 80
    min_range: float = 0.2
    max_range: float = 8.0
    ranges: List[float] = Field(default_factory=list)
    nearest_distance: float = 8.0
    depth_image_base64: Optional[str] = None
    timestamp: float = 0.0


class RobotState(BaseModel):
    pose: Pose2D = Field(default_factory=Pose2D)
    twist: Twist2D = Field(default_factory=Twist2D)
    target_twist: Twist2D = Field(default_factory=Twist2D)
    wheels: WheelVelocities = Field(default_factory=WheelVelocities)
    battery: BatteryState = Field(default_factory=BatteryState)
    emergency_stop: bool = False
    status: str = "IDLE"  # IDLE, NAVIGATING, OBSTACLE_DETECTED, STOPPED, ERROR, MANUAL_OVERRIDE
    control_mode: str = "AUTONOMOUS"  # AUTONOMOUS, PROGRAMMATIC, MANUAL
    current_behavior: str = "Awaiting Mission Command"
    odometry_distance: float = 0.0
    odometry: Optional[OdometryData] = None
    sensor_health: str = "OPTIMAL"
