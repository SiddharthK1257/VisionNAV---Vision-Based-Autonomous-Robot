"""2D Occupancy Grid Map with Obstacle Inflation for VisionNav AI."""
import math
import numpy as np
from typing import List, Tuple, Optional
from ..models.world import StaticObstacle, DynamicObstacle


class OccupancyGrid:
    def __init__(self, width: float = 20.0, height: float = 14.0, resolution: float = 0.2):
        self.width = width
        self.height = height
        self.resolution = resolution  # meters per grid cell
        self.cols = int(math.ceil(width / resolution))
        self.rows = int(math.ceil(height / resolution))

        # 0 = free, 100 = static occupied, 90 = dynamic occupied
        self.static_grid = np.zeros((self.rows, self.cols), dtype=np.int8)
        self.grid = np.zeros((self.rows, self.cols), dtype=np.int8)
        from ..core.config import settings
        self.inflation_radius = settings.safety.inflation_radius  # meters (robot footprint + safety buffer)
        self.local_obstacles: List[dict] = []

    def world_to_grid(self, x: float, y: float) -> Tuple[int, int]:
        c = int(x / self.resolution)
        r = int(y / self.resolution)
        c = max(0, min(self.cols - 1, c))
        r = max(0, min(self.rows - 1, r))
        return (c, r)

    def grid_to_world(self, c: int, r: int) -> Tuple[float, float]:
        x = (c + 0.5) * self.resolution
        y = (r + 0.5) * self.resolution
        return (round(x, 2), round(y, 2))

    def load_static_obstacles(self, static_obstacles: List[StaticObstacle]):
        self.static_grid.fill(0)
        for obs in static_obstacles:
            min_x = obs.x - obs.width / 2.0
            max_x = obs.x + obs.width / 2.0
            min_y = obs.y - obs.height / 2.0
            max_y = obs.y + obs.height / 2.0

            c_min, r_min = self.world_to_grid(min_x, min_y)
            c_max, r_max = self.world_to_grid(max_x, max_y)

            self.static_grid[r_min:r_max + 1, c_min:c_max + 1] = 100

        # Inflate static obstacles for robot safety clearance
        self.inflate_static_grid()
        self.reset_combined_grid()

    def inflate_static_grid(self):
        cells_infl = int(math.ceil(self.inflation_radius / self.resolution))
        occupied_indices = np.argwhere(self.static_grid == 100)

        for r, c in occupied_indices:
            r_start = max(0, r - cells_infl)
            r_end = min(self.rows, r + cells_infl + 1)
            c_start = max(0, c - cells_infl)
            c_end = min(self.cols, c + cells_infl + 1)

            for ir in range(r_start, r_end):
                for ic in range(c_start, c_end):
                    dist = math.sqrt((ir - r) ** 2 + (ic - c) ** 2) * self.resolution
                    if dist <= self.inflation_radius and self.static_grid[ir, ic] == 0:
                        self.static_grid[ir, ic] = 80  # Inflated cost

    def reset_combined_grid(self):
        np.copyto(self.grid, self.static_grid)
        # Re-apply any registered local obstacles
        for obs in self.local_obstacles:
            self._rasterize_obstacle_circle(obs["x"], obs["y"], obs["radius"])

    def add_local_obstacle(self, x: float, y: float, radius: float = 0.45, obstacle_id: Optional[str] = None):
        """Registers a dynamically detected obstacle into the local costmap."""
        obs_id = obstacle_id or f"local_obs_{len(self.local_obstacles) + 1}"
        # Avoid duplicate registration
        for obs in self.local_obstacles:
            if math.hypot(obs["x"] - x, obs["y"] - y) < 0.3:
                return
        self.local_obstacles.append({"id": obs_id, "x": x, "y": y, "radius": radius})
        self._rasterize_obstacle_circle(x, y, radius)

    def clear_local_obstacles(self):
        self.local_obstacles.clear()
        self.reset_combined_grid()

    def _rasterize_obstacle_circle(self, x: float, y: float, radius: float):
        c, r = self.world_to_grid(x, y)
        total_radius = radius + self.inflation_radius
        cells_radius = int(math.ceil(total_radius / self.resolution))

        r_start = max(0, r - cells_radius)
        r_end = min(self.rows, r + cells_radius + 1)
        c_start = max(0, c - cells_radius)
        c_end = min(self.cols, c + cells_radius + 1)

        for ir in range(r_start, r_end):
            for ic in range(c_start, c_end):
                dist = math.sqrt((ir - r) ** 2 + (ic - c) ** 2) * self.resolution
                if dist <= total_radius:
                    cost = 100 if dist <= radius else 90
                    self.grid[ir, ic] = max(self.grid[ir, ic], cost)

    def update_dynamic_obstacles(self, dynamic_obstacles: List[DynamicObstacle]):
        self.reset_combined_grid()
        for dyn in dynamic_obstacles:
            self._rasterize_obstacle_circle(dyn.x, dyn.y, dyn.radius)

    def is_free(self, c: int, r: int) -> bool:
        if 0 <= c < self.cols and 0 <= r < self.rows:
            return self.grid[r, c] < 80
        return False

    def is_world_pos_free(self, x: float, y: float) -> bool:
        c, r = self.world_to_grid(x, y)
        return self.is_free(c, r)
