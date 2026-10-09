# VisionNav AI — Setup & Execution Guide

## Prerequisites

- **Python 3.10+** (Tested on Python 3.11)
- **Node.js 18+** and **npm**
- (Optional) **ROS 2 Humble / Iron / Jazzy** if running native ROS 2 nodes
- (Optional) **Docker & Docker Compose**

---

## 1. Quick Local Start (Recommended for Demo & Evaluation)

### Step 1: Set up Backend Virtual Environment
```bash
# From workspace root
python -m venv .venv

# On Windows PowerShell
.\.venv\Scripts\Activate.ps1
# On Linux / macOS
# source .venv/bin/activate

pip install -r backend/requirements.txt
```

### Step 2: Run Automated Pytest Test Suite
```bash
pytest tests -v
```

### Step 3: Launch Backend Simulation Engine
```bash
uvicorn backend.app.main:app --host 0.0.0.0 --port 8000
```
The FastAPI backend will start at `http://localhost:8000` and launch the 20 Hz background simulation pipeline.

### Step 4: Launch Frontend Command Center
In a new terminal window:
```bash
cd frontend
npm install
npm run dev
```
Open your browser at `http://localhost:5173`.

---

## 2. Docker Compose Launch
To launch both backend and frontend in isolated containers:
```bash
docker-compose up --build
```
- Dashboard: `http://localhost:5173`
- Backend API Docs: `http://localhost:8000/docs`

---

## 3. ROS 2 Workspace (Optional)
If running inside a native ROS 2 environment:
```bash
cd robotics/ros2_ws
colcon build --packages-select visionnav_robot
source install/setup.bash
ros2 launch visionnav_robot visionnav_simulation.launch.py
```
