# VisionNav AI — System Limitations & Future Work

## 1. Current Limitations

### 1.1 Simulated Environment vs Physical Hardware
- The prototype is designed as a browser-based 2D/3D robotics simulation to enable lightweight, portable, deterministic evaluation without requiring specialized GPU clusters or physical differential-drive robots.
- Physics calculations (friction, wheel slippage, dynamic inertia) use an idealized unicycle kinematics model with acceleration limits rather than a rigid-body physics engine like ODE/PhysX.

### 1.2 Perception Pipeline Modes
- **Simulated Perception Adapter / Local Fallback**: In standard demonstration mode, entity detections originate from a deterministic perspective camera projection and depth-buffer fusion engine. This engine computes accurate perspective bounding boxes and distances from simulation world coordinates and is clearly labeled as `SIMULATED PERCEPTION` / `LOCAL FALLBACK`.
- **Model-Based Detection**: An ONNX Runtime YOLOv8 integration (`models/yolov8n.onnx`) is supported when model weights are placed in the `models/` directory. When absent, the system gracefully falls back to the deterministic perception engine without fabricated AI outputs.
- **Webcam / Upload Mode**: The frontend provides an optional webcam/image frame upload interface that sends real JPEG frames to `/api/perception/detect_uploaded_frame`.

### 1.3 Vision-Language Reasoning
- High-level instructions are interpreted offline by a deterministic rule-based natural language parser (`TargetInterpreter`) that extracts structured intent (`target_type`, `target_class`, `target_attribute`, `location_name`).
- While a pluggable `VisionLanguageModel` adapter class is implemented for connecting multimodal cloud APIs (e.g., Gemini 1.5/GPT-4o), the offline fallback is deliberately used for default judging to ensure 100% reliability with zero internet connection or API keys.

---

## 2. Future Extensions & Physical Robot Roadmap

1. **ROS 2 & Nav2 Integration**:
   - The repository contains an initial ROS 2 Humble package skeleton (`robotics/ros2_ws/src/visionnav_robot`) with URDF chassis definition, `nav2_params.yaml`, and ROS 2 nodes for perception and motor control.
   - Future work includes full ROS 2 bridging via `rclpy` and micro-ROS on embedded microcontrollers.

2. **Hardware Deployment**:
   - Deploying to a physical TurtleBot4 or custom differential-drive mobile robot equipped with RPLiDAR A1/A2 and an Intel RealSense D435 depth camera.

3. **3D SLAM**:
   - Upgrading from 2D occupancy grid mapping to RTAB-Map or Cartographer 3D SLAM with point clouds.
