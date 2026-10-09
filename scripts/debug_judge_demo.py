import sys, os
sys.path.insert(0, os.path.abspath("."))
from backend.app.simulation.simulator import SimulationCoordinator
from backend.app.services.mission_manager import MissionManager
from backend.app.models.world import EnvironmentType

sim = SimulationCoordinator(env_type=EnvironmentType.WAREHOUSE)
mgr = MissionManager(sim)
mgr.trigger_judge_demo()

print("Initial Robot Pose:", sim.robot.state.pose)
print("Goal Position:", sim.navigator.status.current_goal)
print("Waypoints count:", len(sim.navigator.status.path.waypoints))
print("Current state:", sim.navigator.status.state)

for step in range(600):
    sim.step(dt=0.1)
    mgr.check_status()
    if step % 40 == 0:
        print(f"Step {step:03d} | Pose: ({sim.robot.state.pose.x:.2f}, {sim.robot.state.pose.y:.2f}) | State: {sim.navigator.status.state.value} | Odom: {sim.robot.state.odometry_distance:.2f}m | Obstacle Dist: {sim.nearest_obstacle_distance:.2f}m | Replans: {sim.navigator.status.metrics.replans_count}")
    if sim.navigator.status.state.value == "TARGET_REACHED":
        print(f"Target reached at step {step}!")
        break
