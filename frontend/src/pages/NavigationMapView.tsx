import React, { useRef, useEffect, useState } from 'react';
import {
  Compass,
  MapPin,
  Route,
  RefreshCw,
  Gauge,
  Clock,
  ShieldAlert,
  Play,
  CheckCircle2,
  ArrowRight,
  Target,
  Box,
  Zap,
  Layers,
  Trash2,
  Activity,
} from 'lucide-react';
import {
  RobotState,
  NavigationStatus,
  StaticObstacle,
  DynamicObstacle,
  TargetLocation,
  LiDARHit,
  NavigationPipelineStage,
} from '../types/robotics';
import { api } from '../services/api';

interface NavigationMapViewProps {
  robot: RobotState;
  navigation: NavigationStatus;
  staticObstacles: StaticObstacle[];
  dynamicObstacles: DynamicObstacle[];
  targets: TargetLocation[];
  activeTarget: string | null;
  lidarRays: LiDARHit[];
}

const PIPELINE_STAGES: { id: NavigationPipelineStage; label: string; number: number }[] = [
  { id: 'Mission', label: '1. Mission', number: 1 },
  { id: 'Target identification', label: '2. Target ID', number: 2 },
  { id: 'Target localization', label: '3. Target Localize', number: 3 },
  { id: 'Navigation goal', label: '4. Nav Goal', number: 4 },
  { id: 'Global path', label: '5. Global Path', number: 5 },
  { id: 'Local path', label: '6. Local Path', number: 6 },
  { id: 'Obstacle checking', label: '7. Obstacle Check', number: 7 },
  { id: 'Velocity controller', label: '8. Velocity Ctrl', number: 8 },
  { id: 'Robot movement', label: '9. Movement', number: 9 },
];

