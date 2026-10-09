"""Simulated Sensors: 2D LiDAR Raycaster, Front RGB Camera, Depth Camera, IMU, and Odometry."""
import io
import math
import base64
import time
import numpy as np
from typing import List, Tuple, Optional, Dict, Any
from PIL import Image, ImageDraw, ImageFont

from ..models.world import LiDARHit, StaticObstacle, DynamicObstacle, TargetLocation
from ..models.robot import Pose2D, IMUData, Twist2D, CameraFrameData, DepthScanData, OdometryData
from ..core.config import settings


def ray_box_intersection(
    origin_x: float, origin_y: float,
    dir_x: float, dir_y: float,
    box_x: float, box_y: float,
    box_w: float, box_h: float
) -> Optional[float]:
    """Computes ray-AABB intersection distance. Returns distance if hit, else None."""
    min_x = box_x - box_w / 2.0
    max_x = box_x + box_w / 2.0
    min_y = box_y - box_h / 2.0
    max_y = box_y + box_h / 2.0

    tmin = -float('inf')
    tmax = float('inf')

    # X axis
    if abs(dir_x) > 1e-6:
        tx1 = (min_x - origin_x) / dir_x
        tx2 = (max_x - origin_x) / dir_x
        tmin = max(tmin, min(tx1, tx2))
        tmax = min(tmax, max(tx1, tx2))
    else:
        if origin_x < min_x or origin_x > max_x:
            return None

    # Y axis
    if abs(dir_y) > 1e-6:
        ty1 = (min_y - origin_y) / dir_y
        ty2 = (max_y - origin_y) / dir_y
        tmin = max(tmin, min(ty1, ty2))
        tmax = min(tmax, max(ty1, ty2))
    else:
        if origin_y < min_y or origin_y > max_y:
            return None

    if tmax >= tmin and tmax > 0:
        dist = tmin if tmin > 0 else tmax
        return dist
    return None


def ray_circle_intersection(
    origin_x: float, origin_y: float,
    dir_x: float, dir_y: float,
    cx: float, cy: float, radius: float
) -> Optional[float]:
    """Computes ray-circle intersection distance."""
    dx = origin_x - cx
    dy = origin_y - cy
    b = 2.0 * (dir_x * dx + dir_y * dy)
    c = dx * dx + dy * dy - radius * radius
    discriminant = b * b - 4.0 * c

    if discriminant < 0:
        return None

    sqrt_disc = math.sqrt(discriminant)
    t1 = (-b - sqrt_disc) / 2.0
    t2 = (-b + sqrt_disc) / 2.0

    if t1 > 0:
        return t1
    elif t2 > 0:
        return t2
    return None


class SimulatedLiDAR:
    """360-degree 2D planar LiDAR sensor simulation with raycasting."""
    def __init__(self, rays: int = 72, max_range: float = 8.0, fov: float = 360.0):
        self.rays = rays
        self.max_range = max_range
        self.fov_rad = math.radians(fov)

    def scan(
        self,
        robot_pose: Pose2D,
        static_obstacles: List[StaticObstacle],
        dynamic_obstacles: List[DynamicObstacle],
        targets: Optional[List[TargetLocation]] = None
    ) -> Tuple[List[LiDARHit], float]:
        hits: List[LiDARHit] = []
        nearest_distance = self.max_range
        angle_step = self.fov_rad / self.rays
        start_angle = -self.fov_rad / 2.0

        targets_to_check = targets or []

        for i in range(self.rays):
            rel_angle = start_angle + i * angle_step
            abs_angle = robot_pose.theta + rel_angle
            dir_x = math.cos(abs_angle)
            dir_y = math.sin(abs_angle)

            closest_t = self.max_range
            hit_detected = False

            # Check static obstacles (walls, shelves, tables, boxes)
            for obs in static_obstacles:
                t = ray_box_intersection(
                    robot_pose.x, robot_pose.y,
                    dir_x, dir_y,
                    obs.x, obs.y,
                    obs.width, obs.height
                )
                if t is not None and 0.0 < t < closest_t:
                    closest_t = t
                    hit_detected = True

            # Check dynamic obstacles (humanoids / workers)
            for dyn in dynamic_obstacles:
                t = ray_circle_intersection(
                    robot_pose.x, robot_pose.y,
                    dir_x, dir_y,
                    dyn.x, dyn.y,
                    dyn.radius
                )
                if t is not None and 0.0 < t < closest_t:
                    closest_t = t
                    hit_detected = True

            # Check solid targets (packages)
            for tgt in targets_to_check:
                if tgt.class_name in ["box", "package"]:
                    t = ray_circle_intersection(
                        robot_pose.x, robot_pose.y,
                        dir_x, dir_y,
                        tgt.x, tgt.y,
                        tgt.radius
                    )
                    if t is not None and 0.0 < t < closest_t:
                        closest_t = t
                        hit_detected = True

            # Add sensor Gaussian noise
            if hit_detected:
                noise = np.random.normal(0, settings.sensors.sensor_noise_sigma)
                closest_t = max(0.1, min(self.max_range, closest_t + noise))
                hit_x = robot_pose.x + dir_x * closest_t
                hit_y = robot_pose.y + dir_y * closest_t
                if closest_t < nearest_distance:
                    nearest_distance = closest_t
            else:
                hit_x = robot_pose.x + dir_x * self.max_range
                hit_y = robot_pose.y + dir_y * self.max_range

            hits.append(LiDARHit(
                angle=round(rel_angle, 4),
                distance=round(closest_t, 3),
                x=round(hit_x, 3),
                y=round(hit_y, 3),
                hit=hit_detected
            ))

        return hits, nearest_distance


