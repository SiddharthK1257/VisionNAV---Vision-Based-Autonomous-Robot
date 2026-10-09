"""Navigation state, path plans, and mission objective models."""
from enum import Enum
from pydantic import BaseModel, Field
from typing import List, Optional, Tuple


class NavigationPipelineStage(str, Enum):
    MISSION = "Mission"
    TARGET_IDENTIFICATION = "Target identification"
    TARGET_LOCALIZATION = "Target localization"
    NAVIGATION_GOAL = "Navigation goal"
    GLOBAL_PATH = "Global path"
    LOCAL_PATH = "Local path"
    OBSTACLE_CHECKING = "Obstacle checking"
    VELOCITY_CONTROLLER = "Velocity controller"
    ROBOT_MOVEMENT = "Robot movement"


class NavigationStateEnum(str, Enum):
    IDLE = "IDLE"
    MISSION_RECEIVED = "MISSION_RECEIVED"
    TARGET_SEARCHING = "TARGET_SEARCHING"
    TARGET_IDENTIFIED = "TARGET_IDENTIFIED"
    TARGET_LOCALIZED = "TARGET_LOCALIZED"
    GOAL_SET = "GOAL_SET"
    PLANNING_GLOBAL_PATH = "PLANNING_GLOBAL_PATH"
    GLOBAL_PATH_COMPUTED = "GLOBAL_PATH_COMPUTED"
    LOCAL_PATH_GENERATED = "LOCAL_PATH_GENERATED"
    NAVIGATING = "NAVIGATING"
    OBSTACLE_DETECTED = "OBSTACLE_DETECTED"
    ROBOT_STOPPING = "ROBOT_STOPPING"
    ROBOT_STOPPED = "ROBOT_STOPPED"
    LOCAL_MAP_UPDATED = "LOCAL_MAP_UPDATED"
    REPLANNING = "REPLANNING"
    NEW_ROUTE_CALCULATED = "NEW_ROUTE_CALCULATED"
    TARGET_REACHED = "TARGET_REACHED"
    PAUSED = "PAUSED"
    ERROR = "ERROR"

    # Backward compatibility aliases
    SEARCHING = "SEARCHING"
    TARGET_FOUND = "TARGET_FOUND"
    PLANNING = "PLANNING"


class Waypoint(BaseModel):
    x: float
    y: float
    theta: float = 0.0


class PathPlan(BaseModel):
    waypoints: List[Waypoint] = Field(default_factory=list)
    total_length: float = 0.0
    generated_at: float = 0.0
    is_valid: bool = True
    replanned_count: int = 0


class TargetObjective(BaseModel):
    raw_prompt: str
    target_type: str  # "object" or "location"
    target_class: Optional[str] = None
    target_attribute: Optional[str] = None
    location_name: Optional[str] = None
    destination: Optional[Tuple[float, float]] = None


class NavigationMetrics(BaseModel):
    path_length: float = 0.0
    distance_remaining: float = 0.0
    replans_count: int = 0
    average_speed: float = 0.0
    navigation_time: float = 0.0
    obstacle_encounters: int = 0
    eta_seconds: float = 0.0
    path_efficiency: float = 1.0  # optimal_dist / actual_dist


class StateTransitionRecord(BaseModel):
    timestamp: float
    time_str: str
    from_state: str
    to_state: str
    stage: str
    reason: str
    details: Optional[dict] = None


class TargetLocalizationData(BaseModel):
    target_class: str = "target"
    target_attribute: Optional[str] = None
    target_name: str = "Target"
    confidence: float = 0.0
    distance: float = 0.0
    bearing_rad: float = 0.0
    world_x: float = 0.0
    world_y: float = 0.0
    confirmed: bool = False
    bbox: Optional[dict] = None


class ObstacleDetectionData(BaseModel):
    detected: bool = False
    obstacle_id: Optional[str] = None
    name: Optional[str] = None
    x: float = 0.0
    y: float = 0.0
    distance: float = 999.0
    cleared: bool = True
    detection_type: str = "none"  # "lidar", "corridor", "depth"


class NavigationStatus(BaseModel):
    state: NavigationStateEnum = NavigationStateEnum.IDLE
    pipeline_stage: str = NavigationPipelineStage.MISSION.value
    current_goal: Optional[Tuple[float, float]] = None
    goal_name: Optional[str] = None
    path: PathPlan = Field(default_factory=PathPlan)
    global_path: PathPlan = Field(default_factory=PathPlan)
    local_path: PathPlan = Field(default_factory=PathPlan)
    current_waypoint_index: int = 0
    metrics: NavigationMetrics = Field(default_factory=NavigationMetrics)
    last_replan_reason: Optional[str] = None
    state_history: List[StateTransitionRecord] = Field(default_factory=list)
    target_localization: Optional[TargetLocalizationData] = None
    active_obstacle: Optional[ObstacleDetectionData] = None

