"""Multi-Object Tracker: Associates detections across frames and estimates object velocities."""
import time
import math
from typing import Dict, List, Tuple
from ..models.perception import Detection, TrackedObject


class MultiObjectTracker:
    def __init__(self, max_distance_threshold: float = 1.8, max_disappeared_seconds: float = 2.5):
        self.max_distance_threshold = max_distance_threshold
        self.max_disappeared_seconds = max_disappeared_seconds
        self.tracked_objects: Dict[str, TrackedObject] = {}

    def update(self, detections: List[Detection], current_time: float) -> List[TrackedObject]:
        matched_ids = set()

        for det in detections:
            det_pos = (det.position_3d[0], det.position_3d[1])
            best_match_id = None
            min_dist = float('inf')

            # Find closest existing tracked object with same or compatible class
            for track_id, track in self.tracked_objects.items():
                if track_id in matched_ids:
                    continue
                if track.class_name != det.class_name:
                    continue

                dx = track.position[0] - det_pos[0]
                dy = track.position[1] - det_pos[1]
                dist = math.sqrt(dx * dx + dy * dy)

                if dist < min_dist and dist < self.max_distance_threshold:
                    min_dist = dist
                    best_match_id = track_id

            if best_match_id is not None:
                # Update matched track
                matched_ids.add(best_match_id)
                track = self.tracked_objects[best_match_id]
                dt = max(0.01, current_time - track.last_seen)

                # Estimate velocity
                vx = (det_pos[0] - track.position[0]) / dt
                vy = (det_pos[1] - track.position[1]) / dt
                speed = math.sqrt(vx * vx + vy * vy)
                is_dyn = speed > 0.15 or track.class_name == "person"

                track.position = det_pos
                track.position_3d = det.position_3d
                track.confidence = round(0.7 * track.confidence + 0.3 * det.confidence, 2)
                track.distance = det.distance
                track.velocity = (round(vx, 2), round(vy, 2))
                track.is_dynamic = is_dyn
                track.last_seen = current_time
                track.status = "Moving" if speed > 0.15 else ("Static" if not is_dyn else "Active")
            else:
                # Create new track
                new_id = det.track_id
                if new_id in self.tracked_objects:
                    new_id = f"{det.track_id}_{int(current_time) % 100}"

                matched_ids.add(new_id)
                is_dyn = det.class_name == "person"
                self.tracked_objects[new_id] = TrackedObject(
                    track_id=new_id,
                    class_name=det.class_name,
                    confidence=det.confidence,
                    distance=det.distance,
                    position=det_pos,
                    position_3d=det.position_3d,
                    velocity=(0.0, 0.0),
                    is_dynamic=is_dyn,
                    first_seen=current_time,
                    last_seen=current_time,
                    status="Active" if is_dyn else "Static"
                )

        # Mark occluded or purge stale tracks
        stale_ids = []
        for track_id, track in self.tracked_objects.items():
            if track_id not in matched_ids:
                if current_time - track.last_seen > self.max_disappeared_seconds:
                    stale_ids.append(track_id)
                else:
                    track.status = "Occluded"

        for sid in stale_ids:
            del self.tracked_objects[sid]

        return list(self.tracked_objects.values())
