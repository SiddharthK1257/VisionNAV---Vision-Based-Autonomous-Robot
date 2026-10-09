import React, { useEffect, useState } from 'react';
import { TopBar } from './components/TopBar';
import { Sidebar } from './components/Sidebar';
import { RightPanel } from './components/RightPanel';
import { JudgeDemoBanner } from './components/JudgeDemoBanner';

import { CommandCenterView } from './pages/CommandCenterView';
import { LiveVisionView } from './pages/LiveVisionView';
import { NavigationMapView } from './pages/NavigationMapView';
import { DecisionLogView } from './pages/DecisionLogView';
import { MissionResultsView } from './pages/MissionResultsView';

// Optional diagnostic views
import { WorldModelView } from './pages/WorldModelView';
import { SensorsView } from './pages/SensorsView';
import { MissionControlView } from './pages/MissionControlView';
import { SettingsView } from './pages/SettingsView';

import { api, connectRobotWebSocket } from './services/api';
import {
  TelemetryPacket,
  WorldState,
  RobotState,
  NavigationStatus,
  EnvironmentType,
  PerceptionPipelineStatus,
  NavTab,
  SceneUnderstandingData,
} from './types/robotics';
import { AlertTriangle, Power, WifiOff, RefreshCw } from 'lucide-react';

