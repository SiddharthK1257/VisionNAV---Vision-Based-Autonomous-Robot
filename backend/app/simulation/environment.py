"""Pre-configured realistic indoor environments for VisionNav AI."""
from typing import Dict, List, Tuple
from ..models.world import (
    EnvironmentType,
    StaticObstacle,
    DynamicObstacle,
    TargetLocation
)


class EnvironmentDefinition:
    def __init__(
        self,
        env_type: EnvironmentType,
        width: float,
        height: float,
        robot_start: Tuple[float, float, float],  # x, y, theta
        static_obstacles: List[StaticObstacle],
        dynamic_obstacles: List[DynamicObstacle],
        targets: List[TargetLocation]
    ):
        self.env_type = env_type
        self.width = width
        self.height = height
        self.robot_start = robot_start
        self.static_obstacles = static_obstacles
        self.dynamic_obstacles = dynamic_obstacles
        self.targets = targets


def create_warehouse_environment() -> EnvironmentDefinition:
    """Creates realistic Warehouse environment with storage racks, boxes, and a moving worker."""
    width = 20.0
    height = 14.0
    robot_start = (2.0, 2.0, 0.0)

    static_obstacles = [
        # Perimeter boundaries
        StaticObstacle(id="wall_north", name="North Wall", class_name="wall", x=10.0, y=13.8, width=20.0, height=0.4, color="#334155"),
        StaticObstacle(id="wall_south", name="South Wall", class_name="wall", x=10.0, y=0.2, width=20.0, height=0.4, color="#334155"),
        StaticObstacle(id="wall_west", name="West Wall", class_name="wall", x=0.2, y=7.0, width=0.4, height=14.0, color="#334155"),
        StaticObstacle(id="wall_east", name="East Wall", class_name="wall", x=19.8, y=7.0, width=0.4, height=14.0, color="#334155"),

        # High-bay Storage Racks (Obstacles)
        StaticObstacle(id="shelf_1", name="Storage Rack A", class_name="shelf", x=5.5, y=4.5, width=1.4, height=5.0, color="#475569", attribute="rack", is_furniture=True),
        StaticObstacle(id="shelf_2", name="Storage Rack B", class_name="shelf", x=9.5, y=9.5, width=1.4, height=5.5, color="#475569", attribute="rack", is_furniture=True),
        StaticObstacle(id="shelf_3", name="Storage Rack C", class_name="shelf", x=13.5, y=4.5, width=1.4, height=5.0, color="#475569", attribute="rack", is_furniture=True),

        # Staging partition barrier (Obstacle)
        StaticObstacle(id="obs_barrier", name="Safety Staging Barrier", class_name="obstacle", x=9.5, y=3.0, width=1.4, height=2.0, color="#64748b", attribute="barrier"),

        # Workbenches & Staging Tables
        StaticObstacle(id="table_pack", name="Packing Table", class_name="table", x=3.5, y=11.0, width=2.5, height=1.2, color="#94a3b8", is_furniture=True),
        StaticObstacle(id="table_inspect", name="QA Inspection Table", class_name="table", x=16.5, y=11.0, width=2.5, height=1.2, color="#94a3b8", is_furniture=True),

        # Staged boxes & pallets
        StaticObstacle(id="box_pallet_1", name="Brown Pallet Crate", class_name="box", x=7.5, y=1.8, width=1.0, height=1.0, color="#b45309", attribute="brown"),
        StaticObstacle(id="box_red", name="Red Emergency Kit", class_name="box", x=17.5, y=2.5, width=0.8, height=0.8, color="#ef4444", attribute="red"),
        StaticObstacle(id="chair_1", name="Forklift Operator Chair", class_name="chair", x=2.0, y=11.0, width=0.7, height=0.7, color="#64748b", is_furniture=True),

        # Small utility items on tables (backpack, bottle, laptop)
        StaticObstacle(id="backpack_worker", name="Technician Backpack", class_name="backpack", x=3.5, y=11.3, width=0.45, height=0.45, color="#1e40af", attribute="blue"),
        StaticObstacle(id="bottle_water", name="Stainless Water Bottle", class_name="bottle", x=3.8, y=10.8, width=0.25, height=0.25, color="#06b6d4", attribute="cyan"),
        StaticObstacle(id="laptop_qa", name="QA Inventory Terminal", class_name="laptop", x=16.5, y=11.0, width=0.50, height=0.40, color="#38bdf8", attribute="silver"),

        # Industrial doorway
        StaticObstacle(id="door_bay", name="Loading Bay Roll-Up Door", class_name="door", x=19.8, y=7.0, width=0.40, height=3.0, color="#94a3b8", attribute="metal"),
    ]

    # Dynamic Obstacle: Warehouse Worker (Simulated Humanoid) patrolling across the central corridor
    dynamic_obstacles = [
        DynamicObstacle(
            id="person_worker_1",
            name="Warehouse Technician Alex",
            class_name="person",
            x=9.5,
            y=6.5,
            radius=0.40,
            speed=0.35,
            waypoints=[(9.5, 6.5), (9.5, 8.0), (11.5, 8.0), (11.5, 6.0), (9.5, 6.5)],
            attribute="worker",
            color="#f97316"
        )
    ]

    # Target Locations and Key Objects
    targets = [
        TargetLocation(id="tgt_blue_box", name="Blue Shipping Package", class_name="box", attribute="blue", x=16.5, y=5.5, radius=0.45, color="#2563eb"),
        TargetLocation(id="tgt_charge", name="Charging Station", class_name="charging_station", attribute="yellow", x=2.0, y=2.0, radius=0.5, color="#eab308"),
        TargetLocation(id="tgt_inspect", name="Inspection Zone", class_name="inspection_zone", attribute="green", x=16.5, y=11.0, radius=0.6, color="#10b981"),
        TargetLocation(id="tgt_red_box", name="Red Package", class_name="box", attribute="red", x=17.5, y=2.5, radius=0.45, color="#ef4444"),
    ]

    return EnvironmentDefinition(
        env_type=EnvironmentType.WAREHOUSE,
        width=width,
        height=height,
        robot_start=robot_start,
        static_obstacles=static_obstacles,
        dynamic_obstacles=dynamic_obstacles,
        targets=targets
    )


