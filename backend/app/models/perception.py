"""Perception, object detection, tracking and scene understanding models."""
import time
from pydantic import BaseModel, Field
from typing import List, Optional, Tuple, Dict, Any


class BoundingBox(BaseModel):
    x: float  # Top-left x (normalized 0 to 1)
    y: float  # Top-left y (normalized 0 to 1)
    width: float  # Box width (normalized 0 to 1)
    height: float  # Box height (normalized 0 to 1)

    @property
    def x_max(self) -> float:
        return min(1.0, self.x + self.width)

    @property
    def y_max(self) -> float:
        return min(1.0, self.y + self.height)


class Detection(BaseModel):
    track_id: str
    class_name: str
    confidence: float
    bbox: BoundingBox
    distance: float
    position: Tuple[float, float, float] = (0.0, 0.0, 0.0)
    position_3d: Tuple[float, float, float] = (0.0, 0.0, 0.0)
    timestamp: float = Field(default_factory=time.time)
    is_target: bool = False
    attribute: Optional[str] = None
    model_source: str = "fallback_geometric"  # "onnx_neural" or "fallback_geometric"
    is_fallback: bool = True

    def model_post_init(self, __context: Any) -> None:
        # Synchronize position and position_3d
        if self.position == (0.0, 0.0, 0.0) and self.position_3d != (0.0, 0.0, 0.0):
            self.position = self.position_3d
        elif self.position_3d == (0.0, 0.0, 0.0) and self.position != (0.0, 0.0, 0.0):
            self.position_3d = self.position

    def model_dump(self, *args, **kwargs) -> Dict[str, Any]:
        data = super().model_dump(*args, **kwargs)
        data["class"] = self.class_name
        return data


class TrackedObject(BaseModel):
    track_id: str
    class_name: str
    confidence: float
    distance: float
    position: Tuple[float, float]
    position_3d: Tuple[float, float, float] = (0.0, 0.0, 0.0)
    velocity: Tuple[float, float] = (0.0, 0.0)
    is_dynamic: bool = False
    first_seen: float
    last_seen: float
    status: str = "Active"  # Active, Static, Moving, Occluded


class PerceptionPipelineStatus(BaseModel):
    detector_name: str
    detector_type: str
    is_fallback: bool
    model_path: Optional[str] = None
    supported_classes: List[str] = Field(default_factory=list)
    camera_fps: float = 20.0
    active_tracks: int = 0
    total_detections: int = 0
    documentation: str = ""


class SceneUnderstanding(BaseModel):
    scene: str
    target: Optional[str] = None
    target_visible: bool = False
    target_distance: Optional[float] = None
    target_confidence: Optional[float] = None
    obstacles_count: int = 0
    people_count: int = 0
    path_blocked: bool = False
    navigation_constraint: Optional[str] = None
    recommended_action: str = "NAVIGATE"
    scene_summary: str = "Monitoring environment."


class VLMStructuredOutput(BaseModel):
    scene_summary: str
    target_visible: bool
    target_class: Optional[str] = None
    target_confidence: float = 0.0
    navigation_constraint: Optional[str] = None
    recommended_action: str
    spatial_reasoning: str
    safety_advisory: str
