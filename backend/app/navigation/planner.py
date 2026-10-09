"""A* Global Path Planner with 8-Connectivity and Path Smoothing."""
import heapq
import math
import time
from typing import List, Tuple, Optional, Dict
from ..models.navigation import PathPlan, Waypoint
from .occupancy_grid import OccupancyGrid


class AStarPlanner:
    def __init__(self, occupancy_grid: OccupancyGrid):
        self.grid = occupancy_grid
        # 8 directions: (dc, dr, cost)
        self.motions = [
            (1, 0, 1.0),
            (-1, 0, 1.0),
            (0, 1, 1.0),
            (0, -1, 1.0),
            (1, 1, math.sqrt(2)),
            (1, -1, math.sqrt(2)),
            (-1, 1, math.sqrt(2)),
            (-1, -1, math.sqrt(2)),
        ]

    def plan_path(self, start_pos: Tuple[float, float], goal_pos: Tuple[float, float]) -> Optional[PathPlan]:
        start_c, start_r = self.grid.world_to_grid(start_pos[0], start_pos[1])
        goal_c, goal_r = self.grid.world_to_grid(goal_pos[0], goal_pos[1])

        # If goal is directly in an occupied cell, find nearest free neighbor
        if not self.grid.is_free(goal_c, goal_r):
            goal_c, goal_r = self._find_nearest_free_cell(goal_c, goal_r)
            if goal_c is None:
                return None

        # Priority queue for A* (f_score, counter, c, r)
        open_set = []
        counter = 0
        h_start = self._heuristic(start_c, start_r, goal_c, goal_r)
        heapq.heappush(open_set, (h_start, counter, start_c, start_r))

        came_from: Dict[Tuple[int, int], Tuple[int, int]] = {}
        g_score: Dict[Tuple[int, int], float] = {(start_c, start_r): 0.0}
        closed_set = set()

        max_iterations = 10000
        iterations = 0

        while open_set and iterations < max_iterations:
            iterations += 1
            current_f, _, curr_c, curr_r = heapq.heappop(open_set)

            if (curr_c, curr_r) == (goal_c, goal_r):
                # Goal reached! Reconstruct raw grid path
                raw_path = self._reconstruct_path(came_from, (curr_c, curr_r))
                # Smooth path to remove grid artifacts
                smoothed_waypoints = self._smooth_and_convert_path(raw_path, start_pos, goal_pos)
                
                # Compute total length
                total_len = 0.0
                for i in range(len(smoothed_waypoints) - 1):
                    p1 = smoothed_waypoints[i]
                    p2 = smoothed_waypoints[i + 1]
                    total_len += math.sqrt((p2.x - p1.x) ** 2 + (p2.y - p1.y) ** 2)

                return PathPlan(
                    waypoints=smoothed_waypoints,
                    total_length=round(total_len, 2),
                    generated_at=time.time(),
                    is_valid=True
                )

            closed_set.add((curr_c, curr_r))

            for dc, dr, step_cost in self.motions:
                nc, nr = curr_c + dc, curr_r + dr

                if (nc, nr) in closed_set:
                    continue

                if not self.grid.is_free(nc, nr):
                    continue

                # Diagonal move check: ensure corners aren't cutting obstacles
                if dc != 0 and dr != 0:
                    if not self.grid.is_free(curr_c + dc, curr_r) or not self.grid.is_free(curr_c, curr_r + dr):
                        continue

                tentative_g = g_score[(curr_c, curr_r)] + step_cost

                if (nc, nr) not in g_score or tentative_g < g_score[(nc, nr)]:
                    came_from[(nc, nr)] = (curr_c, curr_r)
                    g_score[(nc, nr)] = tentative_g
                    f_score = tentative_g + self._heuristic(nc, nr, goal_c, goal_r)
                    counter += 1
                    heapq.heappush(open_set, (f_score, counter, nc, nr))

        return None  # Path not found

    def _heuristic(self, c1: int, r1: int, c2: int, r2: int) -> float:
        # Octile distance
        dx = abs(c1 - c2)
        dy = abs(r1 - r2)
        return 1.0 * (dx + dy) + (math.sqrt(2) - 2.0) * min(dx, dy)

    def _find_nearest_free_cell(self, c: int, r: int, search_radius: int = 5) -> Tuple[Optional[int], Optional[int]]:
        for rad in range(1, search_radius + 1):
            for dc in range(-rad, rad + 1):
                for dr in range(-rad, rad + 1):
                    if self.grid.is_free(c + dc, r + dr):
                        return (c + dc, r + dr)
        return (None, None)

    def _reconstruct_path(
        self,
        came_from: Dict[Tuple[int, int], Tuple[int, int]],
        current: Tuple[int, int]
    ) -> List[Tuple[int, int]]:
        path = [current]
        while current in came_from:
            current = came_from[current]
            path.append(current)
        path.reverse()
        return path

    def _has_line_of_sight(self, p1: Tuple[float, float], p2: Tuple[float, float]) -> bool:
        """Bresenham-style ray test on the occupancy grid to check if direct path is collision-free."""
        dist = math.sqrt((p2[0] - p1[0]) ** 2 + (p2[1] - p1[1]) ** 2)
        steps = max(2, int(dist / (self.grid.resolution * 0.5)))
        for s in range(steps + 1):
            t = s / steps
            x = p1[0] + t * (p2[0] - p1[0])
            y = p1[1] + t * (p2[1] - p1[1])
            if not self.grid.is_world_pos_free(x, y):
                return False
        return True

    def _smooth_and_convert_path(
        self,
        raw_grid_path: List[Tuple[int, int]],
        start_world: Tuple[float, float],
        goal_world: Tuple[float, float]
    ) -> List[Waypoint]:
        if not raw_grid_path:
            return []

        # Convert to world coordinates
        world_pts = [start_world]
        for c, r in raw_grid_path[1:-1]:
            world_pts.append(self.grid.grid_to_world(c, r))
        world_pts.append(goal_world)

        # Greedy line-of-sight shortcutting
        smoothed: List[Tuple[float, float]] = [world_pts[0]]
        curr_idx = 0
        while curr_idx < len(world_pts) - 1:
            furthest_visible = curr_idx + 1
            for next_idx in range(len(world_pts) - 1, curr_idx, -1):
                if self._has_line_of_sight(world_pts[curr_idx], world_pts[next_idx]):
                    furthest_visible = next_idx
                    break
            smoothed.append(world_pts[furthest_visible])
            curr_idx = furthest_visible

        # Build Waypoint objects with orientations
        waypoints: List[Waypoint] = []
        for i in range(len(smoothed)):
            p = smoothed[i]
            theta = 0.0
            if i < len(smoothed) - 1:
                next_p = smoothed[i + 1]
                theta = math.atan2(next_p[1] - p[1], next_p[0] - p[0])
            elif len(waypoints) > 0:
                theta = waypoints[-1].theta

            waypoints.append(Waypoint(x=p[0], y=p[1], theta=round(theta, 3)))

        return waypoints
