# VisionNav AI — API & WebSocket Reference

## Base URLs
- REST API: `http://localhost:8000/api`
- WebSocket: `ws://localhost:8000/ws/robot`

---

## REST Endpoints

### 1. System Health
`GET /api/health`
```json
{
  "status": "healthy",
  "system": "VisionNav AI",
  "simulation_mode": true,
  "version": "1.0.0"
}
```

### 2. Robot State & Kinematics
`GET /api/robot/state`
```json
{
  "pose": { "x": 2.0, "y": 2.0, "theta": 0.0 },
  "twist": { "linear": 0.45, "angular": 0.0 },
  "target_twist": { "linear": 0.45, "angular": 0.0 },
  "wheels": { "left": 0.45, "right": 0.45 },
  "battery": { "percentage": 98.4, "voltage": 24.2, "is_charging": false, "discharge_rate": 0.02 },
  "emergency_stop": false,
  "status": "NAVIGATING",
  "current_behavior": "Navigating to Blue Shipping Package",
  "odometry_distance": 4.12,
  "sensor_health": "OPTIMAL"
}
```

### 3. Sensor Diagnostics & Raw Feeds
- `GET /api/sensors`: Returns aggregated camera FPS, LiDAR point count, closest obstacle distance, IMU, and odometry.
- `GET /api/sensors/imu`: High-resolution 6-DOF inertial measurement data (linear accelerations, angular rates, orientation yaw).
- `GET /api/sensors/odometry`: Wheel encoder counts, calculated linear and angular velocities, distance traveled.
- `GET /api/sensors/lidar`: 360° planar laser range finder point clouds and nearest hit distance.
- `GET /api/camera/rgb` (or `/api/camera/frame`): Front pinhole camera frame (base64 image, resolution 320x240, 80° FOV).
- `GET /api/camera/depth`: Forward depth scan range buffer (80 bins) and base64 depth visualization map.

### 4. Perception & Detections
- `GET /api/detections`: Returns active camera bounding box detections, tracked multi-object registry, and VLM structured reasoning.
- `GET /api/perception/status`: Returns detector engine metadata (`detector_name`, `detector_type`, `is_fallback`, `supported_classes`, `documentation`).
- `POST /api/perception/pipeline/run`: Manually steps the entire 7-stage AI perception pipeline and returns an annotated execution trace.

### 5. Robot Programmatic Control
- `POST /api/robot/cmd_vel`: Direct differential drive velocity commands `{"linear": 0.4, "angular": -0.2, "duration": 2.0}`.
- `POST /api/robot/move`: Directional macro movements `{"direction": "forward" | "backward" | "rotate_left" | "rotate_right" | "stop", "speed": 0.4, "duration": 1.0}`.
- `POST /api/robot/stop`: Halts robot motion and clears active navigation waypoints.

### 6. World Model
`GET /api/world`
- Returns full world definition, static obstacles, dynamic humanoids, target beacons, and current goal.

### 7. Navigation Status
`GET /api/navigation`
- Returns navigation state machine enum, waypoints list, distance remaining, ETA, and replans count.

### 8. Autonomous Decisions Log
`GET /api/decisions`
- Returns chronological history of autonomous decisions made by the `DecisionEngine`.

### 9. Mission Control Actions
- `POST /api/mission/start` with body `{"prompt": "Find the blue package..."}`
- `POST /api/mission/pause`
- `POST /api/mission/resume`
- `POST /api/mission/reset`
- `POST /api/emergency-stop` with body `{"enable": true}`
- `POST /api/demo/start`
- `POST /api/environment/switch` with body `{"environment": "warehouse" | "office" | "smart_laboratory"}`

---

## WebSocket Telemetry Stream (`/ws/robot`)

The backend broadcasts telemetry frames at **20 Hz** (every 50 ms):
```json
{
  "type": "telemetry",
  "timestamp": 1727961234.56,
  "simulation_mode": true,
  "environment": "warehouse",
  "robot": { ... },
  "navigation": { ... },
  "detections": [ ... ],
  "tracked": [ ... ],
  "decisions": [ ... ],
  "vlm_reasoning": { ... },
  "lidar_rays": [ ... ],
  "nearest_obstacle": 1.15,
  "active_target": "Blue Shipping Package",
  "metrics": { ... },
  "analytics": { ... }
}
```
Clients may send `"ping"` to receive `"pong"` for heartbeat monitoring.
