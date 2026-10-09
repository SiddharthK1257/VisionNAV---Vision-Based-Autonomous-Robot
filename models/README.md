# VisionNav AI Perception & Detection Models

This directory documents the AI vision architectures integrated with the VisionNav autonomous mobile robot.

## Supported Model Architectures

1. **YOLO-Family Local Object Detectors (YOLOv8 / YOLOv11)**
   - Formats: ONNX, PyTorch (`.pt`), TensorRT engine (`.engine`)
   - Classes detected: `person`, `chair`, `table`, `box`, `bottle`, `laptop`, `backpack`, `door`, `wall`
   - Inference speed: 12-25 ms on NVIDIA CUDA / Jetson Orin; 45 ms on CPU

2. **Simulated High-Fidelity Perspective Projector**
   - The simulation runtime includes a 3D raycast perspective engine that calculates camera coordinate transformations, FOV culling (80° horizontal FOV), distance scaling, and bounding box occlusion.
   - Outputs normalized bounding boxes `(x, y, w, h)`, Euclidean distances in meters, tracking IDs (`P-01`, `B-01`), and detection confidence scores.

3. **Multi-Object Tracker (MOT)**
   - Centroid & motion-vector association with velocity estimation:
     $$\mathbf{v} = \frac{\Delta \mathbf{p}}{\Delta t}$$
   - Dynamic vs static obstacle classification.

4. **Vision-Language Model (VLM) Reasoning Adapter**
   - Structured JSON interface: `analyze_scene()`, `interpret_objective()`, `explain_navigation_decision()`
   - Offline spatial reasoning fallback with zero external API dependencies.
   - Optional cloud API plug-ins (Google Gemini 1.5/2.0 Flash, OpenAI GPT-4o-mini).
