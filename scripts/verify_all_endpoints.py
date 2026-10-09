"""Complete Start-to-Finish Endpoints Verification Script for VisionNav AI."""
import sys
import os
import time

sys.path.insert(0, os.path.abspath("."))
from fastapi.testclient import TestClient
from backend.app.main import app

def run_verification():
    client = TestClient(app)
    results = []
    
    print("=" * 80)
    print(" VISIONNAV AI — START-TO-FINISH ENDPOINTS VERIFICATION MATRIX")
    print("=" * 80)

    endpoints = [
        # (Method, Path, Body, Expected Status, Description)
        ("GET", "/api/health", None, 200, "System Health Check & Mode Verification"),
        ("GET", "/api/robot/state", None, 200, "Full Robot Kinematics & Battery State"),
        ("POST", "/api/robot/cmd_vel", {"linear": 0.2, "angular": 0.1, "duration": 1.0}, 200, "Programmatic Velocity Command (cmd_vel)"),
        ("POST", "/api/robot/move", {"direction": "forward", "speed": 0.3, "duration": 0.5}, 200, "Directional Movement (move)"),
        ("POST", "/api/robot/stop", None, 200, "Instant Motor Brake / Halt (stop)"),
        ("GET", "/api/sensors", None, 200, "Aggregated Sensor Telemetry Array"),
        ("GET", "/api/sensors/imu", None, 200, "6-DOF IMU Attitude & Accelerometer"),
        ("GET", "/api/sensors/odometry", None, 200, "Wheel Encoders & Cumulative Odometry"),
        ("GET", "/api/sensors/lidar", None, 200, "360° LiDAR 72-Ray Laser Hit Stream"),
        ("GET", "/api/camera/rgb", None, 200, "Camera Forward RGB Base64 Frame"),
        ("GET", "/api/camera/frame", None, 200, "Camera Forward Frame Alias"),
        ("GET", "/api/camera/depth", None, 200, "Camera Depth Buffer Colormap Scan"),
        ("GET", "/api/detections", None, 200, "AI Object Detections & Tracking"),
        ("GET", "/api/perception/status", None, 200, "Active Neural/Fallback Detector Status"),
        ("POST", "/api/perception/pipeline/run", None, 200, "Step-by-Step Perception Pipeline Trace"),
        ("GET", "/api/world", None, 200, "Global 3D World State & Entities"),
        ("GET", "/api/navigation", None, 200, "Navigation Status, Costmap & Path Plan"),
        ("GET", "/api/decisions", None, 200, "Autonomous Tactical Decision Stream"),
        ("GET", "/api/analytics", None, 200, "Autonomy Efficiency & Stability KPIs"),
        ("GET", "/api/navigation/transitions", None, 200, "State Machine Transition History"),
        ("POST", "/api/navigation/scenario/obstacle_on_route", None, 200, "Benchmark Detour Test Scenario (A -> B)"),
        ("POST", "/api/navigation/place_obstacle", {"x": 5.5, "y": 3.0, "width": 1.0, "height": 1.0, "name": "Placed Crate"}, 200, "Dynamic Obstacle Injection on Costmap"),
        ("POST", "/api/navigation/clear_obstacles", None, 200, "Clear Injected Obstacles & Reset Costmap"),
        ("POST", "/api/mission/reset", None, 200, "Reset Mission and Robot Pose"),
        ("POST", "/api/mission", {"prompt": "Find the blue package and navigate to it."}, 200, "Dispatch Mission via NLP Prompt (alias)"),
        ("POST", "/api/mission/start", {"prompt": "Navigate to the charging station."}, 200, "Dispatch Mission via NLP Prompt (start)"),
        ("POST", "/api/mission/pause", None, 200, "Pause Autonomous Navigation"),
        ("POST", "/api/mission/resume", None, 200, "Resume Autonomous Navigation"),
        ("POST", "/api/emergency-stop", {"enable": True}, 200, "Engage Emergency Stop Lockout"),
        ("POST", "/api/emergency-stop", {"enable": False}, 200, "Disengage Emergency Stop Lockout"),
        ("POST", "/api/demo/start", None, 200, "Trigger Judge Demo Scenario Sequence"),
        ("POST", "/api/environment/switch", {"environment": "office"}, 200, "Switch Facility Environment (Office)"),
        ("POST", "/api/environment/switch", {"environment": "warehouse"}, 200, "Switch Facility Environment (Warehouse)"),
        ("GET", "/api/simulation/speed", None, 200, "Get Simulation Speed Multiplier"),
        ("POST", "/api/simulation/speed", {"multiplier": 2.0}, 200, "Set Simulation Speed Multiplier"),
        ("POST", "/api/simulation/speed", {"multiplier": 1.0}, 200, "Reset Simulation Speed Multiplier"),
        ("POST", "/api/perception/detect_uploaded_frame", {
            "image_base64": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
            "source": "webcam"
        }, 200, "Perception Real-time Frame Analysis (Webcam/Upload)"),
    ]

    all_passed = True

    for method, path, body, expected_status, desc in endpoints:
        start_t = time.perf_counter()
        if method == "GET":
            resp = client.get(path)
        else:
            resp = client.post(path, json=body) if body else client.post(path)
        dur_ms = (time.perf_counter() - start_t) * 1000

        status_ok = resp.status_code == expected_status
        if not status_ok:
            all_passed = False

        status_str = f"PASS [{resp.status_code}]" if status_ok else f"FAIL [{resp.status_code}]"
        print(f"[{status_str:^10}] {method:4} {path:40} ({dur_ms:6.2f}ms) - {desc}")

    # WebSocket Verification
    print("-" * 80)
    print("Testing WebSocket Connection [/ws/robot]...")
    ws_passed = False
    try:
        with client.websocket_connect("/ws/robot") as ws:
            ws.send_text("ping")
            pong = ws.receive_text()
            if pong == "pong":
                ws_passed = True
                print(f"[  PASS   ] WS   /ws/robot (Heartbeat 'ping' -> 'pong' verified successfully)")
    except Exception as e:
        print(f"[  FAIL   ] WS   /ws/robot: {e}")

    print("=" * 80)
    if all_passed and ws_passed:
        print(">>> ALL ENDPOINTS & WEBSOCKET VERIFIED SUCCESSFULLY (100% OPERATIONAL) <<<")
    else:
        print(">>> SOME ENDPOINT CHECKS FAILED <<<")
        sys.exit(1)
    print("=" * 80)

if __name__ == "__main__":
    run_verification()