def create_office_environment() -> EnvironmentDefinition:
    """Creates realistic Office environment with cubicles, conference tables, and wandering colleague."""
    width = 18.0
    height = 12.0
    robot_start = (2.0, 2.0, 0.0)

    static_obstacles = [
        # Perimeter boundaries
        StaticObstacle(id="off_wall_n", name="North Wall", class_name="wall", x=9.0, y=11.8, width=18.0, height=0.4, color="#334155"),
        StaticObstacle(id="off_wall_s", name="South Wall", class_name="wall", x=9.0, y=0.2, width=18.0, height=0.4, color="#334155"),
        StaticObstacle(id="off_wall_w", name="West Wall", class_name="wall", x=0.2, y=6.0, width=0.4, height=12.0, color="#334155"),
        StaticObstacle(id="off_wall_e", name="East Wall", class_name="wall", x=17.8, y=6.0, width=0.4, height=12.0, color="#334155"),

        # Conference room partition
        StaticObstacle(id="conf_wall_1", name="Conference Room Glass", class_name="wall", x=6.5, y=8.5, width=0.3, height=6.0, color="#64748b"),
        StaticObstacle(id="conf_table", name="Conference Table", class_name="table", x=3.5, y=8.5, width=3.0, height=1.6, color="#475569", is_furniture=True),
        StaticObstacle(id="chair_c1", name="Executive Chair", class_name="chair", x=2.0, y=8.5, width=0.6, height=0.6, color="#64748b", is_furniture=True),
        StaticObstacle(id="chair_c2", name="Executive Chair", class_name="chair", x=5.0, y=8.5, width=0.6, height=0.6, color="#64748b", is_furniture=True),

        # Open Desk Pods
        StaticObstacle(id="desk_pod_1", name="Desk Workstation 1", class_name="table", x=11.5, y=8.5, width=2.8, height=1.4, color="#64748b", is_furniture=True),
        StaticObstacle(id="laptop_1", name="Developer Laptop", class_name="laptop", x=11.2, y=8.5, width=0.5, height=0.4, color="#38bdf8"),
        StaticObstacle(id="desk_pod_2", name="Desk Workstation 2", class_name="table", x=11.5, y=4.0, width=2.8, height=1.4, color="#64748b", is_furniture=True),

        # Coffee and lounge area
        StaticObstacle(id="coffee_counter", name="Coffee Bar Counter", class_name="table", x=15.5, y=2.0, width=2.5, height=1.0, color="#94a3b8", is_furniture=True),
        StaticObstacle(id="bottle_1", name="Water Bottle", class_name="bottle", x=15.5, y=2.0, width=0.3, height=0.3, color="#06b6d4"),
    ]

    dynamic_obstacles = [
        DynamicObstacle(
            id="person_colleague",
            name="Office Colleague Sarah",
            class_name="person",
            x=8.5,
            y=4.5,
            radius=0.38,
            speed=0.28,
            waypoints=[(8.5, 4.5), (8.5, 7.5), (14.0, 7.5), (14.0, 4.5), (8.5, 4.5)],
            attribute="colleague",
            color="#ec4899"
        )
    ]

    targets = [
        TargetLocation(id="tgt_meeting", name="Meeting Area", class_name="meeting_area", attribute="conference", x=3.5, y=8.5, radius=0.6, color="#8b5cf6"),
        TargetLocation(id="tgt_blue_box", name="Blue Archive Box", class_name="box", attribute="blue", x=15.5, y=9.0, radius=0.45, color="#2563eb"),
        TargetLocation(id="tgt_charge", name="Docking Bay", class_name="charging_station", attribute="yellow", x=2.0, y=2.0, radius=0.5, color="#eab308"),
        TargetLocation(id="tgt_laptop", name="Developer Laptop", class_name="laptop", attribute="silver", x=11.2, y=8.5, radius=0.4, color="#38bdf8")
    ]

    return EnvironmentDefinition(
        env_type=EnvironmentType.OFFICE,
        width=width,
        height=height,
        robot_start=robot_start,
        static_obstacles=static_obstacles,
        dynamic_obstacles=dynamic_obstacles,
        targets=targets
    )


