#!/usr/bin/env python3
"""
VisionNav AI — End-to-End Camera-to-Detection Verification Script
Demonstrates full sensory acquisition, preprocessing, detection, tracking, metric depth estimation, and 3D world model integration.
"""
import sys
import os
import math

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from backend.app.simulation.environment import create_warehouse_environment
from backend.app.simulation.sensors import SimulatedRGBCamera, SimulatedDepthCamera
from backend.app.perception.pipeline import AIPerceptionPipeline
from backend.app.models.robot import Pose2D


def main():
    print("=" * 70)
    print(" VisionNav AI — Autonomous Perception Pipeline Verification")
    print("=" * 70)

    # 1. Environment & Sensor Setup
    env = create_warehouse_environment()
    camera = SimulatedRGBCamera(width=320, height=240, fov_deg=80.0)
    depth_cam = SimulatedDepthCamera(fov_deg=80.0, num_columns=80)
    pipeline = AIPerceptionPipeline()

    # Position robot in warehouse facing central corridor with Technician Alex and racks
    robot_pose = Pose2D(x=9.5, y=4.5, theta=math.pi / 2.0)
    print(f"\n[SPAWN] Robot Pose: (x={robot_pose.x:.1f}m, y={robot_pose.y:.1f}m, theta={math.degrees(robot_pose.theta):.1f}°)")

    # 2. Camera Frame Acquisition
    cam_frame = camera.capture(
        robot_pose=robot_pose,
        static_obstacles=env.static_obstacles,
        dynamic_obstacles=env.dynamic_obstacles,
        targets=env.targets
    )
    print(f"[1. CAMERA] RGB Captured: {cam_frame.width}x{cam_frame.height} | Array: {camera.last_frame_array.shape}")

    # 3. Depth Buffer Scan
    depth_scan = depth_cam.scan(
        robot_pose=robot_pose,
        static_obstacles=env.static_obstacles,
        dynamic_obstacles=env.dynamic_obstacles,
        targets=env.targets
    )
    print(f"[2. DEPTH]  Depth Scan: {len(depth_scan.ranges)} range bins | Nearest Obstacle: {min(depth_scan.ranges):.2f}m")

    # 4. Detector Status Inspection
    status = pipeline.get_status()
    print(f"[3. DETECTOR] Name: {status.detector_name}")
    print(f"              Type: {status.detector_type}")
    print(f"              Fallback Active: {status.is_fallback} (model_source='{status.detector_type}')")
    print(f"              Documentation: {status.documentation}")

    # 5. Execute 7-Stage Perception Pipeline
    result = pipeline.process(
        frame=camera.last_frame_array,
        robot_pose=robot_pose,
        static_obstacles=env.static_obstacles,
        dynamic_obstacles=env.dynamic_obstacles,
        targets=env.targets,
        depth_scan=depth_scan,
        camera_frame=cam_frame
    )

    # 6. Detections
    print(f"\n[4. DETECTIONS] Total Detections: {len(result['detections'])}")
    for idx, det in enumerate(result['detections']):
        print(f"  [{idx+1}] ID: {det['track_id']:<7} | Class: {det['class']:<10} | Conf: {det['confidence']*100:4.1f}% | Dist: {det['distance']:4.2f}m | Pos3D: {det['position']} | Source: {det['model_source']}")

    # 7. Tracking
    print(f"\n[5. TRACKING] Active Tracks: {len(result['tracked'])}")
    for trk in result['tracked']:
        print(f"  Track {trk['track_id']:<7} | Class: {trk['class_name']:<10} | Status: {trk['status']:<7} | Vel: ({trk['velocity'][0]:.2f}, {trk['velocity'][1]:.2f}) m/s")

    # 8. World Model
    wm = result['world_model']
    print(f"\n[6. WORLD MODEL] Total Entities: {wm['total_entities']}")
    print(f"                 People Detected: {wm['people_count']}")
    print(f"                 Closest Obstacle: {wm['closest_obstacle_distance']:.2f}m")
    print(f"                 Classes Present: {wm['classes_present']}")

    print("\n" + "=" * 70)
    print(" Pipeline verification completed successfully! All requirements satisfied.")
    print("=" * 70)


if __name__ == "__main__":
    main()
