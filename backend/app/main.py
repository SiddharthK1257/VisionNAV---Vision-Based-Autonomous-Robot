"""VisionNav AI - Main FastAPI Application and Simulation Loop."""
import asyncio
import logging
import sys
from contextlib import asynccontextmanager
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

from .core.config import settings
from .simulation.simulator import SimulationCoordinator
from .services.mission_manager import MissionManager
from .websocket.manager import ws_manager
from .api.routes import create_api_router
from .models.world import EnvironmentType

# Configure structured robotics logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    handlers=[logging.StreamHandler(sys.stdout)]
)
logger = logging.getLogger("visionnav")

# Initialize Master Simulator and Mission Manager
simulator = SimulationCoordinator(env_type=EnvironmentType.WAREHOUSE)
mission_manager = MissionManager(simulator)

# Background simulation worker task
simulation_task = None
is_running = True


async def simulation_loop():
    logger.info("Initializing VisionNav AI Simulation Pipeline at 20 Hz...")
    interval = 1.0 / settings.simulation_fps  # 50 ms

    last_logged_state = None
    last_logged_action = None

    while is_running:
        start_time = asyncio.get_event_loop().time()

        try:
            # Step simulation physics, perception, navigation, safety
            simulator.step()
            mission_manager.check_status()

            # Structured logging of notable state changes
            curr_state = simulator.navigator.status.state.value
            if curr_state != last_logged_state:
                logger.info(f"[NAVIGATION] State changed to: {curr_state}")
                last_logged_state = curr_state

            if simulator.decision_engine.history:
                latest_dec = simulator.decision_engine.history[0]
                if latest_dec.action.value != last_logged_action:
                    logger.info(f"[DECISION] Action: {latest_dec.action.value} | Reason: {latest_dec.reason} | Conf: {latest_dec.confidence}")
                    last_logged_action = latest_dec.action.value

            # Prepare telemetry packet for WebSocket clients
            robot_state = simulator.robot.state.model_dump()
            nav_status = simulator.navigator.status.model_dump()
            detections = [d.model_dump() for d in simulator.current_detections]
            tracked = [t.model_dump() for t in simulator.current_tracked]
            decisions = [d.model_dump() for d in simulator.decision_engine.get_history()[:15]]
            vlm = simulator.vlm_output.model_dump() if simulator.vlm_output else None

            # Get LiDAR hits for visualization
            lidar_hits, _ = simulator.lidar.scan(
                simulator.robot.state.pose,
                simulator.env_def.static_obstacles,
                simulator.env_def.dynamic_obstacles,
                simulator.env_def.targets
            )
            # Sample lidar hits for network efficiency (36 rays for telemetry stream)
            sampled_lidar = [h.model_dump() for h in lidar_hits[::2]]

            telemetry_packet = {
                "type": "telemetry",
                "timestamp": asyncio.get_event_loop().time(),
                "simulation_mode": True,
                "environment": simulator.env_type.value,
                "robot": robot_state,
                "navigation": nav_status,
                "detections": detections,
                "tracked": tracked,
                "decisions": decisions,
                "vlm_reasoning": vlm,
                "lidar_rays": sampled_lidar,
                "nearest_obstacle": round(simulator.nearest_obstacle_distance, 2),
                "active_target": simulator.navigator.status.goal_name,
                "metrics": simulator.navigator.status.metrics.model_dump(),
                "analytics": mission_manager.get_analytics().model_dump(),
                "pipeline_status": simulator.get_perception_status().model_dump(),
                "camera_frame": simulator.current_camera_frame.image_base64 if simulator.current_camera_frame else None,
                "depth_preview": simulator.current_depth_scan.depth_image_base64 if simulator.current_depth_scan else None,
                "imu": simulator.latest_imu.model_dump(),
                "odometry": simulator.robot.state.odometry.model_dump() if simulator.robot.state.odometry else None,
                "scene_understanding": simulator.scene_understanding.model_dump() if simulator.scene_understanding else None
            }

            await ws_manager.broadcast(telemetry_packet)

        except Exception as e:
            logger.error(f"Error in simulation loop: {e}", exc_info=True)

        elapsed = asyncio.get_event_loop().time() - start_time
        sleep_dur = max(0.001, interval - elapsed)
        await asyncio.sleep(sleep_dur)


@asynccontextmanager
async def lifespan(app: FastAPI):
    global simulation_task, is_running
    is_running = True
    simulation_task = asyncio.create_task(simulation_loop())
    logger.info("VisionNav AI Autonomous Pipeline successfully launched.")
    yield
    is_running = False
    if simulation_task:
        simulation_task.cancel()
        try:
            await simulation_task
        except asyncio.CancelledError:
            pass
    logger.info("VisionNav AI Pipeline terminated gracefully.")


app = FastAPI(
    title="VisionNav AI Robotics API",
    description="Professional Vision-Based Autonomous Mobile Robot Simulation & Navigation Stack",
    version="1.0.0",
    lifespan=lifespan
)

# Enable CORS for frontend dashboard
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include REST routes
api_router = create_api_router(simulator, mission_manager)
app.include_router(api_router)


@app.websocket("/ws/robot")
async def websocket_endpoint(websocket: WebSocket):
    await ws_manager.connect(websocket)
    try:
        while True:
            # Keep receiving any client messages/heartbeats
            data = await websocket.receive_text()
            if data == "ping":
                await websocket.send_text("pong")
    except WebSocketDisconnect:
        ws_manager.disconnect(websocket)
    except Exception as e:
        logger.warning(f"WebSocket connection error: {e}")
        ws_manager.disconnect(websocket)


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("backend.app.main:app", host=settings.host, port=settings.port, reload=False)
