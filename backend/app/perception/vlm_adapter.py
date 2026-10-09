"""Modular Vision-Language Model (VLM) Adapter for Scene Understanding and Decision Explanation."""
import os
import json
from abc import ABC, abstractmethod
from typing import Dict, Any, List, Optional
from ..models.perception import Detection, VLMStructuredOutput, SceneUnderstanding
from ..models.robot import RobotState
from ..models.navigation import TargetObjective
from .target_interpreter import TargetInterpreter


class VisionLanguageModel(ABC):
    """Abstract Base Class for Vision-Language Models in VisionNav AI."""

    @abstractmethod
    def analyze_scene(
        self,
        detections: List[Detection],
        robot_state: RobotState,
        target_objective: Optional[TargetObjective],
        nearby_obstacles_count: int,
        nearest_distance: float
    ) -> VLMStructuredOutput:
        """Analyzes perceived objects, robot state, and target to produce structured spatial reasoning."""
        pass

    @abstractmethod
    def interpret_objective(self, command: str) -> TargetObjective:
        """Parses natural-language mission commands into structured targets."""
        pass

    @abstractmethod
    def explain_navigation_decision(self, context: Dict[str, Any]) -> str:
        """Produces transparent reasoning for why an autonomous action was taken."""
        pass


class LocalSpatialReasoningVLM(VisionLanguageModel):
    """Deterministic local scene reasoning fallback based on detected objects and spatial relationships.
    Runs reliably offline without external API dependencies or network latency.
    """

    def __init__(self):
        self.interpreter = TargetInterpreter()

    def interpret_objective(self, command: str) -> TargetObjective:
        return self.interpreter.interpret(command)

    def analyze_scene(
        self,
        detections: List[Detection],
        robot_state: RobotState,
        target_objective: Optional[TargetObjective],
        nearby_obstacles_count: int,
        nearest_distance: float
    ) -> VLMStructuredOutput:
        people = [d for d in detections if d.class_name == "person"]
        people_count = len(people)
        target_det = next((d for d in detections if d.is_target), None)

        target_visible = target_det is not None
        target_class = target_det.class_name if target_det else (target_objective.target_class if target_objective else None)
        target_confidence = target_det.confidence if target_det else 0.0

        # Assess constraints and navigation actions
        constraint = None
        recommended = "NAVIGATE"
        safety_advisory = "Path clear. Operating nominal differential-drive profile."

        if nearest_distance < 0.50:
            constraint = "critical_proximity_breach"
            recommended = "STOP"
            safety_advisory = f"EMERGENCY BRAKE: Obstacle detected at critical distance {nearest_distance:.2f}m."
        elif nearest_distance < 1.20:
            if people_count > 0 and people[0].distance < 1.4:
                constraint = "dynamic_pedestrian_in_route"
                recommended = "REPLAN"
                safety_advisory = f"Caution: Pedestrian P-01 near trajectory ({people[0].distance:.2f}m). Initiating dynamic detour."
            else:
                constraint = "static_obstacle_near_path"
                recommended = "SLOW_DOWN"
                safety_advisory = f"Proximity warning: Obstacle at {nearest_distance:.2f}m. Throttling velocity."
        elif not target_visible and target_objective:
            recommended = "SEARCH"
            safety_advisory = "Target not yet in visual sensor FOV. Executing visual search pattern."
        elif target_visible and target_det and target_det.distance < 0.60:
            recommended = "TARGET_REACHED"
            safety_advisory = f"Target {target_class} reached with high confidence ({target_confidence*100:.0f}%)."

        # Spatial reasoning summary
        det_summary = ", ".join([f"{d.class_name} ({d.distance}m)" for d in detections[:4]]) or "no objects in FOV"
        scene_summary = f"Indoor environment. Detected {len(detections)} objects: [{det_summary}]. Closest obstacle at {nearest_distance:.2f}m."
        spatial_reasoning = (
            f"Robot at ({robot_state.pose.x:.1f}, {robot_state.pose.y:.1f}) heading {robot_state.pose.theta:.2f} rad. "
            f"Navigation safety margin: {nearest_distance:.2f}m. Pedestrians observed: {people_count}."
        )

        return VLMStructuredOutput(
            scene_summary=scene_summary,
            target_visible=target_visible,
            target_class=target_class,
            target_confidence=target_confidence,
            navigation_constraint=constraint,
            recommended_action=recommended,
            spatial_reasoning=spatial_reasoning,
            safety_advisory=safety_advisory
        )

    def explain_navigation_decision(self, context: Dict[str, Any]) -> str:
        action = context.get("action", "NAVIGATE")
        reason = context.get("reason", "")
        dist = context.get("distance", None)

        if action == "REPLAN":
            return f"Dynamic replanning triggered: {reason}. Calculating collision-free A* detour."
        elif action == "STOP":
            return f"Safety controller engaged hard stop: {reason}. Obstacle distance {dist if dist else 0.0:.2f}m below critical threshold."
        elif action == "SLOW_DOWN":
            return f"Reducing velocity: {reason}. Safety zone monitoring active."
        elif action == "TARGET_REACHED":
            return f"Mission successfully completed: {reason}."
        return f"Autonomous action [{action}]: {reason}"


# Factory function to instantiate configured VLM adapter
def get_vlm_adapter() -> VisionLanguageModel:
    return LocalSpatialReasoningVLM()
