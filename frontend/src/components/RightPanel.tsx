import React from 'react';
import {
  Battery,
  Gauge,
  MapPin,
  Compass,
  Crosshair,
  UserCheck,
  Eye,
  ShieldCheck,
  Clock,
  Zap,
  AlertTriangle,
  Layers,
  Activity,
  ChevronRight,
  ChevronLeft,
} from 'lucide-react';
import {
  RobotState,
  NavigationStatus,
  Detection,
  VLMStructuredOutput,
} from '../types/robotics';

interface RightPanelProps {
  robot: RobotState;
  navigation: NavigationStatus;
  detections: Detection[];
  vlmReasoning: VLMStructuredOutput | null;
  activeTarget: string | null;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
}

export const RightPanel: React.FC<RightPanelProps> = ({
  robot,
  navigation,
  detections,
  vlmReasoning,
  activeTarget,
  collapsed = false,
  onToggleCollapse,
}) => {
  const peopleCount = detections.filter((d) => d.class_name === 'person').length;
  const targetDet = detections.find((d) => d.is_target);
  const targetConfidence = targetDet
    ? Math.round(targetDet.confidence * 100)
    : vlmReasoning?.target_confidence
    ? Math.round(vlmReasoning.target_confidence * 100)
    : 0;

  // Heading in degrees (-180 to 180)
  const headingDeg = Math.round((robot.pose.theta * 180) / Math.PI);

  const activeStage = navigation.pipeline_stage || 'Trajectory Tracking';
  const latestTransition =
    navigation.state_history && navigation.state_history.length > 0
      ? navigation.state_history[navigation.state_history.length - 1]
      : null;

  if (collapsed) {
    return (
      <div className="w-10 bg-[#070a12]/95 border-l border-slate-800/80 flex flex-col items-center py-3 select-none shrink-0 h-[calc(100vh-3.5rem)]">
        {onToggleCollapse && (
          <button
            onClick={onToggleCollapse}
            className="p-1 rounded bg-slate-900 border border-slate-800 text-slate-400 hover:text-white transition cursor-pointer"
            title="Expand Telemetry Console"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
        )}
        <div className="mt-8 text-[10px] font-mono text-cyan-400 rotate-90 whitespace-nowrap tracking-widest uppercase">
          TELEMETRY // 20 HZ
        </div>
      </div>
    );
  }

  return (
    <aside className="w-80 bg-[#070a12]/95 border-l border-slate-800/80 p-3 flex flex-col gap-2.5 select-none shrink-0 h-[calc(100vh-3.5rem)] overflow-y-auto font-sans">
      {/* 0. Header with Collapse Toggle */}
      <div className="flex items-center justify-between border-b border-slate-800/80 pb-2">
        <div className="flex items-center gap-1.5 font-mono text-xs font-bold text-slate-200 uppercase tracking-wider">
          <Activity className="w-3.5 h-3.5 text-cyan-400" />
          <span>Telemetry & Perception HUD</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] font-mono text-emerald-400 font-bold px-1.5 py-0.5 rounded bg-emerald-950/60 border border-emerald-800">
            20 Hz LIVE
          </span>
          {onToggleCollapse && (
            <button
              onClick={onToggleCollapse}
              className="p-1 rounded bg-slate-900 border border-slate-800 text-slate-400 hover:text-white transition cursor-pointer"
              title="Collapse Telemetry Panel"
            >
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* 1. PIPELINE STAGE CARD */}
      <div className="bg-slate-950/80 border border-cyan-800/60 rounded-lg p-2.5 space-y-1 shadow-sm">
        <div className="flex items-center justify-between text-xs font-mono">
          <div className="flex items-center gap-1.5 font-bold text-cyan-400 uppercase tracking-wider">
            <Zap className="w-3.5 h-3.5 text-cyan-400 animate-pulse" />
            <span>Autonomous Pipeline</span>
          </div>
          <span className="text-[9px] font-mono font-bold text-cyan-300 px-1.5 py-0.2 rounded bg-cyan-950 border border-cyan-700">
            STAGE ACTIVE
          </span>
        </div>
        <div className="font-mono text-xs font-bold text-slate-100 flex items-center gap-1">
          <span className="text-cyan-400">&gt;</span>
          <span className="truncate">{activeStage}</span>
        </div>
      </div>

      {/* 2. ACTIVE OBSTACLE WARNING (IF DETECTED) */}
      {navigation.active_obstacle && navigation.active_obstacle.detected && (
        <div className="bg-red-950/80 border border-red-700 rounded-lg p-2.5 space-y-1 animate-pulse">
          <div className="flex items-center justify-between text-xs font-bold text-red-300 font-mono">
            <span className="flex items-center gap-1">
              <AlertTriangle className="w-3.5 h-3.5 text-red-400" />
              ROUTE BLOCKED
            </span>
            <span>{navigation.active_obstacle.distance.toFixed(2)}m</span>
          </div>
          <div className="text-[11px] font-mono text-red-200 leading-tight">
            {navigation.active_obstacle.name || 'Unexpected Obstacle'} on corridor. Detour calculating.
          </div>
        </div>
      )}

      {/* 3. TARGET LOCALIZATION (WHEN CONFIRMED) */}
      {navigation.target_localization && navigation.target_localization.confirmed && (
        <div className="bg-cyan-950/40 border border-cyan-800/60 rounded-lg p-2.5 space-y-1 text-xs font-mono">
          <div className="flex items-center justify-between text-cyan-300 font-bold text-[11px]">
            <span className="flex items-center gap-1">
              <Crosshair className="w-3.5 h-3.5 text-cyan-400" />
              VISION GROUNDING
            </span>
            <span className="text-emerald-400">
              {Math.round(navigation.target_localization.confidence * 100)}%
            </span>
          </div>
          <div className="grid grid-cols-2 gap-1 text-[11px] text-slate-300 pt-0.5">
            <div>
              Coords: ({navigation.target_localization.world_x.toFixed(2)},{' '}
              {navigation.target_localization.world_y.toFixed(2)})
            </div>
            <div className="text-right">Dist: {navigation.target_localization.distance.toFixed(2)}m</div>
          </div>
        </div>
      )}

      {/* 4. MISSION STATUS CARD */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-lg p-2.5 space-y-2">
        <div className="flex items-center justify-between border-b border-slate-800/80 pb-1.5">
          <div className="flex items-center gap-1.5 text-xs font-bold text-cyan-400 font-mono uppercase tracking-wider">
            <Crosshair className="w-3.5 h-3.5" />
            <span>Mission Status</span>
          </div>
          <span
            className={`text-[11px] font-mono font-bold ${
              navigation.state === 'NAVIGATING'
                ? 'text-cyan-300'
                : navigation.state === 'OBSTACLE_DETECTED' || navigation.state === 'ROBOT_STOPPING'
                ? 'text-amber-400 animate-pulse'
                : navigation.state === 'TARGET_REACHED'
                ? 'text-emerald-400'
                : 'text-slate-400'
            }`}
          >
            {navigation.state}
          </span>
        </div>

        <div className="space-y-1.5 text-xs">
          <div>
            <div className="text-[9px] text-slate-500 uppercase font-mono">Current Objective</div>
            <div className="font-medium text-slate-200 truncate">
              {robot.current_behavior || 'Awaiting command'}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 pt-1 border-t border-slate-800/50">
            <div>
              <div className="text-[9px] text-slate-500 font-mono uppercase">TARGET</div>
              <div className="font-semibold text-cyan-300 truncate">
                {navigation.goal_name || activeTarget || 'None'}
              </div>
            </div>
            <div>
              <div className="text-[9px] text-slate-500 font-mono uppercase">DISTANCE</div>
              <div className="font-semibold font-mono text-slate-200">
                {navigation.metrics.distance_remaining.toFixed(2)} m
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 pt-1 border-t border-slate-800/50">
            <div className="flex items-center gap-1">
              <Clock className="w-3 h-3 text-slate-400" />
              <span className="text-[9px] text-slate-500 font-mono">ETA:</span>
              <span className="font-medium font-mono text-slate-200">
                {navigation.metrics.eta_seconds.toFixed(0)}s
              </span>
            </div>
            <div className="text-right">
              <span className="text-[9px] text-slate-500 font-mono uppercase">REPLANS:</span>
              <span className="ml-1 font-mono text-amber-400 font-bold">
                {navigation.metrics.replans_count}
              </span>
            </div>
          </div>

          {latestTransition && (
            <div className="pt-1.5 border-t border-slate-800/50 text-[10px] font-mono text-slate-400">
              <div className="flex items-center gap-1 text-slate-300 font-semibold">
                <Layers className="w-3 h-3 text-cyan-400" />
                <span>Transition: {latestTransition.to_state}</span>
              </div>
              <div className="truncate text-slate-400 mt-0.5">{latestTransition.reason}</div>
            </div>
          )}
        </div>
      </div>

      {/* 5. AI PERCEPTION VITALS */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-lg p-2.5 space-y-2">
        <div className="flex items-center justify-between border-b border-slate-800/80 pb-1.5">
          <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-400 font-mono uppercase tracking-wider">
            <Eye className="w-3.5 h-3.5" />
            <span>AI Perception</span>
          </div>
          <span className="px-1.5 py-0.2 rounded text-[9px] font-mono bg-emerald-950/80 text-emerald-300 border border-emerald-800">
            ACTIVE (20 FPS)
          </span>
        </div>

        <div className="grid grid-cols-2 gap-2 text-xs font-mono">
          <div className="p-2 rounded bg-slate-950/60 border border-slate-800/60">
            <div className="text-[9px] text-slate-500 uppercase">OBJECTS IN FOV</div>
            <div className="text-lg font-bold text-slate-200 mt-0.5">{detections.length}</div>
          </div>
          <div className="p-2 rounded bg-slate-950/60 border border-slate-800/60">
            <div className="text-[9px] text-slate-500 uppercase">HUMANOIDS / PED</div>
            <div className="text-lg font-bold text-amber-400 flex items-center gap-1 mt-0.5">
              <UserCheck className="w-3.5 h-3.5" />
              {peopleCount}
            </div>
          </div>
        </div>

        <div className="pt-1 space-y-1">
          <div className="flex items-center justify-between text-xs font-mono">
            <span className="text-slate-400 text-[11px]">Target Confidence</span>
            <span className="text-cyan-300 font-semibold">{targetConfidence}%</span>
          </div>
          <div className="w-full bg-slate-800 rounded-full h-1.5 overflow-hidden">
            <div
              className="bg-cyan-400 h-1.5 rounded-full transition-all duration-300 shadow-[0_0_8px_rgba(6,182,212,0.5)]"
              style={{ width: `${targetConfidence}%` }}
            />
          </div>
        </div>

        {/* VLM Scene Reasoning Snippet */}
        {vlmReasoning && (
          <div className="p-2 rounded bg-slate-950/70 border border-slate-800 text-[11px] space-y-1">
            <div className="text-[9px] font-mono font-semibold text-cyan-400 uppercase">
              VLM Scene Reasoning
            </div>
            <div className="text-slate-300 leading-snug line-clamp-2">
              {vlmReasoning.scene_summary}
            </div>
            <div className="text-emerald-400 text-[10px] font-mono">
              Advisory: {vlmReasoning.recommended_action}
            </div>
          </div>
        )}
      </div>

      {/* 6. ROBOT KINEMATICS & VITALS */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-lg p-2.5 space-y-2">
        <div className="flex items-center justify-between border-b border-slate-800/80 pb-1.5">
          <div className="flex items-center gap-1.5 text-xs font-bold text-slate-300 font-mono uppercase tracking-wider">
            <ShieldCheck className="w-3.5 h-3.5 text-cyan-400" />
            <span>Robot Telemetry & Kinematics</span>
          </div>
          <span className="text-[9px] font-mono text-emerald-400 font-bold">NOMINAL</span>
        </div>

        {/* Battery Telemetry */}
        <div className="space-y-1 font-mono">
          <div className="flex items-center justify-between text-xs">
            <div className="flex items-center gap-1.5 text-slate-400">
              <Battery className="w-3.5 h-3.5 text-emerald-400" />
              <span>Simulated Battery</span>
            </div>
            <span className="text-slate-200 font-semibold">
              {robot.battery.percentage.toFixed(1)}% ({robot.battery.voltage.toFixed(1)}V)
            </span>
          </div>
          <div className="w-full bg-slate-800 rounded-full h-1.5 overflow-hidden">
            <div
              className={`h-1.5 rounded-full transition-all duration-300 ${
                robot.battery.percentage > 30 ? 'bg-emerald-400' : 'bg-red-500'
              }`}
              style={{ width: `${robot.battery.percentage}%` }}
            />
          </div>
        </div>

        {/* Speed & Heading Grid */}
        <div className="grid grid-cols-2 gap-2 text-xs pt-1 font-mono">
          <div className="p-2 rounded bg-slate-950/60 border border-slate-800/60">
            <div className="text-[9px] text-slate-500 flex items-center gap-1">
              <Gauge className="w-3 h-3 text-cyan-400" />
              <span>LINEAR VEL</span>
            </div>
            <div className="text-sm font-bold text-slate-200 mt-0.5">
              {robot.twist.linear.toFixed(2)} m/s
            </div>
          </div>

          <div className="p-2 rounded bg-slate-950/60 border border-slate-800/60">
            <div className="text-[9px] text-slate-500 flex items-center gap-1">
              <Compass className="w-3 h-3 text-cyan-400" />
              <span>HEADING</span>
            </div>
            <div className="text-sm font-bold text-slate-200 mt-0.5">
              {headingDeg}° ({robot.pose.theta.toFixed(2)} rad)
            </div>
          </div>
        </div>

        {/* Differential Wheel Speeds */}
        <div className="grid grid-cols-2 gap-2 text-xs font-mono">
          <div className="p-1.5 rounded bg-slate-950/60 border border-slate-800/60">
            <span className="text-[9px] text-slate-500">WHEEL L:</span>
            <span className="ml-1 text-slate-200 font-bold">{robot.wheels.left.toFixed(2)} m/s</span>
          </div>
          <div className="p-1.5 rounded bg-slate-950/60 border border-slate-800/60">
            <span className="text-[9px] text-slate-500">WHEEL R:</span>
            <span className="ml-1 text-slate-200 font-bold">{robot.wheels.right.toFixed(2)} m/s</span>
          </div>
        </div>

        {/* Coordinates & Odometry */}
        <div className="p-2 rounded bg-slate-950/60 border border-slate-800/60 text-xs font-mono space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-[9px] text-slate-500 flex items-center gap-1 uppercase">
              <MapPin className="w-3 h-3 text-slate-400" />
              COORDINATES (X, Y)
            </span>
            <span className="font-bold text-cyan-300">
              ({robot.pose.x.toFixed(2)}, {robot.pose.y.toFixed(2)})
            </span>
          </div>
          <div className="flex items-center justify-between text-[10px] text-slate-400 pt-0.5 border-t border-slate-800/40">
            <span>Odometry Travel:</span>
            <span className="text-slate-300 font-medium">
              {robot.odometry_distance.toFixed(2)} m
            </span>
          </div>
        </div>
      </div>
    </aside>
  );
};

export default RightPanel;
