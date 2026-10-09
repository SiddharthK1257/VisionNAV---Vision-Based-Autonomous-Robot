import React, { useState } from 'react';
import {
  RobotState,
  NavigationStatus,
  StaticObstacle,
  DynamicObstacle,
  TargetLocation,
  LiDARHit,
  EnvironmentType,
  Detection,
  VLMStructuredOutput,
  SceneUnderstandingData,
} from '../types/robotics';
import { SimulationViewport2D } from '../components/SimulationViewport2D';
import { SimulationViewport3D } from '../components/SimulationViewport3D';
import {
  Sparkles,
  Play,
  Pause,
  RotateCcw,
  Send,
  Navigation,
  Compass,
  Gauge,
  Activity,
  Layers,
  Shield,
  Eye,
  Crosshair,
  Radio,
  Boxes,
  CheckCircle2,
  AlertTriangle,
  Zap,
} from 'lucide-react';

interface CommandCenterViewProps {
  robot: RobotState;
  navigation: NavigationStatus;
  staticObstacles: StaticObstacle[];
  dynamicObstacles: DynamicObstacle[];
  targets: TargetLocation[];
  activeTarget: string | null;
  lidarRays: LiDARHit[];
  environment: EnvironmentType;
  detections: Detection[];
  vlmReasoning: VLMStructuredOutput | null;
  sceneUnderstanding?: SceneUnderstandingData | null;
  cameraFrame?: string | null;
  depthPreview?: string | null;
  nearestObstacle: number;
  simSpeed: number;
  onSetSimSpeed: (speed: number) => void;
  onStartMission: (prompt: string) => void;
  onPauseMission: () => void;
  onResumeMission: () => void;
  onResetMission: () => void;
  onStartJudgeDemo: () => void;
  onNavigateToTab: (tab: any) => void;
}

