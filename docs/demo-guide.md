# VisionNav AI — Judge Demo Guide

## One-Click Demonstration Walkthrough

VisionNav AI features a deterministic, competition-ready **Judge Demonstration Scenario** designed to evaluate all required challenge capabilities in real time without external API keys or cloud dependencies.

---

### Step 1: Launch Application
1. Start the backend:
   ```bash
   .\.venv\Scripts\python.exe -m uvicorn backend.app.main:app --host 0.0.0.0 --port 8000
   ```
2. Start the frontend:
   ```bash
   cd frontend
   npm run dev
   ```
3. Open `http://localhost:5173` in your browser.

---

### Step 2: Trigger Demo
1. In the top bar or sidebar, click **START DEMO** (or **JUDGE DEMO**).
2. The system executes the benchmark warehouse mission:
   *"Find the blue package and navigate to it safely."*

---

### Step 3: Observe the 7-Stage Pipeline
The visible stage indicator tracks the live state:
$$\text{PERCEIVE} \rightarrow \text{UNDERSTAND} \rightarrow \text{PLAN} \rightarrow \text{NAVIGATE} \rightarrow \text{AVOID} \rightarrow \text{REPLAN} \rightarrow \text{ARRIVE}$$

1. **PERCEIVE**:
   - Simulated 360° LiDAR raycaster (72 rays) and front RGB camera initialize.
   - Pinhole perspective projection renders the forward environment.
   - Object detector identifies the **Blue Shipping Package** with bounding box, class label, and confidence rating.
2. **UNDERSTAND**:
   - `SceneUnderstanding` module determines target distance, bearing, and free navigable space.
   - Clearly labels perception source: `[SIMULATED PERCEPTION]` (or `[LOCAL FALLBACK ENGINE]`).
3. **PLAN**:
   - Navigation goal generated with a safe 0.75m approach standoff.
   - Costmap inflated by 0.45m robot footprint buffer.
   - A* algorithm generates a collision-free global path through the warehouse aisle.
4. **NAVIGATE**:
   - Differential-drive robot accelerates smoothly along waypoints.
   - Pure pursuit velocity controller tracks the planned route while maintaining safety margins.
5. **AVOID**:
   - A simulated warehouse worker enters the path corridor.
   - Corridor collision detector flags an intersecting obstacle hazard.
   - Independent `SafetyController` triggers deceleration and brings robot to a controlled stop before the obstacle boundary.
6. **REPLAN**:
   - Dynamic obstacle footprint is registered into the local occupancy grid.
   - A* replanner computes an alternative detour route around the pedestrian.
   - Navigation safely resumes along the updated route.
7. **ARRIVE**:
   - Robot arrives at the blue package within goal tolerance (0.50m).
   - Speed gently ramps to zero.
   - Status transitions to `TARGET_REACHED` and displays **MISSION COMPLETED**.

---

### Step 4: Review Mission Results & Explainable Decision Log
- Navigate to **Decision Log** to inspect every timestamped event with trigger data, rationale, and chosen action.
- Navigate to **Mission Results** to review:
  - Total mission duration
  - Planned vs. traversed path length
  - Path efficiency metric ($\frac{\text{optimal distance}}{\text{actual traversed}} \times 100\%$)
  - Total obstacle encounters and replans
  - Collision count (0)
  - Final robot position $(x, y)$
