# VisionNav AI — Judge Demo Scenario & Demonstration Guide

## Scenario: Industrial Warehouse Blue Package Retrieval

### Objective
> **Mission Prompt:** `"Find the blue package and navigate to it."`

The autonomous mobile robot starts near the warehouse entrance. A blue shipping package is positioned in the fulfillment zone across the facility. Along the central corridor, a warehouse technician (simulated humanoid Alex) patrols across the primary trajectory.

---

## Autonomous Execution Sequence

```mermaid
sequenceDiagram
    autonumber
    actor User as Judge / Operator
    participant UI as Command Center Dashboard
    participant API as FastAPI / WebSocket Engine
    participant VLM as Vision-Language Module
    participant NAV as A* Global Planner
    participant SENS as LiDAR & Camera Simulation
    participant SAFE as SafetyController
    participant BOT as Differential-Drive Robot

    User->>UI: Click [START DEMO]
    UI->>API: POST /api/demo/start
    API->>VLM: interpret_objective("Find the blue package...")
    VLM-->>API: Target: box (blue) at (16.5, 5.5)
    API->>NAV: Plan route from (2.0, 2.0) to (16.5, 5.5)
    NAV-->>API: Generated 14 waypoints, 18.2m path
    API->>BOT: Begin Pure Pursuit trajectory tracking
    Note over BOT,SENS: Robot accelerates along corridor

    Note over SENS: Technician Alex walks into path
    SENS->>API: Obstacle detected at 1.15m (Dynamic Humanoid)
    API->>SAFE: Evaluate command
    SAFE-->>BOT: SAFETY INTERVENTION: Slow velocity to safe passing speed
    API->>NAV: Trigger Dynamic Replan (REPLANNING)
    NAV-->>API: New collision-free detour around Storage Rack B
    API->>BOT: Resume navigation along new detour path

    Note over BOT: Robot approaches blue shipping package
    SENS->>API: Blue package distance: 0.42m
    API->>UI: State: TARGET_REACHED
    API->>UI: Decision: TARGET_REACHED (Confidence 99%)
    UI-->>User: Mission Success Banner & Analytics Breakdown
```

---

## Live Demonstration Verification Checklist

1. **Top Bar Status:**
   - Notice the prominent **"SIMULATION MODE"** badge.
   - Live **"20 Hz LIVE"** WebSocket connection status.
   - Emergency Stop button toggles immediate motor inhibition.

2. **Judge Demo Mode Pipeline Indicator:**
   - Shows progressive stages:
     `PERCEPTION` $\rightarrow$ `TARGET IDENTIFIED` $\rightarrow$ `PLANNING` $\rightarrow$ `NAVIGATING` $\rightarrow$ `OBSTACLE DETECTED` $\rightarrow$ `REPLANNING` $\rightarrow$ `TARGET REACHED`.

3. **3D Interactive Simulation Viewport:**
   - Left-click drag to rotate camera in 3D orbit around the facility.
   - Toggle to **"Top-Down 2D"** or **"Chase Cam"** mode.
   - Observe cyan LiDAR laser rays scanning the environment and dynamic red hit points.
   - Observe planned path ribbon update in real-time when the technician enters the route.

4. **Live Vision Feed:**
   - Switch to **"Live Vision"** tab to view the front camera perspective.
   - Notice YOLO-style bounding boxes with confidence %, distance, and tracking ID.
   - Notice the blue package tagged with the glowing **"TARGET"** badge.

5. **Decision Log Audit Trail:**
   - Chronological timestamps, actions (`REPLAN`, `SLOW_DOWN`, `FOLLOW_PATH`, `TARGET_REACHED`), and confidence ratings.
