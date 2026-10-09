"""World state, environment definitions, and obstacle models."""
from enum import Enum
from pydantic import BaseModel, Field
from typing import List, Dict, Optional, Tuple
from .robot import RobotState
from .perception import TrackedObject
from .navigation import NavigationStatus


class EnvironmentType(str, Enum):
    WAREHOUSE = "warehouse"
    OFFICE = "office"
    SMART_LAB = "smart_laboratory"


class StaticObstacle(BaseModel):
    id: str
    name: str
    class_name: str
    x: float
    y: float
    width: float
    height: float
    color: str = "#475569"
    is_furniture: bool = False
    attribute: Optional[str] = None


class DynamicObstacle(BaseModel):
    id: str
    name: str
    class_name: str
    x: float
    y: float
    radius: float = 0.35
    speed: float = 0.3
    waypoints: List[Tuple[float, float]] = Field(default_factory=list)
    current_target_index: int = 0
    attribute: Optional[str] = "moving"
    color: str = "#f97316"


class TargetLocation(BaseModel):
    id: str
    name: str
    class_name: str
    attribute: Optional[str] = None
    x: float
    y: float
    radius: float = 0.4
    color: str = "#3b82f6"


class LiDARHit(BaseModel):
    angle: float
    distance: float
    x: float
    y: float
    hit: bool


class WorldState(BaseModel):
    environment_type: EnvironmentType = EnvironmentType.WAREHOUSE
    width: float = 20.0
    height: float = 14.0
    robot: RobotState = Field(default_factory=RobotState)
    tracked_objects: List[TrackedObject] = Field(default_factory=list)
    static_obstacles: List[StaticObstacle] = Field(default_factory=list)
    dynamic_obstacles: List[DynamicObstacle] = Field(default_factory=list)
    targets: List[TargetLocation] = Field(default_factory=list)
    active_target: Optional[TargetLocation] = None
    navigation: NavigationStatus = Field(default_factory=NavigationStatus)
    lidar_hits: List[LiDARHit] = Field(default_factory=list)
    nearest_obstacle_distance: float = 999.0
    timestamp: float = 0.0
