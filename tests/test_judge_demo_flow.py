"""End-to-End Test for the Judge Demo Flow:
PERCEIVE -> UNDERSTAND -> PLAN -> NAVIGATE -> AVOID -> REPLAN -> ARRIVE.
"""
import pytest
from backend.app.simulation.simulator import SimulationCoordinator
from backend.app.services.mission_manager import MissionManager
from backend.app.models.world import EnvironmentType
from backend.app.models.navigation import NavigationStateEnum, NavigationPipelineStage


def test_judge_demo_e2e_execution():
    simulator = SimulationCoordinator(env_type=EnvironmentType.WAREHOUSE)
    mission_mgr = MissionManager(simulator)

    # 1. Start Judge Demo
    mission_mgr.trigger_judge_demo()
    assert simulator.demo_mode_active is True
    assert mission_mgr.current_mission is not None
    assert mission_mgr.current_mission.status == "IN_PROGRESS"

    observed_stages = set()
    observed_states = set()
    replanned = False
    slowdown_or_stopped = False

    # Run up to 700 simulation steps (dt=0.1s -> 70s simulated time)
    dt = 0.1
    for step_i in range(700):
        simulator.step(dt=dt)
        mission_mgr.check_status()

        stage = simulator.navigator.status.pipeline_stage
        state = simulator.navigator.status.state
        observed_stages.add(stage)
        observed_states.add(state)

        if state in [NavigationStateEnum.OBSTACLE_DETECTED, NavigationStateEnum.ROBOT_STOPPING, NavigationStateEnum.ROBOT_STOPPED]:
            slowdown_or_stopped = True

        if state in [NavigationStateEnum.REPLANNING, NavigationStateEnum.NEW_ROUTE_CALCULATED] or simulator.navigator.status.metrics.replans_count > 0:
            replanned = True

        if state == NavigationStateEnum.TARGET_REACHED:
            break

    # Verify stage progression across state history
    history_stages = {t.stage for t in simulator.navigator.status.state_history}
    all_stages = observed_stages.union(history_stages)
    assert NavigationPipelineStage.TARGET_IDENTIFICATION in all_stages or NavigationPipelineStage.GLOBAL_PATH in all_stages
    assert NavigationPipelineStage.ROBOT_MOVEMENT in all_stages

    # Verify zero collisions
    assert simulator.collisions_count == 0, f"Collisions occurred: {simulator.collisions_count}"

    # Verify target was reached and completed mission record created
    assert simulator.navigator.status.state == NavigationStateEnum.TARGET_REACHED
    assert len(mission_mgr.history) >= 1
    completed = mission_mgr.history[-1]
    assert completed.status == "SUCCESS"
    assert completed.path_length > 0
    assert completed.collisions == 0
    assert completed.path_efficiency > 0
    assert completed.final_robot_position is not None
    assert "x" in completed.final_robot_position
    assert "y" in completed.final_robot_position


def test_obstacle_on_route_scenario_e2e():
    simulator = SimulationCoordinator(env_type=EnvironmentType.WAREHOUSE)
    mission_mgr = MissionManager(simulator)

    # Start benchmark scenario (A -> B with obstacle on route)
    simulator.start_obstacle_scenario(start_pos=(2.0, 3.0), target_pos=(10.0, 3.0))

    detected_obstacle = False
    replanned = False
    reached_target = False

    dt = 0.1
    for _ in range(600):
        simulator.step(dt=dt)
        state = simulator.navigator.status.state

        if state in [NavigationStateEnum.OBSTACLE_DETECTED, NavigationStateEnum.ROBOT_STOPPING, NavigationStateEnum.ROBOT_STOPPED]:
            detected_obstacle = True

        if state in [NavigationStateEnum.REPLANNING, NavigationStateEnum.NEW_ROUTE_CALCULATED] or simulator.navigator.status.metrics.replans_count > 0:
            replanned = True

        if state == NavigationStateEnum.TARGET_REACHED:
            reached_target = True
            break

    assert detected_obstacle, "Robot should have detected obstacle on route"
    assert replanned, "Robot should have replanned detour around obstacle"
    assert reached_target, "Robot should have navigated around detour and reached target"
    assert simulator.collisions_count == 0, "No collisions should occur during detour"
