"""Unit tests for Safety Controller and velocity validation."""
import pytest
from backend.app.safety.controller import SafetyController
from backend.app.models.robot import Twist2D, RobotState


def test_safety_controller_critical_stop():
    controller = SafetyController()
    state = RobotState()
    cmd = Twist2D(linear=0.5, angular=0.0)

    # Obstacle at 0.30m (less than critical 0.45m)
    safe_cmd, modified, reason = controller.evaluate_command(cmd, state, nearest_obstacle_dist=0.30)

    assert safe_cmd.linear == 0.0, "Linear velocity must be zeroed on critical proximity"
    assert modified is True
    assert "SAFETY INTERVENTION" in reason


def test_safety_controller_warning_slowdown():
    controller = SafetyController()
    state = RobotState()
    cmd = Twist2D(linear=0.8, angular=0.0)

    # Obstacle at 0.80m (between critical 0.45m and warning 1.20m)
    safe_cmd, modified, reason = controller.evaluate_command(cmd, state, nearest_obstacle_dist=0.80)

    assert 0.0 < safe_cmd.linear < 0.8, "Linear velocity must be throttled down in warning zone"
    assert modified is True


def test_safety_controller_estop():
    controller = SafetyController()
    state = RobotState(emergency_stop=True)
    cmd = Twist2D(linear=0.5, angular=0.3)

    safe_cmd, modified, reason = controller.evaluate_command(cmd, state, nearest_obstacle_dist=5.0)

    assert safe_cmd.linear == 0.0
    assert safe_cmd.angular == 0.0
    assert "E-Stop Engaged" in reason
