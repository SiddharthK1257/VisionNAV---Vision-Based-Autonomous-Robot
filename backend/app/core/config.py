"""VisionNav AI Configuration and Parameters."""
import os
from pydantic import BaseModel


class RobotKinematics(BaseModel):
    wheel_base: float = 0.45  # Distance between wheels (meters)
    wheel_radius: float = 0.10  # Radius of wheels (meters)
    max_linear_velocity: float = 0.8  # m/s
    max_angular_velocity: float = 1.2  # rad/s
    acceleration_limit: float = 0.6  # m/s^2
    braking_deceleration: float = 1.5  # m/s^2


class SafetyLimits(BaseModel):
    critical_distance: float = 0.35  # Immediate e-stop / hard brake distance (m) (Section 12: 0.35m-0.4m)
    warning_distance: float = 0.90   # Slow-down distance (m) (Section 12: ~1.0m)
    replan_distance: float = 1.30   # Trigger replanning distance (m)
    inflation_radius: float = 0.45   # Grid inflation clearance for robot body (m)
    emergency_stop_enabled: bool = False


class SensorConfig(BaseModel):
    lidar_rays: int = 72  # 360-degree raycast count
    lidar_range: float = 8.0  # Max detection range (m)
    lidar_fov_degrees: float = 360.0
    camera_fov_degrees: float = 80.0
    camera_fps: int = 20
    camera_range: float = 7.0
    sensor_noise_sigma: float = 0.01


class Settings(BaseModel):
    host: str = os.getenv("HOST", "0.0.0.0")
    port: int = int(os.getenv("PORT", 8000))
    simulation_mode: bool = True
    simulation_fps: int = 20  # 50ms per simulation tick
    vlm_provider: str = os.getenv("VLM_PROVIDER", "local_fallback")
    
    robot: RobotKinematics = RobotKinematics()
    safety: SafetyLimits = SafetyLimits()
    sensors: SensorConfig = SensorConfig()


settings = Settings()