def create_smart_lab_environment() -> EnvironmentDefinition:
    """Creates realistic Smart Laboratory environment with clean benches, sample storage, and lab tech."""
    width = 18.0
    height = 14.0
    robot_start = (2.0, 2.0, 0.0)

    static_obstacles = [
        # Perimeter boundaries
        StaticObstacle(id="lab_wall_n", name="North Wall", class_name="wall", x=9.0, y=13.8, width=18.0, height=0.4, color="#334155"),
        StaticObstacle(id="lab_wall_s", name="South Wall", class_name="wall", x=9.0, y=0.2, width=18.0, height=0.4, color="#334155"),
        StaticObstacle(id="lab_wall_w", name="West Wall", class_name="wall", x=0.2, y=7.0, width=0.4, height=14.0, color="#334155"),
        StaticObstacle(id="lab_wall_e", name="East Wall", class_name="wall", x=17.8, y=7.0, width=0.4, height=14.0, color="#334155"),

        # Cleanroom Benches
        StaticObstacle(id="bench_1", name="Centrifuge & PCR Bench", class_name="table", x=5.5, y=9.5, width=1.5, height=5.5, color="#0ea5e9", is_furniture=True),
        StaticObstacle(id="bench_2", name="Spectroscopy Bench", class_name="table", x=12.5, y=9.5, width=1.5, height=5.5, color="#0ea5e9", is_furniture=True),
        StaticObstacle(id="fume_hood", name="Biohazard Fume Hood", class_name="table", x=9.0, y=12.5, width=3.0, height=1.2, color="#0284c7", is_furniture=True),

        # Cryo-storage cabinets
        StaticObstacle(id="cryo_shelf", name="Cryogenic Reagent Freezer", class_name="shelf", x=5.5, y=3.5, width=1.4, height=3.5, color="#64748b", is_furniture=True),
        StaticObstacle(id="specimen_box", name="Blue Cryo Sample Box", class_name="box", x=14.5, y=4.0, width=0.8, height=0.8, color="#2563eb", attribute="blue"),
    ]

    dynamic_obstacles = [
        DynamicObstacle(
            id="person_lab_tech",
            name="Lab Technician Dr. Chen",
            class_name="person",
            x=9.0,
            y=6.0,
            radius=0.40,
            speed=0.30,
            waypoints=[(9.0, 6.0), (9.0, 8.5), (7.5, 8.5), (7.5, 6.0), (9.0, 6.0)],
            attribute="scientist",
            color="#06b6d4"
        )
    ]

    targets = [
        TargetLocation(id="tgt_blue_box", name="Blue Cryo Sample Box", class_name="box", attribute="blue", x=14.5, y=4.0, radius=0.45, color="#2563eb"),
        TargetLocation(id="tgt_sample_station", name="Sample Analysis Station", class_name="station", attribute="cleanroom", x=14.5, y=10.0, radius=0.6, color="#10b981"),
        TargetLocation(id="tgt_charge", name="Cleanroom Charging Dock", class_name="charging_station", attribute="yellow", x=2.0, y=2.0, radius=0.5, color="#eab308"),
    ]

    return EnvironmentDefinition(
        env_type=EnvironmentType.SMART_LAB,
        width=width,
        height=height,
        robot_start=robot_start,
        static_obstacles=static_obstacles,
        dynamic_obstacles=dynamic_obstacles,
        targets=targets
    )


def get_environment(env_type: EnvironmentType) -> EnvironmentDefinition:
    if env_type == EnvironmentType.OFFICE:
        return create_office_environment()
    elif env_type == EnvironmentType.SMART_LAB:
        return create_smart_lab_environment()
    else:
        return create_warehouse_environment()

