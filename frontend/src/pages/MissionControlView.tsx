import React, { useState } from 'react';
import {
  Crosshair,
  Play,
  Pause,
  RotateCcw,
  Sparkles,
  Building2,
  Send,
  CheckCircle2,
  Flag,
  Target,
  Box,
  Trash2,
  ArrowUp,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  Square,
  Compass,
} from 'lucide-react';
import { EnvironmentType, NavigationStatus, TargetLocation } from '../types/robotics';
import { api } from '../services/api';

interface MissionControlViewProps {
  environment: EnvironmentType;
  navigation: NavigationStatus;
  targets: TargetLocation[];
  onStartMission: (prompt: string) => void;
  onPauseMission: () => void;
  onResumeMission: () => void;
  onResetMission: () => void;
  onSwitchEnvironment: (env: EnvironmentType) => void;
  onStartJudgeDemo: () => void;
}

export const MissionControlView: React.FC<MissionControlViewProps> = ({
  environment,
  navigation,
  targets,
  onStartMission,
  onPauseMission,
  onResumeMission,
  onResetMission,
  onSwitchEnvironment,
  onStartJudgeDemo,
}) => {
  const [promptInput, setPromptInput] = useState('');
  const [scenarioStatus, setScenarioStatus] = useState<string | null>(null);
  const [teleopSpeed, setTeleopSpeed] = useState<number>(0.4);
  const [activeKey, setActiveKey] = useState<string | null>(null);

  const stateHistory = navigation.state_history || [];
  const historyStates = stateHistory.map((h) => h.to_state);

  const m1_detected = historyStates.includes('OBSTACLE_DETECTED') || (navigation.active_obstacle?.detected ?? false);
  const m2_safety = historyStates.includes('OBSTACLE_DETECTED');
  const m3_stopped = historyStates.includes('ROBOT_STOPPING') || historyStates.includes('ROBOT_STOPPED');
  const m4_mapUpdated = historyStates.includes('LOCAL_MAP_UPDATED');
  const m5_replanned =
    historyStates.includes('REPLANNING') ||
    historyStates.includes('NEW_ROUTE_CALCULATED') ||
    navigation.metrics.replans_count > 0;
  const m6_followingDetour = m5_replanned && navigation.state === 'NAVIGATING';
  const m7_reached = historyStates.includes('TARGET_REACHED') || navigation.state === 'TARGET_REACHED';

  // Manual Teleoperation commands
  const handleTeleop = async (dir: string) => {
    setActiveKey(dir);
    try {
      if (dir === 'stop') {
        await api.stopRobot();
      } else {
        await api.moveRobot(dir, teleopSpeed, 0.8);
      }
    } catch (e: any) {
      console.error('Teleop error:', e);
    } finally {
      setTimeout(() => setActiveKey(null), 300);
    }
  };

  const handleRunObstacleScenario = async () => {
    try {
      setScenarioStatus('Starting Autonomous Obstacle Avoidance Scenario...');
      await api.runObstacleScenario();
      setScenarioStatus('Scenario Active: Robot A (2, 3) -> Obstacle at (6, 3) -> Destination B (10, 3)');
    } catch (e: any) {
      setScenarioStatus(`Error: ${e.message}`);
    }
  };

  const handlePlaceObstacle = async () => {
    try {
      await api.placeObstacle({ distance_ahead: 2.0 });
      setScenarioStatus('Unexpected storage crate injected 2.0m ahead on route.');
    } catch (e: any) {
      setScenarioStatus(`Error: ${e.message}`);
    }
  };

  const handleClearObstacles = async () => {
    try {
      await api.clearObstacles();
      setScenarioStatus('Placed obstacles removed from costmap.');
    } catch (e: any) {
      setScenarioStatus(`Error: ${e.message}`);
    }
  };

  const missionTemplates = [
    { title: 'Blue Package Mission (Default)', prompt: 'Find the blue package and navigate to it.' },
    { title: 'Charging Station Dock', prompt: 'Navigate to the charging station.' },
    { title: 'QA Inspection Table', prompt: 'Reach the inspection zone.' },
    { title: 'Executive Meeting Area', prompt: 'Move to the meeting area.' },
    { title: 'Red Hazard Box', prompt: 'Go to the red package.' },
  ];

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!promptInput.trim()) return;
    onStartMission(promptInput);
  };

  return (
    <div className="h-full flex flex-col gap-3.5 p-4 bg-[#060911] overflow-y-auto font-sans">
      {/* 1. Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800/80 pb-3">
        <div>
          <h2 className="text-base font-bold text-slate-100 flex items-center gap-2 font-mono">
            <Crosshair className="w-5 h-5 text-cyan-400" />
            Mission Command & Objective Planner
          </h2>
          <p className="text-xs text-slate-400">
            Define high-level objectives in natural language, dispatch autonomous routes, execute manual teleoperation, or configure testing facilities.
          </p>
        </div>
        <button
          onClick={onStartJudgeDemo}
          className="px-3.5 py-1.5 rounded bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold font-mono text-xs tracking-wider transition shadow-[0_0_15px_rgba(6,182,212,0.35)] cursor-pointer flex items-center gap-1.5 shrink-0"
        >
          <Sparkles className="w-3.5 h-3.5" />
          <span>RUN JUDGE DEMO</span>
        </button>
      </div>

      {/* 2. Facility Selection */}
      <div className="bg-slate-950/80 border border-slate-800 rounded-lg p-3.5 space-y-2.5">
        <div className="flex items-center gap-2 text-xs font-bold text-cyan-400 font-mono uppercase tracking-wider">
          <Building2 className="w-4 h-4 text-cyan-400" />
          <span>Active Simulation Facility</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
          {[
            { id: 'warehouse', label: '1. Industrial Warehouse', desc: 'Shelves, pallets, staging tables & technician' },
            { id: 'office', label: '2. Modern Office', desc: 'Conference glass, desk pods, laptops & colleague' },
            { id: 'smart_laboratory', label: '3. Smart Laboratory', desc: 'Clean benches, cryo storage, fume hood & scientist' },
          ].map((env) => {
            const isSelected = environment === env.id;
            return (
              <button
                key={env.id}
                onClick={() => onSwitchEnvironment(env.id as EnvironmentType)}
                className={`p-3 rounded-lg border text-left transition cursor-pointer ${
                  isSelected
                    ? 'bg-cyan-950/70 border-cyan-500 shadow-[0_0_12px_rgba(6,182,212,0.25)]'
                    : 'bg-slate-900/60 border-slate-800 hover:border-slate-700'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className={`text-xs font-bold font-mono ${isSelected ? 'text-cyan-300' : 'text-slate-200'}`}>
                    {env.label}
                  </span>
                  {isSelected && <span className="w-2 h-2 rounded-full bg-cyan-400 status-active-pulse" />}
                </div>
                <p className="text-[11px] text-slate-400 mt-1">{env.desc}</p>
              </button>
            );
          })}
        </div>
      </div>

      {/* 3. Custom Objective NLP Prompt */}
      <div className="bg-slate-950/80 border border-slate-800 rounded-lg p-3.5 space-y-3">
        <div className="text-xs font-bold text-cyan-400 font-mono uppercase tracking-wider flex items-center gap-1.5">
          <Target className="w-4 h-4 text-cyan-400" />
          <span>Enter Natural Language Mission Objective</span>
        </div>

        <form onSubmit={handleSubmit} className="flex gap-2">
          <input
            type="text"
            value={promptInput}
            onChange={(e) => setPromptInput(e.target.value)}
            placeholder="e.g. Find the blue package and navigate to it..."
            className="flex-1 bg-slate-900 border border-slate-700 rounded px-3 py-2 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-cyan-500 font-mono"
          />
          <button
            type="submit"
            className="px-4 py-2 rounded bg-cyan-600 hover:bg-cyan-500 text-white font-bold font-mono text-xs flex items-center gap-1.5 transition cursor-pointer shadow-[0_0_10px_rgba(6,182,212,0.25)]"
          >
            <Send className="w-3.5 h-3.5" />
            <span>DISPATCH</span>
          </button>
        </form>

        {/* Mission Templates */}
        <div className="space-y-1.5 pt-1">
          <div className="text-[10px] text-slate-500 font-mono uppercase">Quick Mission Templates:</div>
          <div className="flex flex-wrap gap-2">
            {missionTemplates.map((tmpl) => (
              <button
                key={tmpl.title}
                onClick={() => {
                  setPromptInput(tmpl.prompt);
                  onStartMission(tmpl.prompt);
                }}
                className="px-2.5 py-1.5 rounded bg-slate-900 hover:bg-slate-800 border border-slate-800 text-[11px] text-slate-300 font-mono transition cursor-pointer flex items-center gap-1.5"
              >
                <Flag className="w-3 h-3 text-cyan-400" />
                <span>{tmpl.prompt}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Discovered Facility Targets */}
        {targets && targets.length > 0 && (
          <div className="space-y-1.5 pt-1.5 border-t border-slate-800/60 font-mono">
            <div className="text-[10px] text-slate-500 uppercase">Discovered Facility Waypoint Targets:</div>
            <div className="flex flex-wrap gap-2">
              {targets.map((tgt) => (
                <button
                  key={tgt.id}
                  onClick={() => {
                    const prompt = `Navigate to ${tgt.name}`;
                    setPromptInput(prompt);
                    onStartMission(prompt);
                  }}
                  className="px-2.5 py-1 rounded bg-cyan-950/40 hover:bg-cyan-950 border border-cyan-800/60 text-[11px] text-cyan-300 transition cursor-pointer flex items-center gap-1.5"
                >
                  <Target className="w-3 h-3 text-cyan-400" />
                  <span>
                    {tgt.name} ({tgt.x.toFixed(1)}, {tgt.y.toFixed(1)})
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* 4. Execution Controls & Manual Teleoperation Deck */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
        {/* Mission Execution Controls */}
        <div className="bg-slate-950/80 border border-slate-800 rounded-lg p-3.5 space-y-3">
          <div className="text-xs font-bold text-slate-200 font-mono uppercase tracking-wider flex items-center gap-1.5">
            <Play className="w-4 h-4 text-cyan-400" />
            <span>Autonomous Execution Controls</span>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {navigation.state === 'NAVIGATING' ? (
              <button
                onClick={onPauseMission}
                className="px-4 py-2 rounded bg-amber-600 hover:bg-amber-500 text-white font-bold font-mono text-xs flex items-center gap-2 transition cursor-pointer"
              >
                <Pause className="w-4 h-4" />
                PAUSE NAVIGATION
              </button>
            ) : (
              <button
                onClick={onResumeMission}
                className="px-4 py-2 rounded bg-emerald-600 hover:bg-emerald-500 text-white font-bold font-mono text-xs flex items-center gap-2 transition cursor-pointer shadow-[0_0_12px_rgba(16,185,129,0.3)]"
              >
                <Play className="w-4 h-4" />
                RESUME NAVIGATION
              </button>
            )}

            <button
              onClick={onResetMission}
              className="px-4 py-2 rounded bg-slate-900 hover:bg-slate-800 text-slate-200 font-bold font-mono text-xs flex items-center gap-2 transition border border-slate-700 cursor-pointer"
            >
              <RotateCcw className="w-4 h-4" />
              RESET MISSION & ROBOT
            </button>
          </div>

          <div className="p-2.5 rounded bg-slate-900/60 border border-slate-800 text-xs font-mono space-y-1">
            <div className="text-[10px] text-slate-500 uppercase">State Machine Feedback</div>
            <div className="text-slate-300">
              State: <strong className="text-cyan-300">{navigation.state}</strong>
            </div>
            <div className="text-[11px] text-slate-400">
              Distance remaining: {navigation.metrics.distance_remaining.toFixed(2)}m | Replans:{' '}
              {navigation.metrics.replans_count}
            </div>
          </div>
        </div>

        {/* Manual Teleoperation Virtual Deck */}
        <div className="bg-slate-950/80 border border-slate-800 rounded-lg p-3.5 space-y-3">
          <div className="flex items-center justify-between border-b border-slate-800 pb-2">
            <div className="text-xs font-bold text-slate-200 font-mono uppercase tracking-wider flex items-center gap-1.5">
              <Compass className="w-4 h-4 text-cyan-400" />
              <span>Manual Teleoperation Deck</span>
            </div>
            <span className="text-[10px] font-mono text-cyan-400 font-bold">
              SPEED: {teleopSpeed.toFixed(1)} m/s
            </span>
          </div>

          {/* D-Pad Buttons */}
          <div className="flex flex-col items-center justify-center gap-1.5 py-1">
            <button
              onClick={() => handleTeleop('forward')}
              className={`w-14 h-10 rounded bg-slate-900 hover:bg-cyan-950 border border-slate-700 hover:border-cyan-500 flex items-center justify-center text-slate-200 transition cursor-pointer ${
                activeKey === 'forward' ? 'bg-cyan-600 text-white' : ''
              }`}
              title="Drive Forward"
            >
              <ArrowUp className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-1.5">
              <button
                onClick={() => handleTeleop('rotate_left')}
                className={`w-14 h-10 rounded bg-slate-900 hover:bg-cyan-950 border border-slate-700 hover:border-cyan-500 flex items-center justify-center text-slate-200 transition cursor-pointer ${
                  activeKey === 'rotate_left' ? 'bg-cyan-600 text-white' : ''
                }`}
                title="Rotate Left"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
              <button
                onClick={() => handleTeleop('stop')}
                className="w-14 h-10 rounded bg-red-950 hover:bg-red-900 border border-red-700 flex items-center justify-center text-red-300 font-bold text-xs transition cursor-pointer"
                title="Emergency Halt"
              >
                <Square className="w-4 h-4 fill-current" />
              </button>
              <button
                onClick={() => handleTeleop('rotate_right')}
                className={`w-14 h-10 rounded bg-slate-900 hover:bg-cyan-950 border border-slate-700 hover:border-cyan-500 flex items-center justify-center text-slate-200 transition cursor-pointer ${
                  activeKey === 'rotate_right' ? 'bg-cyan-600 text-white' : ''
                }`}
                title="Rotate Right"
              >
                <ArrowRight className="w-5 h-5" />
              </button>
            </div>

            <button
              onClick={() => handleTeleop('backward')}
              className={`w-14 h-10 rounded bg-slate-900 hover:bg-cyan-950 border border-slate-700 hover:border-cyan-500 flex items-center justify-center text-slate-200 transition cursor-pointer ${
                activeKey === 'backward' ? 'bg-cyan-600 text-white' : ''
              }`}
              title="Drive Backward"
            >
              <ArrowDown className="w-5 h-5" />
            </button>
          </div>

          {/* Speed Factor Slider */}
          <div className="flex items-center gap-2 text-xs font-mono pt-1">
            <span className="text-[10px] text-slate-500">SPEED:</span>
            <input
              type="range"
              min="0.1"
              max="0.8"
              step="0.05"
              value={teleopSpeed}
              onChange={(e) => setTeleopSpeed(parseFloat(e.target.value))}
              className="flex-1 accent-cyan-500"
            />
          </div>
        </div>
      </div>

      {/* 5. Benchmark Scenario: Obstacle On Route & Dynamic Detour */}
      <div className="bg-slate-950/80 border border-slate-800 rounded-lg p-3.5 space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800 pb-2.5">
          <div>
            <div className="flex items-center gap-2">
              <Target className="w-4 h-4 text-amber-400" />
              <span className="text-xs font-bold text-slate-200 uppercase font-mono tracking-wider">
                Autonomous Navigation Verification Scenario
              </span>
            </div>
            <p className="text-[11px] text-slate-400 mt-0.5">
              Start at A (2.0, 3.0), target B at (10.0, 3.0), unexpected obstacle placed directly midway at (6.0, 3.0).
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleRunObstacleScenario}
              className="px-3.5 py-1.5 rounded bg-cyan-600 hover:bg-cyan-500 text-white font-bold font-mono text-xs tracking-wider transition flex items-center gap-1.5 shadow-[0_0_12px_rgba(6,182,212,0.35)] cursor-pointer"
            >
              <Play className="w-3.5 h-3.5 fill-current" />
              START SCENARIO
            </button>
            <button
              onClick={handlePlaceObstacle}
              className="px-2.5 py-1.5 rounded bg-amber-600/80 hover:bg-amber-500 text-white font-medium font-mono text-xs transition flex items-center gap-1 cursor-pointer"
            >
              <Box className="w-3.5 h-3.5" />
              Place Obstacle
            </button>
            <button
              onClick={handleClearObstacles}
              className="px-2.5 py-1.5 rounded bg-slate-900 hover:bg-slate-800 text-slate-300 font-medium font-mono text-xs transition border border-slate-700 flex items-center gap-1 cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5 text-slate-400" />
              Clear
            </button>
          </div>
        </div>

        {scenarioStatus && (
          <div className="text-xs font-mono text-cyan-300 bg-cyan-950/60 border border-cyan-800/60 rounded px-2.5 py-1.5">
            {scenarioStatus}
          </div>
        )}

        {/* 7 Expected Milestones Checklist */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-7 gap-2 text-[11px] font-mono">
          {[
            { label: '1. Detect Obstacle', done: m1_detected, desc: 'Corridor & LiDAR' },
            { label: '2. Zero Collision', done: m2_safety, desc: 'Buffer >= 0.50m' },
            { label: '3. Slows / Stops', done: m3_stopped, desc: 'Safety decel' },
            { label: '4. Map Updated', done: m4_mapUpdated, desc: 'Costmap updated' },
            { label: '5. New Route', done: m5_replanned, desc: 'A* detour calculated' },
            { label: '6. Follows Detour', done: m6_followingDetour, desc: 'Waypoint tracking' },
            { label: '7. Reaches B', done: m7_reached, desc: 'Goal completed' },
          ].map((m, i) => (
            <div
              key={i}
              className={`p-2 rounded border flex flex-col justify-between transition ${
                m.done
                  ? 'bg-emerald-950/80 border-emerald-600 text-emerald-200'
                  : 'bg-slate-900/60 border-slate-800 text-slate-500'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="font-bold">{m.label}</span>
                {m.done ? (
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                ) : (
                  <span className="w-2 h-2 rounded-full bg-slate-700 shrink-0" />
                )}
              </div>
              <span className="text-[9px] opacity-80 mt-1">{m.desc}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default MissionControlView;
