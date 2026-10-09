"""Unit tests for Natural Language Target Interpreter."""
import pytest
from backend.app.perception.target_interpreter import TargetInterpreter


def test_interpret_blue_package():
    interpreter = TargetInterpreter()
    obj = interpreter.interpret("Find the blue package and navigate to it.")

    assert obj.target_type == "object"
    assert obj.target_class == "box"
    assert obj.target_attribute == "blue"


def test_interpret_red_box():
    interpreter = TargetInterpreter()
    obj = interpreter.interpret("Go to the red box.")

    assert obj.target_type == "object"
    assert obj.target_class == "box"
    assert obj.target_attribute == "red"


def test_interpret_charging_station():
    interpreter = TargetInterpreter()
    obj = interpreter.interpret("Navigate to the charging station.")

    assert obj.target_type == "location"
    assert obj.location_name == "charging_station"


def test_interpret_meeting_area():
    interpreter = TargetInterpreter()
    obj = interpreter.interpret("Move to the meeting area.")

    assert obj.target_type == "location"
    assert obj.location_name == "meeting_area"
