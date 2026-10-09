"""Natural Language Objective Interpreter: Converts mission commands into structured targets."""
import re
from typing import Optional, Tuple
from ..models.navigation import TargetObjective


class TargetInterpreter:
    def __init__(self):
        # Attribute color/type mappings
        self.colors = ["blue", "red", "yellow", "green", "brown", "white", "black", "silver"]

        # Object class synonyms
        self.class_mappings = {
            "box": ["box", "package", "crate", "carton", "parcel", "container"],
            "chair": ["chair", "seat", "stool", "armchair"],
            "table": ["table", "desk", "bench", "workstation", "counter"],
            "laptop": ["laptop", "computer", "notebook", "screen"],
            "bottle": ["bottle", "flask", "reagent", "water"],
            "person": ["person", "human", "worker", "technician", "colleague", "alex", "sarah"],
        }

        # Location synonyms
        self.location_mappings = {
            "charging_station": ["charging station", "charger", "dock", "docking bay", "charge pad", "power dock"],
            "inspection_zone": ["inspection zone", "qa table", "inspection area", "inspection desk", "qa zone"],
            "meeting_area": ["meeting area", "conference room", "conference table", "meeting room"],
            "sample_station": ["sample analysis station", "sample station", "cleanroom bench"],
        }

    def interpret(self, command: str) -> TargetObjective:
        cmd_lower = command.lower().strip()

        # 1. Check for specific named locations
        for loc_name, synonyms in self.location_mappings.items():
            for syn in synonyms:
                if syn in cmd_lower:
                    return TargetObjective(
                        raw_prompt=command,
                        target_type="location",
                        location_name=loc_name,
                        target_class=None,
                        target_attribute=None,
                        destination=None
                    )

        # 2. Check for object attributes (e.g. colors)
        detected_attr: Optional[str] = None
        for color in self.colors:
            if re.search(r'\b' + color + r'\b', cmd_lower):
                detected_attr = color
                break

        # 3. Check for target class
        detected_class: Optional[str] = None
        for canonical_class, synonyms in self.class_mappings.items():
            for syn in synonyms:
                if re.search(r'\b' + syn + r'\b', cmd_lower):
                    detected_class = canonical_class
                    break
            if detected_class:
                break

        # Default fallback if class is still None
        if not detected_class:
            if "box" in cmd_lower or "package" in cmd_lower or "item" in cmd_lower:
                detected_class = "box"
            else:
                detected_class = "box"

        return TargetObjective(
            raw_prompt=command,
            target_type="object",
            target_class=detected_class,
            target_attribute=detected_attr or ("blue" if "blue" in cmd_lower else None),
            location_name=None,
            destination=None
        )
