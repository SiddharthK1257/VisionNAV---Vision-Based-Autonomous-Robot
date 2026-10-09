"""Perception World Model: Maintains 3D Local and Global Semantic Map of Perceived Entities."""
import math
import time
from typing import Dict, List, Optional, Tuple, Any
from ..models.perception import Detection, TrackedObject
from ..models.robot import Pose2D


class PerceptionWorldModel:
    """Maintains a coherent 3D representation of all detected objects in world coordinates."""
    def __init__(self):
        self.entities: Dict[str, TrackedObject] = {}
        self.last_robot_pose: Pose2D = Pose2D()
        self.last_update_timestamp: float = time.time()

    def transform_to_world(
        self,
        local_pos: Tuple[float, float, float],
        robot_pose: Pose2D
    ) -> Tuple[float, float, float]:
        """Transforms 3D point from robot chassis frame (forward X, lateral Y, vertical Z) to world frame."""
        x_fwd, y_lat, z_up = local_pos
        theta = robot_pose.theta

        # 2D rigid rotation + translation
        world_x = robot_pose.x + (x_fwd * math.cos(theta) - y_lat * math.sin(theta))
        world_y = robot_pose.y + (x_fwd * math.sin(theta) + y_lat * math.cos(theta))
        world_z = z_up

        return (round(world_x, 2), round(world_y, 2), round(world_z, 2))

    def update(
        self,
        tracked_objects: List[TrackedObject],
        robot_pose: Pose2D,
        timestamp: float
    ):
        """Updates internal world model entities with latest tracker state."""
        self.last_robot_pose = robot_pose.model_copy()
        self.last_update_timestamp = timestamp
        self.entities = {track.track_id: track for track in tracked_objects}

    def get_people_count(self) -> int:
        return sum(1 for obj in self.entities.values() if obj.class_name == "person" and obj.status != "Occluded")

    def get_closest_obstacle(self) -> Optional[TrackedObject]:
        active = [obj for obj in self.entities.values() if obj.status != "Occluded"]
        if not active:
            return None
        return min(active, key=lambda obj: obj.distance)

    def get_all_entities(self) -> List[TrackedObject]:
        return list(self.entities.values())

    def get_summary(self) -> Dict[str, Any]:
        return {
            "total_entities": len(self.entities),
            "people_count": self.get_people_count(),
            "closest_obstacle_distance": self.get_closest_obstacle().distance if self.get_closest_obstacle() else None,
            "classes_present": list(set(obj.class_name for obj in self.entities.values())),
            "timestamp": self.last_update_timestamp
        }