class SimulatedDepthCamera:
    """RGB-D / Depth sensor simulation computing distance buffer and depth map."""
    def __init__(self, fov_deg: float = 80.0, num_columns: int = 80, min_range: float = 0.2, max_range: float = 8.0):
        self.fov_deg = fov_deg
        self.fov_rad = math.radians(fov_deg)
        self.num_columns = num_columns
        self.min_range = min_range
        self.max_range = max_range

    def scan(
        self,
        robot_pose: Pose2D,
        static_obstacles: List[StaticObstacle],
        dynamic_obstacles: List[DynamicObstacle],
        targets: Optional[List[TargetLocation]] = None
    ) -> DepthScanData:
        ranges: List[float] = []
        nearest = self.max_range
        angle_step = self.fov_rad / self.num_columns
        start_angle = -self.fov_rad / 2.0
        targets_to_check = targets or []

        for i in range(self.num_columns):
            rel_angle = start_angle + i * angle_step
            abs_angle = robot_pose.theta + rel_angle
            dir_x = math.cos(abs_angle)
            dir_y = math.sin(abs_angle)

            closest_t = self.max_range

            for obs in static_obstacles:
                t = ray_box_intersection(
                    robot_pose.x, robot_pose.y,
                    dir_x, dir_y,
                    obs.x, obs.y,
                    obs.width, obs.height
                )
                if t is not None and self.min_range <= t < closest_t:
                    closest_t = t

            for dyn in dynamic_obstacles:
                t = ray_circle_intersection(
                    robot_pose.x, robot_pose.y,
                    dir_x, dir_y,
                    dyn.x, dyn.y,
                    dyn.radius
                )
                if t is not None and self.min_range <= t < closest_t:
                    closest_t = t

            for tgt in targets_to_check:
                t = ray_circle_intersection(
                    robot_pose.x, robot_pose.y,
                    dir_x, dir_y,
                    tgt.x, tgt.y,
                    tgt.radius
                )
                if t is not None and self.min_range <= t < closest_t:
                    closest_t = t

            # Slight depth sensor noise (0.015m)
            noise = float(np.random.normal(0, 0.015))
            dist = max(self.min_range, min(self.max_range, closest_t + noise))
            ranges.append(round(dist, 3))
            if dist < nearest:
                nearest = dist

        # Render 2D pseudo-colored depth map image (160x120)
        depth_img_b64 = self._generate_depth_image(ranges)

        return DepthScanData(
            fov_degrees=self.fov_deg,
            num_points=self.num_columns,
            min_range=self.min_range,
            max_range=self.max_range,
            ranges=ranges,
            nearest_distance=round(nearest, 3),
            depth_image_base64=depth_img_b64,
            timestamp=round(time.time(), 3)
        )

    def _generate_depth_image(self, ranges: List[float]) -> str:
        w, h = 160, 100
        img = Image.new("RGB", (w, h), color=(10, 10, 25))
        draw = ImageDraw.Draw(img)

        col_w = max(1, w // len(ranges))
        for idx, dist in enumerate(ranges):
            # Normalize 0.0 (near) to 1.0 (far)
            norm = (dist - self.min_range) / (self.max_range - self.min_range)
            norm = max(0.0, min(1.0, norm))
            # Depth colormap: Near is bright cyan/magenta (180, 20, 200), Mid is blue (20, 120, 240), Far is dark navy (10, 20, 60)
            r = int((1.0 - norm) * 220)
            g = int((1.0 - abs(norm - 0.5) * 2.0) * 180)
            b = int(norm * 240)
            color = (r, g, b)

            x0 = idx * col_w
            x1 = x0 + col_w
            y0 = int(norm * 30)  # perspective horizon variation
            y1 = h
            draw.rectangle([x0, y0, x1, y1], fill=color)

        buf = io.BytesIO()
        img.save(buf, format="JPEG", quality=70)
        return "data:image/jpeg;base64," + base64.b64encode(buf.getvalue()).decode("utf-8")


class SimulatedRGBCamera:
    """Simulated Front-Facing RGB Camera with 1st-person Perspective Projection."""
    def __init__(self, width: int = 320, height: int = 240, fov_deg: float = 80.0):
        self.width = width
        self.height = height
        self.fov_deg = fov_deg
        self.fov_rad = math.radians(fov_deg)
        self.last_frame_array: Optional[np.ndarray] = None

    def capture(
        self,
        robot_pose: Pose2D,
        static_obstacles: List[StaticObstacle],
        dynamic_obstacles: List[DynamicObstacle],
        targets: List[TargetLocation],
        nearest_distance: float = 8.0,
        active_target_id: Optional[str] = None
    ) -> CameraFrameData:
        """Renders 1st-person synthetic camera view from the front of the robot."""
        img = Image.new("RGB", (self.width, self.height), color=(15, 23, 42))
        draw = ImageDraw.Draw(img)

        # 1. Industrial Warehouse Sky / Ceiling
        horizon_y = int(self.height * 0.45)
        draw.rectangle([0, 0, self.width, horizon_y], fill=(20, 28, 48))

        # Ceiling fluorescent lighting fixtures
        for lx in [int(self.width * 0.25), int(self.width * 0.5), int(self.width * 0.75)]:
            draw.line([(self.width // 2, horizon_y), (lx, 0)], fill=(51, 65, 85), width=1)
            draw.rectangle([lx - 12, 10, lx + 12, 16], fill=(224, 242, 254))

        # 2. Polished Concrete Floor
        draw.rectangle([0, horizon_y, self.width, self.height], fill=(26, 36, 56))

        # Floor perspective guide lines
        for floor_x in range(-self.width // 2, self.width * 2, 40):
            draw.line([(self.width // 2, horizon_y), (floor_x, self.height)], fill=(30, 41, 59), width=1)

        # Perspective distance lines
        for i in range(1, 6):
            py = int(horizon_y + ((i / 6.0) ** 2) * (self.height - horizon_y))
            draw.line([(0, py), (self.width, py)], fill=(30, 41, 59), width=1)

        # 3. Project objects in camera field of view (render back-to-front by distance)
        render_queue: List[Dict[str, Any]] = []
        rx, ry, rtheta = robot_pose.x, robot_pose.y, robot_pose.theta

        # Static obstacles
        for obs in static_obstacles:
            if obs.class_name == "wall":
                continue
            dx = obs.x - rx
            dy = obs.y - ry
            dist = math.sqrt(dx * dx + dy * dy)
            if dist > 8.0 or dist < 0.2:
                continue

            angle = math.atan2(dy, dx)
            rel_angle = (angle - rtheta + math.pi) % (2.0 * math.pi) - math.pi
            if abs(rel_angle) <= self.fov_rad / 2.0:
                render_queue.append({
                    "dist": dist,
                    "rel_angle": rel_angle,
                    "type": "static",
                    "obj": obs
                })

        # Dynamic obstacles (e.g. simulated person)
        for dyn in dynamic_obstacles:
            dx = dyn.x - rx
            dy = dyn.y - ry
            dist = math.sqrt(dx * dx + dy * dy)
            if dist > 8.0 or dist < 0.2:
                continue

            angle = math.atan2(dy, dx)
            rel_angle = (angle - rtheta + math.pi) % (2.0 * math.pi) - math.pi
            if abs(rel_angle) <= self.fov_rad / 2.0:
                render_queue.append({
                    "dist": dist,
                    "rel_angle": rel_angle,
                    "type": "person",
                    "obj": dyn
                })

        # Targets
        for tgt in targets:
            dx = tgt.x - rx
            dy = tgt.y - ry
            dist = math.sqrt(dx * dx + dy * dy)
            if dist > 8.0 or dist < 0.2:
                continue

            angle = math.atan2(dy, dx)
            rel_angle = (angle - rtheta + math.pi) % (2.0 * math.pi) - math.pi
            if abs(rel_angle) <= self.fov_rad / 2.0:
                render_queue.append({
                    "dist": dist,
                    "rel_angle": rel_angle,
                    "type": "target",
                    "obj": tgt
                })

        # Sort far to near (painter's algorithm)
        render_queue.sort(key=lambda item: item["dist"], reverse=True)

        # Draw projected entities
        for item in render_queue:
            dist = item["dist"]
            rel_angle = item["rel_angle"]
            center_x = int(self.width * (0.5 + rel_angle / self.fov_rad))

            if item["type"] == "person":
                # Render simulated humanoid worker with orange vest and helmet
                bh = int(min(self.height * 0.75, max(24, (1.8 / dist) * (self.height * 0.5))))
                bw = int(bh * 0.40)
                by = int(horizon_y + (0.5 / dist) * (self.height * 0.25))
                bx = center_x - bw // 2

                # Legs
                draw.rectangle([bx + bw // 6, by - bh // 3, bx + bw // 3, by], fill=(15, 23, 42))
                draw.rectangle([bx + bw * 2 // 3, by - bh // 3, bx + bw * 5 // 6, by], fill=(15, 23, 42))
                # Torso (Hi-Vis Safety Vest: Vibrant Orange)
                draw.rectangle([bx + bw // 8, by - bh * 2 // 3, bx + bw * 7 // 8, by - bh // 3], fill=(249, 115, 22))
                # Reflective stripes
                draw.line([(bx + bw // 8, by - bh // 2), (bx + bw * 7 // 8, by - bh // 2)], fill=(254, 240, 138), width=2)
                # Head & Safety Helmet
                head_r = max(3, bw // 3)
                head_cy = by - bh * 4 // 5
                draw.ellipse([center_x - head_r, head_cy - head_r, center_x + head_r, head_cy + head_r], fill=(250, 204, 21))

            elif item["type"] == "target":
                tgt = item["obj"]
                bh = int(min(self.height * 0.4, max(14, (0.6 / dist) * (self.height * 0.4))))
                bw = bh
                by = int(horizon_y + (0.3 / dist) * (self.height * 0.25))
                bx = center_x - bw // 2

                if "blue" in tgt.attribute or "blue" in tgt.id:
                    # Blue Shipping Package with parcel tag
                    draw.rectangle([bx, by - bh, bx + bw, by], fill=(37, 99, 235), outline=(96, 165, 250), width=2)
                    draw.rectangle([bx + bw // 4, by - bh * 3 // 4, bx + bw * 3 // 4, by - bh // 2], fill=(241, 245, 249))
                elif "charge" in tgt.id:
                    # Yellow Charging Station
                    draw.rectangle([bx, by - bh, bx + bw, by], fill=(234, 179, 8), outline=(254, 240, 138), width=2)
                else:
                    # Red Emergency Kit
                    draw.rectangle([bx, by - bh, bx + bw, by], fill=(239, 68, 68), outline=(252, 165, 165), width=2)

            elif item["type"] == "static":
                obs = item["obj"]
                size = max(obs.width, obs.height)
                bh = int(min(self.height * 0.6, max(16, (size / dist) * (self.height * 0.35))))
                bw = int(bh * (obs.width / max(obs.height, 0.1)))
                bw = max(12, min(bw, self.width // 2))
                by = int(horizon_y + (0.35 / dist) * (self.height * 0.25))
                bx = center_x - bw // 2

                if obs.class_name == "shelf":
                    draw.rectangle([bx, by - bh, bx + bw, by], fill=(71, 85, 105), outline=(100, 116, 139), width=2)
                    # Shelf tier bars
                    for tier in range(1, 4):
                        ty = by - (bh * tier // 4)
                        draw.line([(bx, ty), (bx + bw, ty)], fill=(148, 163, 184), width=1)
                elif obs.class_name == "table":
                    draw.rectangle([bx, by - bh // 2, bx + bw, by - bh // 3], fill=(148, 163, 184))
                    draw.line([(bx + 2, by - bh // 3), (bx + 2, by)], fill=(100, 116, 139), width=2)
                    draw.line([(bx + bw - 2, by - bh // 3), (bx + bw - 2, by)], fill=(100, 116, 139), width=2)
                else:
                    # Pallet Box / Crate
                    draw.rectangle([bx, by - bh, bx + bw, by], fill=(180, 83, 9), outline=(217, 119, 6), width=2)

        # 4. Camera HUD Crosshair & Telemetry
        cx, cy = self.width // 2, self.height // 2
        draw.line([(cx - 10, cy), (cx + 10, cy)], fill=(6, 182, 212), width=1)
        draw.line([(cx, cy - 10), (cx, cy + 10)], fill=(6, 182, 212), width=1)

        # Status text in HUD (Corner)
        hud_text = f"CAM 20 FPS | DIST: {nearest_distance:.2f}m"
        draw.text((6, 6), hud_text, fill=(6, 182, 212))

        self.last_frame_array = np.array(img)

        buf = io.BytesIO()
        img.save(buf, format="JPEG", quality=75)
        img_b64 = "data:image/jpeg;base64," + base64.b64encode(buf.getvalue()).decode("utf-8")

        return CameraFrameData(
            width=self.width,
            height=self.height,
            fov_degrees=self.fov_deg,
            fps=20,
            image_base64=img_b64,
            timestamp=round(time.time(), 3)
        )


class SimulatedIMU:
    """6-DOF IMU Sensor simulation with linear accelerometers and rate gyroscopes."""
    def __init__(self):
        self.prev_linear_vel = 0.0
        self.prev_angular_vel = 0.0

    def update(self, twist: Twist2D, theta: float, dt: float) -> IMUData:
        dt_safe = max(dt, 1e-4)
        accel_linear_x = (twist.linear - self.prev_linear_vel) / dt_safe
        # Centripetal acceleration in Y: a_y = v * omega
        accel_centripetal_y = twist.linear * twist.angular

        self.prev_linear_vel = twist.linear
        self.prev_angular_vel = twist.angular

        # Realistic sensor noise and bias
        noise_ax = float(np.random.normal(0, 0.015))
        noise_ay = float(np.random.normal(0, 0.015))
        noise_az = float(np.random.normal(0, 0.015))
        noise_wz = float(np.random.normal(0, 0.005))

        return IMUData(
            linear_acceleration_x=round(accel_linear_x + noise_ax, 4),
            linear_acceleration_y=round(accel_centripetal_y + noise_ay, 4),
            linear_acceleration_z=round(9.81 + noise_az, 4),  # Gravity vector (1g)
            angular_velocity_z=round(twist.angular + noise_wz, 4),
            yaw=round(theta, 4),
            pitch=0.0,
            roll=0.0,
            timestamp=round(time.time(), 3)
        )


class SimulatedOdometrySensor:
    """Wheel Odometry Sensor computing dead-reckoning pose and velocity estimates."""
    def __init__(self):
        self.total_distance = 0.0

    def update(
        self,
        pose: Pose2D,
        twist: Twist2D,
        total_distance: float,
        left_ticks: int,
        right_ticks: int,
        left_rad_s: float,
        right_rad_s: float
    ) -> OdometryData:
        return OdometryData(
            pose=pose.model_copy(),
            twist=twist.model_copy(),
            total_distance=round(total_distance, 3),
            left_ticks=left_ticks,
            right_ticks=right_ticks,
            left_wheel_rad_s=left_rad_s,
            right_wheel_rad_s=right_rad_s,
            frame_id="odom",
            child_frame_id="base_footprint",
            timestamp=round(time.time(), 3)
        )
