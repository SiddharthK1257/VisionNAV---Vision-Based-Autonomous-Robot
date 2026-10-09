"""Real-time autonomous decision engine models."""
from enum import Enum
from pydantic import BaseModel, Field
from typing import Optional, Dict, Any


class ActionType(str, Enum):
    SEARCH = "SEARCH"
    MOVE_FORWARD = "MOVE_FORWARD"
    TURN = "TURN"
    STOP = "STOP"
    SLOW_DOWN = "SLOW_DOWN"
    AVOID = "AVOID"
    REPLAN = "REPLAN"
    FOLLOW_PATH = "FOLLOW_PATH"
    TARGET_REACHED = "TARGET_REACHED"
    WAIT = "WAIT"


class DecisionEntry(BaseModel):
    id: str
    timestamp: str  # e.g. "18:42:15"
    epoch: float
    action: ActionType
    reason: str
    confidence: float
    context: Dict[str, Any] = Field(default_factory=dict)
