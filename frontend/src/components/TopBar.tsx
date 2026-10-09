import React, { useState } from 'react';
import {
  AlertTriangle,
  Power,
  Wifi,
  WifiOff,
  ShieldAlert,
  Cpu,
  Layers,
  Sparkles,
  ChevronDown,
  Building2,
  Activity,
  Eye,
  Compass,
  Radio,
} from 'lucide-react';
import {
  RobotState,
  NavigationStatus,
  EnvironmentType,
  PerceptionPipelineStatus,
} from '../types/robotics';

interface TopBarProps {
  connected: boolean;
  robot: RobotState;
  navigation: NavigationStatus;
  environment: EnvironmentType;
  onEmergencyStop: (enable: boolean) => void;
  onStartDemo: () => void;
  onSwitchEnvironment?: (env: EnvironmentType) => void;
  pipelineStatus?: PerceptionPipelineStatus | null;
}

export const TopBar: React.FC<TopBarProps> = ({
  connected,
  robot,
  navigation,
  environment,
  onEmergencyStop,
  onStartDemo,
  onSwitchEnvironment,
  pipelineStatus,
}) => {
  const isEstop = robot.emergency_stop;
  const [showEnvDropdown, setShowEnvDropdown] = useState(false);

  // Status system states
  const isNavigating = navigation.state === 'NAVIGATING';
  const isReplanning = navigation.state === 'REPLANNING' || navigation.state === 'NEW_ROUTE_CALCULATED';
  const isObstacle = navigation.state === 'OBSTACLE_DETECTED' || navigation.state === 'ROBOT_STOPPING';
  const isGoalReached = navigation.state === 'TARGET_REACHED';
  const isAutonomous = navigation.state !== 'IDLE' && !isEstop;

  const activeStage = navigation.pipeline_stage || (isNavigating ? 'Trajectory Tracking' : 'Idle Standby');

  return (
    <header className="h-14 bg-[#070a12]/95 border-b border-slate-800/80 backdrop-blur-md px-3.5 flex items-center justify-between select-none z-40 sticky top-0 font-sans">
      {/* 1. Left: Brand & Facility Selector */}
      <div className="flex items-center gap-3 shrink-0">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded bg-cyan-950/80 border border-cyan-500/60 flex flex-col items-center justify-center text-cyan-400 font-mono font-black text-xs shadow-[0_0_12px_rgba(6,182,212,0.35)] relative overflow-hidden">
            <span className="text-[11px] leading-none font-extrabold tracking-tighter">VN</span>
            <span className="text-[7px] text-cyan-300 font-normal leading-none">AMR</span>
            <div className="absolute top-0 right-0 w-1.5 h-1.5 bg-cyan-400 rounded-bl-sm" />
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <h1 className="text-xs font-black text-slate-100 tracking-wider font-mono">
                VISIONNAV<span className="text-cyan-400">.AI</span>
              </h1>
              <span className="px-1 py-0.2 rounded bg-slate-900 border border-slate-700/80 text-[9px] font-mono text-slate-400">
                GCS v1.0
              </span>
            </div>
            <p className="text-[9px] text-slate-400 font-mono tracking-widest uppercase">
              AUTONOMOUS OPERATIONS CONSOLE
            </p>
          </div>
        </div>

        {/* Facility Environment Switcher Pill */}
        <div className="relative hidden xl:block">
          <button
            onClick={() => setShowEnvDropdown(!showEnvDropdown)}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-slate-900/90 border border-slate-800 hover:border-slate-700 text-xs font-mono text-slate-300 transition cursor-pointer"
          >
            <Building2 className="w-3.5 h-3.5 text-cyan-400" />
            <span className="text-slate-500 text-[10px]">FACILITY:</span>
            <span className="font-semibold text-slate-200 capitalize">
              {environment.replace('_', ' ')}
            </span>
            <ChevronDown className="w-3 h-3 text-slate-500" />
          </button>

          {showEnvDropdown && onSwitchEnvironment && (
            <div className="absolute top-full mt-1.5 left-0 w-48 bg-slate-950 border border-slate-800 rounded-md shadow-2xl py-1 z-50 font-mono text-xs">
              {(['warehouse', 'office', 'smart_laboratory'] as EnvironmentType[]).map((env) => (
                <button
                  key={env}
                  onClick={() => {
                    onSwitchEnvironment(env);
                    setShowEnvDropdown(false);
                  }}
                  className={`w-full text-left px-3 py-1.5 hover:bg-slate-900 flex items-center justify-between capitalize ${
                    environment === env ? 'text-cyan-400 font-bold bg-cyan-950/30' : 'text-slate-300'
                  }`}
                >
                  <span>{env.replace('_', ' ')}</span>
                  {environment === env && <span className="w-1.5 h-1.5 rounded-full bg-cyan-400" />}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* 2. Center: Professional 5-Element Status System (Prominent & Technical) */}
      <div className="hidden lg:flex items-center gap-1.5 px-3 py-1 rounded-md bg-slate-950/80 border border-slate-800/80 shadow-inner">
        {/* ● SYSTEM ONLINE */}
        <div
          className={`flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-mono tracking-tight transition ${
            connected
              ? 'text-emerald-300 bg-emerald-950/30 border border-emerald-900/40'
              : 'text-red-400 bg-red-950/40 border border-red-900/60'
          }`}
          title={connected ? 'Simulation Core Online at 20 Hz' : 'Connection Lost'}
        >
          <span
            className={`w-2 h-2 rounded-full shrink-0 ${
              connected ? 'bg-emerald-400 status-active-pulse' : 'bg-red-500'
            }`}
          />
          <span className="font-bold">SYSTEM {connected ? 'ONLINE' : 'OFFLINE'}</span>
          <span className="text-[9px] opacity-60">20Hz</span>
        </div>

        <div className="w-px h-3.5 bg-slate-800" />

        {/* ● PERCEPTION ACTIVE */}
        <div
          className="flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-mono tracking-tight text-cyan-300 bg-cyan-950/30 border border-cyan-900/40"
          title={`Perception: ${pipelineStatus?.detector_name || 'YOLOv8 & Tracking'}`}
        >
          <span className="w-2 h-2 rounded-full bg-cyan-400 status-active-pulse shrink-0" />
          <span className="font-bold">PERCEPTION ACTIVE</span>
          <span className="text-[9px] opacity-60">
            {pipelineStatus?.is_fallback ? 'GEOM' : 'ONNX'}
          </span>
        </div>

        <div className="w-px h-3.5 bg-slate-800" />

        {/* ● NAVIGATION ACTIVE */}
        <div
          className={`flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-mono tracking-tight transition ${
            isNavigating
              ? 'text-cyan-300 bg-cyan-950/40 border border-cyan-700/50'
              : isObstacle
              ? 'text-amber-300 bg-amber-950/50 border border-amber-700/60'
              : isReplanning
              ? 'text-purple-300 bg-purple-950/40 border border-purple-700/50'
              : isGoalReached
              ? 'text-emerald-300 bg-emerald-950/40 border border-emerald-700/50'
              : 'text-slate-400 bg-slate-900/60 border border-slate-800'
          }`}
          title={`Navigation State: ${navigation.state} | ${activeStage}`}
        >
          <span
            className={`w-2 h-2 rounded-full shrink-0 ${
              isNavigating
                ? 'bg-cyan-400 status-active-pulse'
                : isObstacle
                ? 'bg-amber-400 status-active-pulse'
                : isReplanning
                ? 'bg-purple-400 status-active-pulse'
                : isGoalReached
                ? 'bg-emerald-400'
                : 'bg-slate-600'
            }`}
          />
          <span className="font-bold">
            {isObstacle
              ? 'NAV OBSTACLE'
              : isReplanning
              ? 'NAV REPLANNING'
              : isNavigating
              ? 'NAVIGATION ACTIVE'
              : isGoalReached
              ? 'TARGET REACHED'
              : 'NAVIGATION STANDBY'}
          </span>
        </div>

        <div className="w-px h-3.5 bg-slate-800" />

        {/* ● AUTONOMOUS MODE */}
        <div
          className={`flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-mono tracking-tight ${
            isAutonomous
              ? 'text-purple-300 bg-purple-950/30 border border-purple-900/50'
              : 'text-slate-400 bg-slate-900/60 border border-slate-800'
          }`}
          title="Autonomy Level 4: Full Mission & Obstacle Detour Planning"
        >
          <span
            className={`w-2 h-2 rounded-full shrink-0 ${
              isAutonomous ? 'bg-purple-400 status-active-pulse' : 'bg-slate-600'
            }`}
          />
          <span className="font-bold">
            {isAutonomous ? 'AUTONOMOUS MODE' : 'STANDBY MODE'}
          </span>
          <span className="text-[9px] opacity-60">L4</span>
        </div>

        <div className="w-px h-3.5 bg-slate-800" />

        {/* ● SIMULATION MODE */}
        <div
          className="flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-mono tracking-tight text-amber-300 bg-amber-950/30 border border-amber-900/50"
          title="Deterministic 20 Hz Physical Simulation Environment"
        >
          <span className="w-2 h-2 rounded-full bg-amber-400 status-active-pulse shrink-0" />
          <span className="font-bold">SIMULATION MODE</span>
        </div>
      </div>

      {/* 3. Right: Judge Demo & Emergency Stop & Connection State */}
      <div className="flex items-center gap-2.5 shrink-0">
        {/* Judge Demo Quick Action */}
        <button
          onClick={onStartDemo}
          className="px-3 py-1.5 rounded bg-cyan-500 hover:bg-cyan-400 text-slate-950 text-xs font-mono font-black tracking-wider transition cursor-pointer shadow-[0_0_15px_rgba(6,182,212,0.35)] flex items-center gap-1.5"
          title="Launches autonomous warehouse retrieval with dynamic obstacle detour"
        >
          <Sparkles className="w-3.5 h-3.5" />
          <span>JUDGE DEMO</span>
        </button>

        {/* Emergency Stop Latching Action Button */}
        <button
          onClick={() => onEmergencyStop(!isEstop)}
          className={`px-3.5 py-1.5 rounded font-mono font-bold text-xs flex items-center gap-2 border transition cursor-pointer ${
            isEstop
              ? 'bg-red-600 text-white border-red-300 shadow-[0_0_24px_rgba(239,68,68,0.9)] animate-pulse'
              : 'bg-red-950/70 hover:bg-red-900/90 border-red-800/80 text-red-300 shadow-[0_0_10px_rgba(239,68,68,0.2)]'
          }`}
          title={isEstop ? 'Click to Release E-Stop and Resume' : 'Instantly arrest all PWM motor outputs'}
        >
          <Power className={`w-3.5 h-3.5 ${isEstop ? 'animate-spin' : ''}`} />
          <span>{isEstop ? 'RELEASE E-STOP' : 'EMERGENCY STOP'}</span>
        </button>
      </div>
    </header>
  );
};

export default TopBar;
