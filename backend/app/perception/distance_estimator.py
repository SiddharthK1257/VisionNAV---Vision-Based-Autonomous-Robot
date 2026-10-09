"""Distance and 3D Position Estimator: Fuses Pinhole Camera Optics and Depth Sensor Readings."""
import math
from typing import Tuple, Optional, Dict
from ..models.perception import BoundingBox
from ..models.robot import DepthScanData


CLASS_REFERENCE_HEIGHTS: Dict[str, float] = {
    "person": 1.75,      # Average standing human (m)
    "chair": 0.85,       # Office/warehouse chair (m)
    "table": 0.75,       # Staging workbench / table (m)
    "box": 0.50,         # Standard storage container / crate (m)
    "backpack": 0.45,    # Utility backpack (m)
    "bottle": 0.25,      # Water/fluid bottle (m)
    "laptop": 0.25,      # Open laptop terminal (m)
    "door": 2.20,        # Roll-up door / doorway (m)
    "obstacle": 1.50,    # General storage rack or partition barrier (m)
}


class DistanceEstimator:
    """Estimates metric distance and 3D position relative to robot chassis."""
    def __init__(self, fov_deg: float = 80.0, fov_v_deg: float = 60.0, image_height: int = 480):
        self.fov_h_rad = math.radians(fov_deg)
        self.fov_v_rad = math.radians(fov_v_deg)
        self.image_height = image_height
        # Focal length in pixels
        self.focal_length = (image_height / 2.0) / math.tan(self.fov_v_rad / 2.0)

    def estimate(
        self,
        bbox: BoundingBox,
        class_name: str,
        depth_scan: Optional[DepthScanData] = None,
        image_h: int = 480
    ) -> Tuple[float, Tuple[float, float, float]]:
        """
        Estimates distance (meters) and local 3D coordinates (x_forward, y_left, z_up) in robot frame.
        Fuses pinhole camera focal scaling with active depth sensor readings.
        """
        ref_h = CLASS_REFERENCE_HEIGHTS.get(class_name.lower(), 0.60)
        pixel_h = max(4.0, bbox.height * image_h)

        # 1. Pinhole optical distance estimation: d = (f * H_real) / h_pixels
        d_pinhole = (self.focal_length * ref_h) / pixel_h
        d_pinhole = max(0.2, min(12.0, d_pinhole))

        # 2. Horizontal bearing angle relative to robot forward heading
        u_center = bbox.x + bbox.width / 2.0
        rel_angle = (u_center - 0.5) * self.fov_h_rad

        # 3. Depth Sensor Fusion
        d_final = d_pinhole
        if depth_scan and depth_scan.ranges:
            col_idx = int(u_center * len(depth_scan.ranges))
            col_idx = max(0, min(len(depth_scan.ranges) - 1, col_idx))
            depth_reading = depth_scan.ranges[col_idx]

            # If depth sensor has a valid return (below max range)
            if depth_scan.min_range <= depth_reading < depth_scan.max_range:
                # Weighted fusion (85% depth sensor accuracy, 15% optical verification)
                d_final = 0.85 * depth_reading + 0.15 * d_pinhole

        d_final = round(max(0.1, min(10.0, d_final)), 2)

        # 4. Transform to 3D Cartesian in robot coordinate frame (X=forward, Y=left, Z=up)
        # Note: in standard robotics frame, positive Y is left, negative Y is right
        x_forward = round(d_final * math.cos(rel_angle), 2)
        y_left = round(-d_final * math.sin(rel_angle), 2)
        z_up = round(ref_h / 2.0, 2)

        return d_final, (x_forward, y_left, z_up)
