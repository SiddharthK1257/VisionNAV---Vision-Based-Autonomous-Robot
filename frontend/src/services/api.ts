import { TelemetryPacket, WorldState, EnvironmentType } from '../types/robotics';

const API_BASE = '/api';

export const api = {
  async getHealth() {
    const res = await fetch(`${API_BASE}/health`);
    return res.json();
  },

  async getWorld(): Promise<WorldState> {
    const res = await fetch(`${API_BASE}/world`);
    return res.json();
  },

  async startMission(prompt: string) {
    const res = await fetch(`${API_BASE}/mission/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt }),
    });
    return res.json();
  },

  async pauseMission() {
    const res = await fetch(`${API_BASE}/mission/pause`, { method: 'POST' });
    return res.json();
  },

  async resumeMission() {
    const res = await fetch(`${API_BASE}/mission/resume`, { method: 'POST' });
    return res.json();
  },

  async resetMission() {
    const res = await fetch(`${API_BASE}/mission/reset`, { method: 'POST' });
    return res.json();
  },

  async emergencyStop(enable: boolean) {
    const res = await fetch(`${API_BASE}/emergency-stop`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enable }),
    });
    return res.json();
  },

  async startJudgeDemo() {
    const res = await fetch(`${API_BASE}/demo/start`, { method: 'POST' });
    return res.json();
  },

  async getMission() {
    const res = await fetch(`${API_BASE}/mission`);
    return res.json();
  },

  async getSimSpeed() {
    const res = await fetch(`${API_BASE}/simulation/speed`);
    return res.json();
  },

  async setSimSpeed(multiplier: number) {
    const res = await fetch(`${API_BASE}/simulation/speed`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ multiplier }),
    });
    return res.json();
  },

  async detectUploadedFrame(imageBase64: string, source = 'webcam') {
    const res = await fetch(`${API_BASE}/perception/detect_uploaded_frame`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image_base64: imageBase64, source }),
    });
    return res.json();
  },

  async switchEnvironment(environment: EnvironmentType) {
    const res = await fetch(`${API_BASE}/environment/switch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ environment }),
    });
    return res.json();
  },

  async getPerceptionStatus() {
    const res = await fetch(`${API_BASE}/perception/status`);
    return res.json();
  },

  async runPerceptionPipeline() {
    const res = await fetch(`${API_BASE}/perception/pipeline/run`, { method: 'POST' });
    return res.json();
  },

  async runObstacleScenario() {
    const res = await fetch(`${API_BASE}/navigation/scenario/obstacle_on_route`, { method: 'POST' });
    return res.json();
  },

  async getTransitions() {
    const res = await fetch(`${API_BASE}/navigation/transitions`);
    return res.json();
  },

  async placeObstacle(options?: {
    x?: number;
    y?: number;
    distance_ahead?: number;
    width?: number;
    height?: number;
    name?: string;
  }) {
    const res = await fetch(`${API_BASE}/navigation/place_obstacle`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(options || {}),
    });
    return res.json();
  },

  async clearObstacles() {
    const res = await fetch(`${API_BASE}/navigation/clear_obstacles`, { method: 'POST' });
    return res.json();
  },

  async moveRobot(direction: string, speed = 0.4, duration = 1.0) {
    const res = await fetch(`${API_BASE}/robot/move`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ direction, speed, duration }),
    });
    return res.json();
  },

  async setCmdVel(linear: number, angular: number, duration = 1.0) {
    const res = await fetch(`${API_BASE}/robot/cmd_vel`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ linear, angular, duration }),
    });
    return res.json();
  },

  async stopRobot() {
    const res = await fetch(`${API_BASE}/robot/stop`, { method: 'POST' });
    return res.json();
  },

  async getSensors() {
    const res = await fetch(`${API_BASE}/sensors`);
    return res.json();
  },

  async getIMU() {
    const res = await fetch(`${API_BASE}/sensors/imu`);
    return res.json();
  },

  async getOdometry() {
    const res = await fetch(`${API_BASE}/sensors/odometry`);
    return res.json();
  },

  async getLidar() {
    const res = await fetch(`${API_BASE}/sensors/lidar`);
    return res.json();
  },

  async getCameraRgb() {
    const res = await fetch(`${API_BASE}/camera/rgb`);
    return res.json();
  },

  async getCameraDepth() {
    const res = await fetch(`${API_BASE}/camera/depth`);
    return res.json();
  },

  async getDetections() {
    const res = await fetch(`${API_BASE}/detections`);
    return res.json();
  },

  async getNavigation() {
    const res = await fetch(`${API_BASE}/navigation`);
    return res.json();
  },

  async getDecisions() {
    const res = await fetch(`${API_BASE}/decisions`);
    return res.json();
  },

  async getAnalytics() {
    const res = await fetch(`${API_BASE}/analytics`);
    return res.json();
  },
};

export function connectRobotWebSocket(
  onTelemetry: (data: TelemetryPacket) => void,
  onStatusChange?: (connected: boolean) => void
): () => void {
  let ws: WebSocket | null = null;
  let isClosed = false;
  let reconnectTimer: any = null;

  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const host = window.location.host;
  const wsUrl = `${protocol}//${host}/ws/robot`;

  function connect() {
    if (isClosed) return;

    try {
      ws = new WebSocket(wsUrl);

      ws.onopen = () => {
        if (onStatusChange) onStatusChange(true);
      };

      ws.onmessage = (event) => {
        try {
          const packet: TelemetryPacket = JSON.parse(event.data);
          onTelemetry(packet);
        } catch (e) {
          // ignore parsing error
        }
      };

      ws.onclose = () => {
        if (onStatusChange) onStatusChange(false);
        if (!isClosed) {
          reconnectTimer = setTimeout(connect, 1500);
        }
      };

      ws.onerror = () => {
        if (onStatusChange) onStatusChange(false);
      };
    } catch (err) {
      if (!isClosed) {
        reconnectTimer = setTimeout(connect, 2000);
      }
    }
  }

  connect();

  return () => {
    isClosed = true;
    if (reconnectTimer) clearTimeout(reconnectTimer);
    if (ws) ws.close();
  };
}