export const CommandCenterView: React.FC<CommandCenterViewProps> = ({
  robot,
  navigation,
  staticObstacles,
  dynamicObstacles,
  targets,
  activeTarget,
  lidarRays,
  environment,
  detections,
  vlmReasoning,
  sceneUnderstanding,
  cameraFrame,
  depthPreview,
  nearestObstacle,
  simSpeed,
  onSetSimSpeed,
  onStartMission,
  onPauseMission,
  onResumeMission,
  onResetMission,
  onStartJudgeDemo,
  onNavigateToTab,
}) => {
  const [missionInput, setMissionInput] = useState<string>('Find the blue package and navigate to it safely.');
  const [viewMode, setViewMode] = useState<'2d' | '3d'>('2d');

  const suggestedMissions = [
    { label: 'Find the blue package', prompt: 'Find the blue package and navigate to it.' },
    { label: 'Go to charging station', prompt: 'Go to the charging station.' },
    { label: 'Navigate to inspection zone', prompt: 'Navigate to the inspection zone.' },
    { label: 'Reach the meeting area', prompt: 'Reach the meeting area.' },
    { label: 'Find nearest box', prompt: 'Find the nearest box.' },
  ];

  const handlePromptSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!missionInput.trim()) return;
    onStartMission(missionInput.trim());
  };

  // State formatting helpers
  const navState = navigation.state;
  const isNavigating = navState === 'NAVIGATING';
  const isReplanning = navState === 'REPLANNING' || navState === 'NEW_ROUTE_CALCULATED';
  const isObstacle = navState === 'OBSTACLE_DETECTED' || navState === 'ROBOT_STOPPING';
  const isTargetReached = navState === 'TARGET_REACHED';
  const isPaused = navState === 'PAUSED';

  // Metrics
  const targetDist = navigation.metrics.distance_remaining;
  const robotSpeed = Math.abs(robot.twist.linear);
  const replansCount = navigation.metrics.replans_count;
  const detectionsCount = detections.length;

  return (
    <div className="h-full flex flex-col gap-2.5 p-3.5 bg-[#060911] overflow-y-auto font-sans select-none">
      {/* 1. Live Status Cards Row */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5 font-mono">
        {/* Mission State */}
        <div className="p-2.5 rounded-lg bg-slate-950/80 border border-slate-800/80 space-y-1">
          <div className="flex items-center justify-between text-[10px] text-slate-500 uppercase tracking-wider">
            <span>Mission State</span>
            <Activity className="w-3.5 h-3.5 text-cyan-400" />
          </div>
          <div className="flex items-center gap-1.5 truncate">
            <span
              className={`w-2 h-2 rounded-full shrink-0 ${
                isTargetReached
                  ? 'bg-emerald-400'
                  : isObstacle
                  ? 'bg-amber-400 animate-pulse'
                  : isReplanning
                  ? 'bg-purple-400 animate-pulse'
                  : isNavigating
                  ? 'bg-cyan-400 status-active-pulse'
                  : 'bg-slate-600'
              }`}
            />
            <span
              className={`text-xs font-black truncate ${
                isTargetReached
                  ? 'text-emerald-400'
                  : isObstacle
                  ? 'text-amber-400'
                  : isReplanning
                  ? 'text-purple-400'
                  : isNavigating
                  ? 'text-cyan-300'
                  : 'text-slate-300'
              }`}
            >
              {navState.replace(/_/g, ' ')}
            </span>
          </div>
        </div>

        {/* Target Distance */}
        <div className="p-2.5 rounded-lg bg-slate-950/80 border border-slate-800/80 space-y-1">
          <div className="flex items-center justify-between text-[10px] text-slate-500 uppercase tracking-wider">
            <span>Target Distance</span>
            <Crosshair className="w-3.5 h-3.5 text-blue-400" />
          </div>
          <div className="text-base font-extrabold text-blue-300">
            {targetDist > 0 ? `${targetDist.toFixed(2)} m` : '--'}
          </div>
        </div>

        {/* Nearest Obstacle */}
        <div className="p-2.5 rounded-lg bg-slate-950/80 border border-slate-800/80 space-y-1">
          <div className="flex items-center justify-between text-[10px] text-slate-500 uppercase tracking-wider">
            <span>Nearest Obstacle</span>
            <Shield className="w-3.5 h-3.5 text-amber-400" />
          </div>
          <div
            className={`text-base font-extrabold ${
              nearestObstacle < 0.45
                ? 'text-red-400 animate-pulse'
                : nearestObstacle < 1.2
                ? 'text-amber-400'
                : 'text-emerald-400'
            }`}
          >
            {nearestObstacle < 50 ? `${nearestObstacle.toFixed(2)} m` : '> 8.0 m'}
          </div>
        </div>

        {/* Current Speed */}
        <div className="p-2.5 rounded-lg bg-slate-950/80 border border-slate-800/80 space-y-1">
          <div className="flex items-center justify-between text-[10px] text-slate-500 uppercase tracking-wider">
            <span>Current Speed</span>
            <Gauge className="w-3.5 h-3.5 text-cyan-400" />
          </div>
          <div className="text-base font-extrabold text-cyan-300">
            {robotSpeed.toFixed(2)} m/s
          </div>
        </div>

        {/* Replan Count */}
        <div className="p-2.5 rounded-lg bg-slate-950/80 border border-slate-800/80 space-y-1">
          <div className="flex items-center justify-between text-[10px] text-slate-500 uppercase tracking-wider">
            <span>Replan Count</span>
            <RotateCcw className="w-3.5 h-3.5 text-purple-400" />
          </div>
          <div className="text-base font-extrabold text-purple-300">
            {replansCount} {replansCount === 1 ? 'detour' : 'detours'}
          </div>
        </div>

        {/* Detection Count */}
        <div className="p-2.5 rounded-lg bg-slate-950/80 border border-slate-800/80 space-y-1">
          <div className="flex items-center justify-between text-[10px] text-slate-500 uppercase tracking-wider">
            <span>Detection Count</span>
            <Eye className="w-3.5 h-3.5 text-emerald-400" />
          </div>
          <div className="text-base font-extrabold text-emerald-300">
            {detectionsCount} {detectionsCount === 1 ? 'object' : 'objects'}
          </div>
        </div>
      </div>

      {/* 2. Main Simulation Viewport (Largest Element on Screen) */}
      <div className="flex-1 min-h-[440px] relative rounded-xl overflow-hidden border border-slate-800/90 shadow-2xl bg-black">
        {viewMode === '2d' ? (
          <SimulationViewport2D
            robot={robot}
            navigation={navigation}
            staticObstacles={staticObstacles}
            dynamicObstacles={dynamicObstacles}
            targets={targets}
            activeTarget={activeTarget}
            lidarRays={lidarRays}
            environment={environment}
            detections={detections}
            vlmReasoning={vlmReasoning}
            cameraFrame={cameraFrame}
            depthPreview={depthPreview}
            simSpeed={simSpeed}
            onSetSimSpeed={onSetSimSpeed}
            onToggle3DView={() => setViewMode('3d')}
          />
        ) : (
          <div className="relative w-full h-full">
            <SimulationViewport3D
              robot={robot}
              navigation={navigation}
              staticObstacles={staticObstacles}
              dynamicObstacles={dynamicObstacles}
              targets={targets}
              activeTarget={activeTarget}
              lidarRays={lidarRays}
              environment={environment}
              detections={detections}
              vlmReasoning={vlmReasoning}
              cameraFrame={cameraFrame}
              depthPreview={depthPreview}
              onNavigateToTab={onNavigateToTab}
            />
            {/* Quick button to toggle back to 2D */}
            <div className="absolute top-3 left-3 z-30 font-mono text-xs">
              <button
                onClick={() => setViewMode('2d')}
                className="px-2.5 py-1.5 rounded-md bg-cyan-950/90 border border-cyan-600 text-cyan-300 font-bold hover:bg-cyan-900 transition cursor-pointer flex items-center gap-1.5 shadow-xl backdrop-blur"
              >
                <Layers className="w-3.5 h-3.5 text-cyan-400" />
                <span>SWITCH TO 2D TACTICAL</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* 3. Mission Panel */}
      <div className="bg-slate-950/85 border border-slate-800/90 rounded-xl p-3.5 space-y-3 shadow-lg font-sans">
        {/* Top Header of Mission Panel */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800/80 pb-2.5">
          <div className="flex items-center gap-2 font-mono text-xs font-bold text-slate-200 uppercase tracking-wider">
            <Compass className="w-4 h-4 text-cyan-400" />
            <span>Autonomous Mission Dispatch Panel</span>
          </div>

          {/* Core Execution Action Buttons */}
          <div className="flex flex-wrap items-center gap-2 font-mono text-xs">
            <button
              onClick={onStartJudgeDemo}
              className="px-3.5 py-1.5 rounded bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-black tracking-wider transition cursor-pointer shadow-[0_0_15px_rgba(6,182,212,0.4)] flex items-center gap-1.5"
              title="Launches full judge demo scenario: Warehouse blue package with dynamic pedestrian detour"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>START DEMO</span>
            </button>

            {isNavigating ? (
              <button
                onClick={onPauseMission}
                className="px-3 py-1.5 rounded bg-amber-950/80 hover:bg-amber-900 text-amber-300 border border-amber-700/80 font-bold transition cursor-pointer flex items-center gap-1"
              >
                <Pause className="w-3.5 h-3.5" />
                <span>PAUSE</span>
              </button>
            ) : isPaused ? (
              <button
                onClick={onResumeMission}
                className="px-3 py-1.5 rounded bg-emerald-950/80 hover:bg-emerald-900 text-emerald-300 border border-emerald-700/80 font-bold transition cursor-pointer flex items-center gap-1"
              >
                <Play className="w-3.5 h-3.5" />
                <span>RESUME</span>
              </button>
            ) : null}

            <button
              onClick={onResetMission}
              className="px-3 py-1.5 rounded bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-700 font-bold transition cursor-pointer flex items-center gap-1"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>RESET</span>
            </button>
          </div>
        </div>

        {/* Natural Language Mission Input Form */}
        <form onSubmit={handlePromptSubmit} className="flex gap-2">
          <input
            type="text"
            value={missionInput}
            onChange={(e) => setMissionInput(e.target.value)}
            placeholder="Enter natural language robotics instruction..."
            className="flex-1 bg-slate-900/90 border border-slate-700/80 focus:border-cyan-500 rounded-lg px-3.5 py-2 text-xs font-mono text-slate-100 placeholder-slate-500 outline-none transition"
          />
          <button
            type="submit"
            className="px-4 py-2 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white font-mono text-xs font-bold transition cursor-pointer flex items-center gap-1.5 shadow"
          >
            <Send className="w-3.5 h-3.5" />
            <span>START MISSION</span>
          </button>
        </form>

        {/* Suggested Mission Quick Buttons */}
        <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
          <span className="text-[10px] font-mono text-slate-500 uppercase mr-1">Suggested:</span>
          {suggestedMissions.map((item, idx) => (
            <button
              key={idx}
              onClick={() => {
                setMissionInput(item.prompt);
                onStartMission(item.prompt);
              }}
              className="px-2.5 py-1 rounded bg-slate-900/90 hover:bg-slate-800 text-slate-300 hover:text-cyan-300 border border-slate-800 hover:border-cyan-800 text-[11px] font-mono transition cursor-pointer"
            >
              {item.label}
            </button>
          ))}
        </div>

        {/* Live Explainable Scene Understanding Explanation (Section 8) */}
        {sceneUnderstanding && (
          <div className="p-2.5 rounded-lg bg-slate-900/60 border border-slate-800 text-xs font-sans text-slate-300 flex items-start gap-2">
            <Zap className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
            <div className="space-y-0.5">
              <div className="text-[10px] font-mono text-cyan-400 font-bold uppercase tracking-wider">
                Real-Time Scene Understanding (Section 8)
              </div>
              <p className="text-slate-200 leading-relaxed font-sans text-xs">
                {sceneUnderstanding.concise_explanation}
              </p>
              {sceneUnderstanding.blocked_space && (
                <div className="text-[11px] text-amber-300 font-mono">
                  {sceneUnderstanding.blocked_space}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default CommandCenterView;