export function App() {
  const [connected, setConnected] = useState<boolean>(false);
  const [currentTab, setCurrentTab] = useState<NavTab>('command_center');
  const [isDemoMode, setIsDemoMode] = useState<boolean>(false);
  const [simSpeed, setSimSpeed] = useState<number>(1.0);

  // Panel Collapsible States for Maximum Viewport Space
  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(false);
  const [rightPanelCollapsed, setRightPanelCollapsed] = useState<boolean>(false);

  // Baseline initial state
  const [worldState, setWorldState] = useState<WorldState | null>(null);
  const [environment, setEnvironment] = useState<EnvironmentType>('warehouse');

  const [robot, setRobot] = useState<RobotState>({
    pose: { x: 2.0, y: 2.0, theta: 0.0 },
    twist: { linear: 0.0, angular: 0.0 },
    target_twist: { linear: 0.0, angular: 0.0 },
    wheels: { left: 0.0, right: 0.0 },
    battery: { percentage: 98.5, voltage: 24.2, is_charging: false, discharge_rate: 0.02 },
    emergency_stop: false,
    status: 'IDLE',
    current_behavior: 'Awaiting Mission Command',
    odometry_distance: 0.0,
    sensor_health: 'OPTIMAL',
  });

  const [navigation, setNavigation] = useState<NavigationStatus>({
    state: 'IDLE',
    current_goal: null,
    goal_name: null,
    path: { waypoints: [], total_length: 0.0, generated_at: 0.0, is_valid: true },
    current_waypoint_index: 0,
    metrics: {
      path_length: 0.0,
      distance_remaining: 0.0,
      replans_count: 0,
      average_speed: 0.0,
      navigation_time: 0.0,
      obstacle_encounters: 0,
      eta_seconds: 0.0,
      path_efficiency: 1.0,
    },
  });

  const [detections, setDetections] = useState<TelemetryPacket['detections']>([]);
  const [tracked, setTracked] = useState<TelemetryPacket['tracked']>([]);
  const [decisions, setDecisions] = useState<TelemetryPacket['decisions']>([]);
  const [vlmReasoning, setVlmReasoning] = useState<TelemetryPacket['vlm_reasoning']>(null);
  const [sceneUnderstanding, setSceneUnderstanding] = useState<SceneUnderstandingData | null>(null);
  const [lidarRays, setLidarRays] = useState<TelemetryPacket['lidar_rays']>([]);
  const [nearestObstacle, setNearestObstacle] = useState<number>(999.0);
  const [activeTarget, setActiveTarget] = useState<string | null>(null);
  const [pipelineStatus, setPipelineStatus] = useState<PerceptionPipelineStatus | null>(null);
  const [cameraFrame, setCameraFrame] = useState<string | null>(null);
  const [depthPreview, setDepthPreview] = useState<string | null>(null);

  // Fetch initial world state on mount and connect WebSocket
  useEffect(() => {
    api
      .getWorld()
      .then((w) => {
        setWorldState(w);
        setEnvironment(w.environment_type);
        setRobot(w.robot);
        setNavigation(w.navigation);
      })
      .catch(() => {
        // Backend starting up
      });

    api.getPerceptionStatus().then(setPipelineStatus).catch(() => {});
    api.getSimSpeed().then((res) => {
      if (res && res.speed_multiplier) setSimSpeed(res.speed_multiplier);
    }).catch(() => {});

    const cleanup = connectRobotWebSocket(
      (packet: TelemetryPacket) => {
        setConnected(true);
        setRobot(packet.robot);
        setNavigation(packet.navigation);
        setDetections(packet.detections);
        setTracked(packet.tracked);
        setDecisions(packet.decisions);
        setVlmReasoning(packet.vlm_reasoning);
        setLidarRays(packet.lidar_rays);
        setNearestObstacle(packet.nearest_obstacle);
        setActiveTarget(packet.active_target);
        if (packet.environment) setEnvironment(packet.environment);
        if (packet.pipeline_status) setPipelineStatus(packet.pipeline_status);
        if (packet.camera_frame) setCameraFrame(packet.camera_frame);
        if (packet.depth_preview) setDepthPreview(packet.depth_preview);
        if (packet.scene_understanding) setSceneUnderstanding(packet.scene_understanding);
      },
      (isConn) => {
        setConnected(isConn);
      }
    );

    return cleanup;
  }, []);

  // Handlers for Mission and Robot Control
  const handleStartMission = async (prompt: string) => {
    try {
      await api.startMission(prompt);
      const w = await api.getWorld();
      setWorldState(w);
    } catch (e) {
      console.error(e);
    }
  };

  const handlePauseMission = async () => {
    await api.pauseMission();
  };

  const handleResumeMission = async () => {
    await api.resumeMission();
  };

  const handleResetMission = async () => {
    await api.resetMission();
    setIsDemoMode(false);
    const w = await api.getWorld();
    setWorldState(w);
  };

  const handleEmergencyStop = async (enable: boolean) => {
    await api.emergencyStop(enable);
    setRobot((prev) => ({ ...prev, emergency_stop: enable }));
  };

  const handleStartJudgeDemo = async () => {
    setIsDemoMode(true);
    await api.startJudgeDemo();
    const w = await api.getWorld();
    setWorldState(w);
    setEnvironment('warehouse');
  };

  const handleSwitchEnvironment = async (env: EnvironmentType) => {
    await api.switchEnvironment(env);
    setEnvironment(env);
    const w = await api.getWorld();
    setWorldState(w);
  };

  const handleSetSimSpeed = async (speed: number) => {
    setSimSpeed(speed);
    try {
      await api.setSimSpeed(speed);
    } catch (e) {
      console.error('Failed to set speed:', e);
    }
  };

  return (
    <div className="flex flex-col h-screen w-screen bg-[#060911] text-slate-100 overflow-hidden font-sans select-none">
      {/* 1. Top Operations Bar with 5-Element Status System */}
      <TopBar
        connected={connected}
        robot={robot}
        navigation={navigation}
        environment={environment}
        onEmergencyStop={handleEmergencyStop}
        onStartDemo={handleStartJudgeDemo}
        onSwitchEnvironment={handleSwitchEnvironment}
        pipelineStatus={pipelineStatus}
      />

      {/* 2. Global E-Stop Lock Alert Banner */}
      {robot.emergency_stop && (
        <div className="bg-red-600 text-white font-mono text-xs font-bold px-4 py-2 flex items-center justify-between shadow-2xl z-50 animate-pulse">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 fill-current text-white" />
            <span>EMERGENCY STOP LOCK ENGAGED — MOTOR ACTUATORS ARRESTED (SAFETY INTERVENTION)</span>
          </div>
          <button
            onClick={() => handleEmergencyStop(false)}
            className="px-3 py-1 rounded bg-white text-red-600 hover:bg-slate-100 font-black tracking-wider transition cursor-pointer shadow"
          >
            DISENGAGE E-STOP
          </button>
        </div>
      )}

      {/* 3. Global Telemetry Loss Warning */}
      {!connected && (
        <div className="bg-amber-950/90 border-b border-amber-700/80 text-amber-200 font-mono text-xs px-4 py-1.5 flex items-center justify-between z-30 shadow-md">
          <div className="flex items-center gap-2">
            <WifiOff className="w-4 h-4 text-amber-400 status-active-pulse" />
            <span>TELEMETRY LINK LOST // RECONNECTING TO SIMULATION CORE (20 Hz)...</span>
          </div>
          <span className="text-[10px] text-amber-300 opacity-80">ATTEMPTING WEBSOCKET HANDSHAKE</span>
        </div>
      )}

      {/* 4. Judge Demo Progress Banner (PERCEIVE → UNDERSTAND → PLAN → NAVIGATE → AVOID → REPLAN → ARRIVE) */}
      <JudgeDemoBanner
        active={isDemoMode}
        navState={navigation.state}
        onDismiss={() => setIsDemoMode(false)}
      />

      {/* 5. Main Ground Station Workspace */}
      <div className="flex flex-1 overflow-hidden relative">
        {/* Left Navigation Rail (Only 5 Primary Sections: Section 15) */}
        <Sidebar
          currentTab={currentTab}
          onSelectTab={setCurrentTab}
          onStartDemo={handleStartJudgeDemo}
          collapsed={sidebarCollapsed}
          onToggleCollapse={() => setSidebarCollapsed(!sidebarCollapsed)}
        />

        {/* Central Viewport / Mission Engineering Consoles */}
        <main className="flex-1 h-full overflow-hidden bg-[#060911] relative">
          {(currentTab === 'command_center' || currentTab === 'overview') && (
            <CommandCenterView
              robot={robot}
              navigation={navigation}
              staticObstacles={worldState?.static_obstacles || []}
              dynamicObstacles={worldState?.dynamic_obstacles || []}
              targets={worldState?.targets || []}
              activeTarget={activeTarget}
              lidarRays={lidarRays}
              environment={environment}
              detections={detections}
              vlmReasoning={vlmReasoning}
              sceneUnderstanding={sceneUnderstanding}
              cameraFrame={cameraFrame}
              depthPreview={depthPreview}
              nearestObstacle={nearestObstacle}
              simSpeed={simSpeed}
              onSetSimSpeed={handleSetSimSpeed}
              onStartMission={handleStartMission}
              onPauseMission={handlePauseMission}
              onResumeMission={handleResumeMission}
              onResetMission={handleResetMission}
              onStartJudgeDemo={handleStartJudgeDemo}
              onNavigateToTab={(tab) => setCurrentTab(tab as NavTab)}
            />
          )}

          {currentTab === 'live_vision' && (
            <LiveVisionView
              detections={detections}
              vlmReasoning={vlmReasoning}
              robot={robot}
              pipelineStatus={pipelineStatus}
              cameraFrame={cameraFrame}
              depthPreview={depthPreview}
            />
          )}

          {(currentTab === 'navigation_map' || currentTab === 'navigation') && (
            <NavigationMapView
              robot={robot}
              navigation={navigation}
              staticObstacles={worldState?.static_obstacles || []}
              dynamicObstacles={worldState?.dynamic_obstacles || []}
              targets={worldState?.targets || []}
              activeTarget={activeTarget}
              lidarRays={lidarRays}
            />
          )}

          {currentTab === 'decision_log' && <DecisionLogView decisions={decisions} />}

          {(currentTab === 'mission_results' || currentTab === 'analytics') && (
            <MissionResultsView
              robot={robot}
              navigation={navigation}
              onStartJudgeDemo={handleStartJudgeDemo}
              onStartMission={handleStartMission}
              onResetMission={handleResetMission}
            />
          )}

          {/* Secondary Diagnostic Routes */}
          {currentTab === 'world_model' && (
            <WorldModelView worldState={worldState} trackedObjects={tracked} />
          )}

          {currentTab === 'sensors' && (
            <SensorsView
              robot={robot}
              lidarRays={lidarRays}
              nearestObstacle={nearestObstacle}
            />
          )}

          {currentTab === 'mission_control' && (
            <MissionControlView
              environment={environment}
              navigation={navigation}
              targets={worldState?.targets || []}
              onStartMission={handleStartMission}
              onPauseMission={handlePauseMission}
              onResumeMission={handleResumeMission}
              onResetMission={handleResetMission}
              onSwitchEnvironment={handleSwitchEnvironment}
              onStartJudgeDemo={handleStartJudgeDemo}
            />
          )}

          {currentTab === 'settings' && <SettingsView />}
        </main>

        {/* Right Telemetry & Perception HUD Panel */}
        <RightPanel
          robot={robot}
          navigation={navigation}
          detections={detections}
          vlmReasoning={vlmReasoning}
          activeTarget={activeTarget}
          collapsed={rightPanelCollapsed}
          onToggleCollapse={() => setRightPanelCollapsed(!rightPanelCollapsed)}
        />
      </div>
    </div>
  );
}

export default App;
