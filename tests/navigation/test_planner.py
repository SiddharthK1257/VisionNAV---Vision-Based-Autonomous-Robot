"""Unit tests for A* Path Planner and Occupancy Grid."""
import pytest
from backend.app.navigation.occupancy_grid import OccupancyGrid
from backend.app.navigation.planner import AStarPlanner
from backend.app.models.world import StaticObstacle


def test_occupancy_grid_loading():
    grid = OccupancyGrid(width=10.0, height=10.0, resolution=0.2)
    obstacle = StaticObstacle(
        id="test_box",
        name="Test Box",
        class_name="box",
        x=5.0,
        y=5.0,
        width=1.0,
        height=1.0
    )
    grid.load_static_obstacles([obstacle])
    c, r = grid.world_to_grid(5.0, 5.0)
    assert not grid.is_free(c, r), "Center of obstacle should be occupied"

    # Far away point should be free
    c_free, r_free = grid.world_to_grid(1.0, 1.0)
    assert grid.is_free(c_free, r_free), "Point (1.0, 1.0) should be free"


def test_astar_planner_finds_path():
    grid = OccupancyGrid(width=10.0, height=10.0, resolution=0.2)
    planner = AStarPlanner(grid)

    start = (1.0, 1.0)
    goal = (8.0, 8.0)
    plan = planner.plan_path(start, goal)

    assert plan is not None, "A* should successfully find a path in an open field"
    assert len(plan.waypoints) >= 2, "Path should contain at least start and goal waypoints"
    assert plan.total_length > 0.0, "Path length should be greater than zero"


def test_astar_planner_detours_around_obstacle():
    grid = OccupancyGrid(width=10.0, height=10.0, resolution=0.2)
    # Place a wall blocking direct line of sight between (2, 5) and (8, 5)
    wall = StaticObstacle(
        id="block_wall",
        name="Divider",
        class_name="wall",
        x=5.0,
        y=5.0,
        width=0.4,
        height=6.0
    )
    grid.load_static_obstacles([wall])
    planner = AStarPlanner(grid)

    start = (2.0, 5.0)
    goal = (8.0, 5.0)
    plan = planner.plan_path(start, goal)

    assert plan is not None, "A* should find a detour around the dividing wall"
    # Ensure no waypoint lies inside the wall
    for wp in plan.waypoints:
        assert not (4.5 <= wp.x <= 5.5 and 2.0 <= wp.y <= 8.0), f"Waypoint {wp} intersects the wall!"