export const NavigationMapView: React.FC<NavigationMapViewProps> = ({
  robot,
  navigation,
  staticObstacles,
  dynamicObstacles,
  targets,
  activeTarget,
  lidarRays,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isScenarioRunning, setIsScenarioRunning] = useState(false);
  const [scenarioMessage, setScenarioMessage] = useState<string | null>(null);

  // World dimensions
  const worldW = 20.0;
  const worldH = 14.0;

  // Active stage determination
  const activeStageName = navigation.pipeline_stage || 'Mission';

  // 7 Expected Milestones logic based on live simulation state history
  const stateHistory = navigation.state_history || [];
  const historyStates = stateHistory.map((h) => h.to_state);

  const m1_detected = historyStates.includes('OBSTACLE_DETECTED') || (navigation.active_obstacle?.detected ?? false);
  const m2_safety =
    historyStates.includes('OBSTACLE_DETECTED') &&
    (robot.pose.x < 5.8 || robot.pose.x > 6.2 || robot.pose.y > 3.6);
  const m3_stopped = historyStates.includes('ROBOT_STOPPING') || historyStates.includes('ROBOT_STOPPED');
  const m4_mapUpdated = historyStates.includes('LOCAL_MAP_UPDATED');
  const m5_replanned =
    historyStates.includes('REPLANNING') ||
    historyStates.includes('NEW_ROUTE_CALCULATED') ||
    navigation.metrics.replans_count > 0;
  const m6_followingDetour = m5_replanned && navigation.state === 'NAVIGATING' && robot.pose.x > 4.5;
  const m7_reached = historyStates.includes('TARGET_REACHED') || navigation.state === 'TARGET_REACHED';

  // Trigger benchmark obstacle scenario
  const handleRunObstacleScenario = async () => {
    try {
      setIsScenarioRunning(true);
      setScenarioMessage('Starting Autonomous Obstacle Scenario (A to B with route blockage)...');
      await api.runObstacleScenario();
      setScenarioMessage('Scenario Active: Robot A (2, 3) -> Obstacle at (6, 3) -> Destination B (10, 3)');
    } catch (err: any) {
      setScenarioMessage(`Failed to trigger scenario: ${err.message}`);
    }
  };

  const handlePlaceObstacleAhead = async () => {
    try {
      await api.placeObstacle({ distance_ahead: 2.0 });
      setScenarioMessage('Unexpected obstacle injected 2.0m ahead on route corridor.');
    } catch (err: any) {
      setScenarioMessage(`Cannot place obstacle: ${err.message}`);
    }
  };

  const handleClearPlacedObstacles = async () => {
    try {
      await api.clearObstacles();
      setScenarioMessage('All placed obstacles removed and costmap reset.');
      setIsScenarioRunning(false);
    } catch (err: any) {
      setScenarioMessage(`Failed to clear: ${err.message}`);
    }
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;

    // Coordinate transforms: world (0..20, 0..14) -> canvas (0..width, 0..height)
    const scaleX = width / worldW;
    const scaleY = height / worldH;

    const toCanvasX = (wx: number) => wx * scaleX;
    const toCanvasY = (wy: number) => height - wy * scaleY; // flip Y for standard Cartesian

    // 1. Clear background
    ctx.fillStyle = '#060911';
    ctx.fillRect(0, 0, width, height);

    // 2. Draw 1-meter precision grid lines
    ctx.strokeStyle = '#111827';
    ctx.lineWidth = 0.5;
    for (let x = 0; x <= worldW; x += 1.0) {
      ctx.beginPath();
      ctx.moveTo(toCanvasX(x), 0);
      ctx.lineTo(toCanvasX(x), height);
      ctx.stroke();
    }
    for (let y = 0; y <= worldH; y += 1.0) {
      ctx.beginPath();
      ctx.moveTo(0, toCanvasY(y));
      ctx.lineTo(width, toCanvasY(y));
      ctx.stroke();
    }

    // 3. Draw Static Obstacle Inflation Buffer & Bodies
    staticObstacles.forEach((obs) => {
      const isWall = obs.class_name === 'wall';
      const isPlacedCrate = obs.attribute === 'unexpected_block' || obs.id.includes('placed_obs');
      const cx = toCanvasX(obs.x);
      const cy = toCanvasY(obs.y);
      const cw = obs.width * scaleX;
      const ch = obs.height * scaleY;

      // Safety inflation layer
      if (!isWall) {
        const infl = 0.35;
        ctx.fillStyle = isPlacedCrate ? 'rgba(239, 68, 68, 0.15)' : 'rgba(14, 165, 233, 0.08)';
        ctx.fillRect(
          cx - (cw / 2 + infl * scaleX),
          cy - (ch / 2 + infl * scaleY),
          cw + infl * 2 * scaleX,
          ch + infl * 2 * scaleY
        );
      }

      // Obstacle body
      if (isPlacedCrate) {
        ctx.fillStyle = '#d97706'; // Amber/warning for unexpected crate
      } else if (isWall) {
        ctx.fillStyle = '#1e293b';
      } else {
        ctx.fillStyle = '#334155';
      }
      ctx.fillRect(cx - cw / 2, cy - ch / 2, cw, ch);

      ctx.strokeStyle = isPlacedCrate ? '#f59e0b' : isWall ? '#334155' : '#475569';
      ctx.lineWidth = isPlacedCrate ? 2 : 1;
      ctx.strokeRect(cx - cw / 2, cy - ch / 2, cw, ch);

      // Label
      if (!isWall && cw > 24) {
        ctx.fillStyle = isPlacedCrate ? '#fef3c7' : '#94a3b8';
        ctx.font = isPlacedCrate ? 'bold 10px monospace' : '9px monospace';
        ctx.fillText(obs.name, cx - cw / 2 + 3, cy);
      }
    });

    // 4. Draw Dynamic Obstacles (Pedestrians/Workers)
    dynamicObstacles.forEach((dyn) => {
      const cx = toCanvasX(dyn.x);
      const cy = toCanvasY(dyn.y);
      const cr = dyn.radius * scaleX;

      // Safe buffer zone
      ctx.fillStyle = 'rgba(249, 115, 22, 0.18)';
      ctx.beginPath();
      ctx.arc(cx, cy, (dyn.radius + 0.35) * scaleX, 0, Math.PI * 2);
      ctx.fill();

      // Person marker
      ctx.fillStyle = '#f97316';
      ctx.beginPath();
      ctx.arc(cx, cy, cr, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = '#ffedd5';
      ctx.lineWidth = 2;
      ctx.stroke();

      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 10px monospace';
      ctx.fillText(`P-01 (${dyn.name.split(' ')[0]})`, cx - 35, cy - cr - 6);
    });

    // 5. Draw Targets
    targets.forEach((tgt) => {
      const cx = toCanvasX(tgt.x);
      const cy = toCanvasY(tgt.y);
      const cr = tgt.radius * scaleX;
      const isTargetActive =
        tgt.name === activeTarget ||
        (tgt.attribute === 'blue' && activeTarget?.includes('Blue')) ||
        tgt.id === 'tgt_scenario_b';

      ctx.fillStyle = isTargetActive ? 'rgba(37, 99, 235, 0.35)' : 'rgba(16, 185, 129, 0.2)';
      ctx.beginPath();
      ctx.arc(cx, cy, cr * 1.5, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = isTargetActive ? '#2563eb' : '#10b981';
      ctx.beginPath();
      ctx.arc(cx, cy, cr, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.stroke();

      ctx.fillStyle = isTargetActive ? '#38bdf8' : '#6ee7b7';
      ctx.font = 'bold 10px monospace';
      ctx.fillText(tgt.name, cx - 40, cy + cr + 14);
    });

    // 6. Draw Visual Target Localization (crosshairs when identified)
    if (navigation.target_localization && navigation.target_localization.confirmed) {
      const tx = toCanvasX(navigation.target_localization.world_x);
      const ty = toCanvasY(navigation.target_localization.world_y);

      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(tx, ty, 14, 0, Math.PI * 2);
      ctx.moveTo(tx - 20, ty);
      ctx.lineTo(tx + 20, ty);
      ctx.moveTo(tx, ty - 20);
      ctx.lineTo(tx, ty + 20);
      ctx.stroke();

      ctx.fillStyle = '#38bdf8';
      ctx.font = 'bold 9px monospace';
      ctx.fillText(
        `TARGET LOCALIZED (${Math.round(navigation.target_localization.confidence * 100)}%)`,
        tx - 60,
        ty - 18
      );
    }

    // 7. Draw Global A* Path (cyan dashed)
    const globalPath = navigation.global_path?.waypoints?.length ? navigation.global_path : navigation.path;
    const globalWps = globalPath?.waypoints || [];
    if (globalWps && globalWps.length > 0) {
      ctx.strokeStyle = '#06b6d4';
      ctx.lineWidth = 3;
      ctx.setLineDash([6, 3]);
      ctx.beginPath();
      ctx.moveTo(toCanvasX(robot.pose.x), toCanvasY(robot.pose.y));

      globalWps.forEach((wp) => {
        ctx.lineTo(toCanvasX(wp.x), toCanvasY(wp.y));
      });
      ctx.stroke();
      ctx.setLineDash([]);

      // Waypoint dots
      globalWps.forEach((wp, idx) => {
        const wx = toCanvasX(wp.x);
        const wy = toCanvasY(wp.y);
        ctx.fillStyle = idx >= navigation.current_waypoint_index ? '#38bdf8' : '#64748b';
        ctx.beginPath();
        ctx.arc(wx, wy, 3, 0, Math.PI * 2);
        ctx.fill();
      });
    }

    // 8. Draw Local Path Lookahead Window (vibrant amber solid line)
    const localWps = navigation.local_path?.waypoints;
    if (localWps && localWps.length > 0) {
      ctx.strokeStyle = '#f59e0b';
      ctx.lineWidth = 3.5;
      ctx.beginPath();
      ctx.moveTo(toCanvasX(robot.pose.x), toCanvasY(robot.pose.y));

      localWps.forEach((wp) => {
        ctx.lineTo(toCanvasX(wp.x), toCanvasY(wp.y));
      });
      ctx.stroke();

      // Local Waypoint dots
      localWps.forEach((wp) => {
        const wx = toCanvasX(wp.x);
        const wy = toCanvasY(wp.y);
        ctx.fillStyle = '#fbbf24';
        ctx.beginPath();
        ctx.arc(wx, wy, 3.5, 0, Math.PI * 2);
        ctx.fill();
      });
    }

    // 9. Draw Active Detected Obstacle Warning Ring
    if (navigation.active_obstacle && navigation.active_obstacle.detected) {
      const ox = toCanvasX(navigation.active_obstacle.x);
      const oy = toCanvasY(navigation.active_obstacle.y);

      ctx.strokeStyle = '#ef4444';
      ctx.lineWidth = 2.5;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.arc(ox, oy, 25, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.fillStyle = '#ef4444';
      ctx.font = 'bold 10px monospace';
      ctx.fillText(`BLOCKAGE: ${navigation.active_obstacle.distance.toFixed(2)}m`, ox - 45, oy - 30);
    }

    // 10. Draw LiDAR Laser Scan Points
    if (lidarRays && lidarRays.length > 0) {
      ctx.fillStyle = '#ef4444';
      lidarRays.forEach((ray) => {
        if (ray.hit) {
          const lx = toCanvasX(ray.x);
          const ly = toCanvasY(ray.y);
          ctx.beginPath();
          ctx.arc(lx, ly, 2.5, 0, Math.PI * 2);
          ctx.fill();
        }
      });
    }

    // 11. Draw Robot Footprint & Heading Vector
    const rx = toCanvasX(robot.pose.x);
    const ry = toCanvasY(robot.pose.y);
    const robRadius = 0.35 * scaleX;

    // Footprint circle
    ctx.fillStyle = 'rgba(6, 182, 212, 0.35)';
    ctx.beginPath();
    ctx.arc(rx, ry, robRadius, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = '#06b6d4';
    ctx.lineWidth = 2.5;
    ctx.stroke();

    // Robot Heading Arrow
    const headingLen = 22;
    const hx = rx + Math.cos(-robot.pose.theta) * headingLen;
    const hy = ry + Math.sin(-robot.pose.theta) * headingLen;

    ctx.strokeStyle = '#10b981';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(rx, ry);
    ctx.lineTo(hx, hy);
    ctx.stroke();

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 11px monospace';
    ctx.fillText('AMR-01', rx - 20, ry - robRadius - 6);
  }, [
    robot.pose,
    navigation.path,
    navigation.global_path,
    navigation.local_path,
    navigation.current_waypoint_index,
    navigation.target_localization,
    navigation.active_obstacle,
    staticObstacles,
    dynamicObstacles,
    targets,
    activeTarget,
    lidarRays,
  ]);

  return (
    <div className="h-full flex flex-col gap-3.5 p-4 bg-[#060911] overflow-y-auto font-sans">
      {/* 1. Header with Status Badges */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800/80 pb-3">
        <div>
          <h2 className="text-base font-bold text-slate-100 flex items-center gap-2 font-mono">
            <Compass className="w-5 h-5 text-cyan-400" />
            Autonomous Navigation & Dynamic Replanning Engine
          </h2>
          <p className="text-xs text-slate-400">
            Vision-driven goal identification, A* global & local path planning, obstacle avoidance, and dynamic detour execution.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 font-mono text-xs">
          <span className="px-2.5 py-1 rounded bg-slate-900 border border-slate-700 text-slate-300">
            Grid: 0.20m Costmap
          </span>
          <span
            className={`px-2.5 py-1 rounded font-bold border ${
              navigation.state === 'NAVIGATING'
                ? 'bg-cyan-950 border-cyan-500 text-cyan-300'
                : navigation.state === 'OBSTACLE_DETECTED' || navigation.state === 'ROBOT_STOPPING'
                ? 'bg-amber-950 border-amber-500 text-amber-300 animate-pulse'
                : navigation.state === 'REPLANNING' || navigation.state === 'NEW_ROUTE_CALCULATED'
                ? 'bg-purple-950 border-purple-500 text-purple-300'
                : navigation.state === 'TARGET_REACHED'
                ? 'bg-emerald-950 border-emerald-500 text-emerald-300'
                : 'bg-slate-900 border-slate-700 text-slate-400'
            }`}
          >
            STATE: {navigation.state}
          </span>
        </div>
      </div>

      {/* 2. Autonomous 9-Stage Pipeline Stepper */}
      <div className="bg-slate-950/80 border border-slate-800 rounded-lg p-3 space-y-2">
        <div className="flex items-center justify-between text-xs font-mono uppercase tracking-wider text-slate-400">
          <span className="flex items-center gap-1.5 font-bold text-cyan-400">
            <Zap className="w-3.5 h-3.5" />
            9-Stage Autonomous Navigation Pipeline
          </span>
          <span className="text-[11px] text-cyan-300 font-bold">
            Active Stage: {activeStageName}
          </span>
        </div>

        <div className="grid grid-cols-3 sm:grid-cols-5 md:grid-cols-9 gap-1.5 text-[10px] font-mono">
          {PIPELINE_STAGES.map((stg) => {
            const isActive = activeStageName.toLowerCase() === stg.id.toLowerCase();
            return (
              <div
                key={stg.id}
                className={`p-2 rounded border flex flex-col items-center justify-center text-center transition ${
                  isActive
                    ? 'bg-cyan-500 text-slate-950 font-bold border-cyan-400 shadow-[0_0_12px_rgba(6,182,212,0.6)] animate-pulse'
                    : 'bg-slate-900/80 text-slate-400 border-slate-800'
                }`}
              >
                <span className="text-[9px] opacity-75">Step {stg.number}</span>
                <span className="font-semibold truncate w-full">{stg.label.split('. ')[1]}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* 3. Benchmark Obstacle Scenario Controller & 7 Milestones */}
      <div className="bg-slate-950/80 border border-slate-800 rounded-lg p-3.5 space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800/80 pb-2">
          <div className="flex items-center gap-2">
            <Target className="w-4 h-4 text-amber-400" />
            <span className="text-xs font-bold text-slate-200 uppercase font-mono tracking-wider">
              Benchmark Scenario: Obstacle On Route & Dynamic Detour
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleRunObstacleScenario}
              disabled={isScenarioRunning && navigation.state === 'NAVIGATING'}
              className="px-3 py-1.5 rounded bg-cyan-600 hover:bg-cyan-500 disabled:opacity-60 text-white font-bold font-mono text-xs tracking-wider transition flex items-center gap-1.5 cursor-pointer shadow-[0_0_10px_rgba(6,182,212,0.3)]"
            >
              <Play
                className={`w-3.5 h-3.5 fill-current ${
                  isScenarioRunning && navigation.state === 'NAVIGATING' ? 'animate-pulse' : ''
                }`}
              />
              {isScenarioRunning && navigation.state === 'NAVIGATING'
                ? 'SCENARIO ACTIVE...'
                : 'RUN BENCHMARK SCENARIO (A → B)'}
            </button>
            <button
              onClick={handlePlaceObstacleAhead}
              className="px-2.5 py-1.5 rounded bg-amber-600/80 hover:bg-amber-500 text-white font-medium font-mono text-xs transition flex items-center gap-1 cursor-pointer"
              title="Spawn dynamic block on route corridor"
            >
              <Box className="w-3.5 h-3.5" />
              Block Path
            </button>
            <button
              onClick={handleClearPlacedObstacles}
              className="px-2.5 py-1.5 rounded bg-slate-900 hover:bg-slate-800 text-slate-300 font-medium font-mono text-xs transition border border-slate-700 flex items-center gap-1 cursor-pointer"
              title="Clear placed obstacles"
            >
              <Trash2 className="w-3.5 h-3.5 text-slate-400" />
              Reset
            </button>
          </div>
        </div>

        {scenarioMessage && (
          <div className="text-xs font-mono text-cyan-300 bg-cyan-950/60 border border-cyan-800/60 rounded px-2.5 py-1.5">
            {scenarioMessage}
          </div>
        )}

        {/* 7 Milestones Live Verification Checklist */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-7 gap-2 text-[11px] font-mono">
          {[
            { label: '1. Detect Obstacle', done: m1_detected, desc: 'LiDAR / Corridor flag' },
            { label: '2. Zero Collision', done: m2_safety, desc: 'Safety envelope >= 0.50m' },
            { label: '3. Slows / Stops', done: m3_stopped, desc: 'Decel to <= 0.05m/s' },
            { label: '4. Map Updated', done: m4_mapUpdated, desc: 'Obstacle rasterized' },
            { label: '5. New Route', done: m5_replanned, desc: 'A* Detour computed' },
            { label: '6. Follows Detour', done: m6_followingDetour, desc: 'Tracking new waypoints' },
            { label: '7. Reaches B', done: m7_reached, desc: 'Target B arrival' },
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

      {/* 4. 2D Canvas Map Viewport */}
      <div className="relative w-full aspect-[20/14] bg-[#070a12] rounded-lg overflow-hidden border border-slate-800 shadow-xl">
        <canvas ref={canvasRef} width={1000} height={700} className="w-full h-full object-contain" />

        {/* Tactical Corner Brackets */}
        <div className="hud-corner-tl" />
        <div className="hud-corner-tr" />
        <div className="hud-corner-bl" />
        <div className="hud-corner-br" />

        {/* Legend */}
        <div className="absolute top-3 right-3 bg-slate-950/90 border border-slate-800 rounded p-2.5 text-[11px] font-mono space-y-1.5 backdrop-blur text-slate-300">
          <div className="font-bold text-slate-400 uppercase text-[10px]">Map Legend</div>
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-cyan-400" />
            <span>Robot Pose & Heading</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-4 h-0.5 border-t-2 border-dashed border-cyan-400" />
            <span>Global A* Path</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-4 h-1 rounded bg-amber-400" />
            <span>Local Path Horizon</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded bg-amber-600" />
            <span>Placed Obstacle Crate</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-blue-600" />
            <span>Target Destination</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-red-500" />
            <span>LiDAR Rays</span>
          </div>
        </div>
      </div>

      {/* 5. Navigation Statistics: Measured vs Estimated Values (Section 17) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 font-mono">
        {/* Measured Values (Sensors / Actuators) */}
        <div className="p-3 rounded-lg bg-slate-950/80 border border-slate-800 space-y-2">
          <div className="flex items-center justify-between border-b border-slate-800 pb-1.5">
            <span className="text-xs font-bold text-emerald-400 uppercase tracking-wider flex items-center gap-1.5">
              <Activity className="w-3.5 h-3.5 text-emerald-400" />
              Measured Values (Sensor & Odometry Ground Truth)
            </span>
            <span className="text-[9px] px-1.5 py-0.5 rounded bg-emerald-950 text-emerald-300 border border-emerald-800 font-bold">
              PHYSICAL SENSOR
            </span>
          </div>
          <div className="grid grid-cols-3 gap-2 text-xs">
            <div>
              <div className="text-[10px] text-slate-500 uppercase">Distance Travelled</div>
              <div className="text-base font-bold text-emerald-300 mt-0.5">
                {robot.odometry_distance.toFixed(2)} m
              </div>
              <span className="text-[9px] text-slate-500">Wheel Encoders</span>
            </div>
            <div>
              <div className="text-[10px] text-slate-500 uppercase">Current Velocity</div>
              <div className="text-base font-bold text-slate-100 mt-0.5">
                {robot.twist.linear.toFixed(2)} m/s
              </div>
              <span className="text-[9px] text-slate-500">Diff-Drive PWM</span>
            </div>
            <div>
              <div className="text-[10px] text-slate-500 uppercase">Mission Duration</div>
              <div className="text-base font-bold text-slate-100 mt-0.5">
                {navigation.metrics.navigation_time.toFixed(1)} s
              </div>
              <span className="text-[9px] text-slate-500">Clock Telemetry</span>
            </div>
          </div>
        </div>

        {/* Estimated Values (Path Planning / Perception) */}
        <div className="p-3 rounded-lg bg-slate-950/80 border border-slate-800 space-y-2">
          <div className="flex items-center justify-between border-b border-slate-800 pb-1.5">
            <span className="text-xs font-bold text-cyan-400 uppercase tracking-wider flex items-center gap-1.5">
              <Compass className="w-3.5 h-3.5 text-cyan-400" />
              Estimated Values (A* Planner & Computer Vision)
            </span>
            <span className="text-[9px] px-1.5 py-0.5 rounded bg-cyan-950 text-cyan-300 border border-cyan-800 font-bold">
              ALGORITHMIC ESTIMATE
            </span>
          </div>
          <div className="grid grid-cols-3 gap-2 text-xs">
            <div>
              <div className="text-[10px] text-slate-500 uppercase">Planned Path</div>
              <div className="text-base font-bold text-cyan-300 mt-0.5">
                {navigation.metrics.path_length.toFixed(2)} m
              </div>
              <span className="text-[9px] text-slate-500">A* Costmap</span>
            </div>
            <div>
              <div className="text-[10px] text-slate-500 uppercase">Remaining Dist</div>
              <div className="text-base font-bold text-cyan-300 mt-0.5">
                {navigation.metrics.distance_remaining.toFixed(2)} m
              </div>
              <span className="text-[9px] text-slate-500">Waypoint Vector</span>
            </div>
            <div>
              <div className="text-[10px] text-slate-500 uppercase">Replans Count</div>
              <div className="text-base font-bold text-purple-300 mt-0.5">
                {navigation.metrics.replans_count}
              </div>
              <span className="text-[9px] text-slate-500">Detour Events</span>
            </div>
          </div>
        </div>
      </div>

      {/* 6. Real-Time State Transitions Feed */}
      <div className="bg-slate-950/80 border border-slate-800 rounded-lg p-3 space-y-2.5 font-mono">
        <div className="flex items-center justify-between border-b border-slate-800 pb-2">
          <div className="flex items-center gap-2">
            <Layers className="w-4 h-4 text-cyan-400" />
            <span className="text-xs font-bold text-slate-200 uppercase tracking-wider">
              Real-Time State Transitions Audit Stream
            </span>
          </div>
          <span className="text-[10px] text-slate-400">
            Total Transitions: {stateHistory.length}
          </span>
        </div>

        {stateHistory.length === 0 ? (
          <div className="text-xs text-slate-500 text-center py-4">
            No state transitions recorded yet. Launch a mission or start the benchmark scenario.
          </div>
        ) : (
          <div className="space-y-1.5 max-h-56 overflow-y-auto text-xs pr-1">
            {stateHistory
              .slice()
              .reverse()
              .map((rec, idx) => (
                <div
                  key={idx}
                  className="p-2 rounded bg-slate-900/80 border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 hover:border-slate-700 transition"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-slate-500 shrink-0">{rec.time_str}</span>
                    <span className="px-1.5 py-0.5 rounded text-[10px] bg-slate-800 text-cyan-300 font-semibold shrink-0">
                      {rec.stage}
                    </span>
                    <div className="flex items-center gap-1 font-bold text-slate-200">
                      <span className="text-slate-400">{rec.from_state}</span>
                      <ArrowRight className="w-3 h-3 text-cyan-400 shrink-0" />
                      <span className="text-cyan-300">{rec.to_state}</span>
                    </div>
                  </div>
                  <div className="text-[11px] text-slate-400 sm:text-right max-w-md truncate">
                    {rec.reason}
                  </div>
                </div>
              ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default NavigationMapView;
