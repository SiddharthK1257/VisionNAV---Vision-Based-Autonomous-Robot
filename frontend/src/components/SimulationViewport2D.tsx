import React, { useRef, useEffect, useState, useCallback } from 'react';
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
} from '../types/robotics';
import {
  ZoomIn,
  ZoomOut,
  Maximize2,
  RotateCcw,
  Layers,
  Eye,
  Radio,
  Shield,
  Compass,
  MapPin,
  Camera,
  Boxes,
  Zap,
} from 'lucide-react';

interface SimulationViewport2DProps {
  robot: RobotState;
  navigation: NavigationStatus;
  staticObstacles: StaticObstacle[];
  dynamicObstacles: DynamicObstacle[];
  targets: TargetLocation[];
  activeTarget: string | null;
  lidarRays: LiDARHit[];
  environment: EnvironmentType;
  detections?: Detection[];
  vlmReasoning?: VLMStructuredOutput | null;
  cameraFrame?: string | null;
  depthPreview?: string | null;
  simSpeed?: number;
  onSetSimSpeed?: (speed: number) => void;
  onToggle3DView?: () => void;
}

export const SimulationViewport2D: React.FC<SimulationViewport2DProps> = ({
  robot,
  navigation,
  staticObstacles,
  dynamicObstacles,
  targets,
  activeTarget,
  lidarRays,
  environment,
  detections = [],
  cameraFrame,
  depthPreview,
  simSpeed = 1.0,
  onSetSimSpeed,
  onToggle3DView,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Viewport transforms: pan and zoom
  const [zoom, setZoom] = useState<number>(1.0);
  const [panOffset, setPanOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const isDragging = useRef<boolean>(false);
  const dragStart = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  // Overlays visibility toggles
  const [showLidar, setShowLidar] = useState<boolean>(true);
  const [showSafetyRadius, setShowSafetyRadius] = useState<boolean>(true);
  const [showCameraFov, setShowCameraFov] = useState<boolean>(true);
  const [showGrid, setShowGrid] = useState<boolean>(true);
  const [showPath, setShowPath] = useState<boolean>(true);
  const [showBreadcrumbs, setShowBreadcrumbs] = useState<boolean>(true);
  const [showPipCamera, setShowPipCamera] = useState<boolean>(true);
  const [pipMode, setPipMode] = useState<'rgb' | 'depth'>('rgb');

  // Breadcrumb trajectory history
  const breadcrumbsRef = useRef<{ x: number; y: number }[]>([]);

  // Update breadcrumbs when robot moves
  useEffect(() => {
    const last = breadcrumbsRef.current[breadcrumbsRef.current.length - 1];
    if (!last || Math.hypot(robot.pose.x - last.x, robot.pose.y - last.y) > 0.15) {
      breadcrumbsRef.current.push({ x: robot.pose.x, y: robot.pose.y });
      if (breadcrumbsRef.current.length > 200) {
        breadcrumbsRef.current.shift();
      }
    }
  }, [robot.pose.x, robot.pose.y]);

  // World dimensions
  const worldW = 20.0;
  const worldH = 14.0;

  // Canvas drawing loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;

    // Coordinate transforms
    const baseScale = Math.min(width / worldW, height / worldH) * 0.94;
    const scale = baseScale * zoom;

    const originX = (width - worldW * scale) / 2 + panOffset.x;
    const originY = (height - worldH * scale) / 2 + panOffset.y;

    const toScreenX = (wx: number) => originX + wx * scale;
    const toScreenY = (wy: number) => originY + (worldH - wy) * scale; // invert Y for robotics coords

    // 1. Clear background
    ctx.fillStyle = '#060911';
    ctx.fillRect(0, 0, width, height);

    // 2. Warehouse Floor Grid
    if (showGrid) {
      ctx.lineWidth = 1;
      // 1-meter major grid lines
      for (let x = 0; x <= worldW; x += 1.0) {
        ctx.strokeStyle = x % 5 === 0 ? 'rgba(30, 41, 59, 0.8)' : 'rgba(15, 23, 42, 0.6)';
        ctx.beginPath();
        ctx.moveTo(toScreenX(x), toScreenY(0));
        ctx.lineTo(toScreenX(x), toScreenY(worldH));
        ctx.stroke();
      }
      for (let y = 0; y <= worldH; y += 1.0) {
        ctx.strokeStyle = y % 5 === 0 ? 'rgba(30, 41, 59, 0.8)' : 'rgba(15, 23, 42, 0.6)';
        ctx.beginPath();
        ctx.moveTo(toScreenX(0), toScreenY(y));
        ctx.lineTo(toScreenX(worldW), toScreenY(y));
        ctx.stroke();
      }

      // Warehouse boundary border
      ctx.strokeStyle = 'rgba(6, 182, 212, 0.4)';
      ctx.lineWidth = 2;
      ctx.strokeRect(toScreenX(0), toScreenY(worldH), worldW * scale, worldH * scale);
    }

    // 3. Static Obstacles (Shelves, Walls, Crates, Equipment)
    staticObstacles.forEach((obs) => {
      const sx = toScreenX(obs.x);
      const sy = toScreenY(obs.y + obs.height);
      const sw = obs.width * scale;
      const sh = obs.height * scale;

      if (obs.class_name === 'wall') {
        ctx.fillStyle = '#1e293b';
        ctx.fillRect(sx, sy, sw, sh);
        ctx.strokeStyle = '#334155';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(sx, sy, sw, sh);
      } else if (obs.class_name === 'shelf') {
        // Shelf structure with rack bars
        ctx.fillStyle = '#0f172a';
        ctx.fillRect(sx, sy, sw, sh);
        ctx.strokeStyle = '#38bdf8';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(sx, sy, sw, sh);

        // Rack cross-beams
        ctx.strokeStyle = 'rgba(56, 189, 248, 0.25)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(sx, sy);
        ctx.lineTo(sx + sw, sy + sh);
        ctx.moveTo(sx, sy + sh);
        ctx.lineTo(sx + sw, sy);
        ctx.stroke();

        // Label
        ctx.fillStyle = '#94a3b8';
        ctx.font = `${Math.max(9, Math.round(10 * zoom))}px monospace`;
        ctx.fillText(obs.name, sx + 4, sy + Math.min(14, sh / 2));
      } else {
        // Crates / Obstacles
        ctx.fillStyle = '#1e293b';
        ctx.fillRect(sx, sy, sw, sh);
        ctx.strokeStyle = '#f59e0b';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(sx, sy, sw, sh);

        // Diagonal hazard stripes
        ctx.strokeStyle = 'rgba(245, 158, 11, 0.3)';
        ctx.beginPath();
        ctx.moveTo(sx, sy);
        ctx.lineTo(sx + sw, sy + sh);
        ctx.stroke();
      }
    });

    // 4. Warehouse Facilities & Zones
    // Charging Dock Station (x: 1.5, y: 1.5)
    const chargeX = toScreenX(1.5);
    const chargeY = toScreenY(1.5);
    ctx.strokeStyle = '#10b981';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 4]);
    ctx.strokeRect(chargeX - 18, chargeY - 18, 36, 36);
    ctx.setLineDash([]);
    ctx.fillStyle = 'rgba(16, 185, 129, 0.15)';
    ctx.fillRect(chargeX - 18, chargeY - 18, 36, 36);
    ctx.fillStyle = '#10b981';
    ctx.font = 'bold 9px monospace';
    ctx.fillText('⚡ CHARGE', chargeX - 22, chargeY + 28);

    // 5. Targets (Including Blue Package Objective)
    targets.forEach((tgt) => {
      const tx = toScreenX(tgt.x);
      const ty = toScreenY(tgt.y);
      const tr = tgt.radius * scale;

      const isBluePackage = tgt.attribute === 'blue' || tgt.name.toLowerCase().includes('blue');
      const isCurrentObjective = activeTarget === tgt.name || isBluePackage;

      // Outer radar pulse circle
      if (isCurrentObjective) {
        ctx.strokeStyle = 'rgba(56, 189, 248, 0.5)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(tx, ty, tr * 1.8, 0, Math.PI * 2);
        ctx.stroke();

        ctx.strokeStyle = 'rgba(56, 189, 248, 0.2)';
        ctx.beginPath();
        ctx.arc(tx, ty, tr * 2.6, 0, Math.PI * 2);
        ctx.stroke();
      }

      // Main target body
      ctx.fillStyle = isBluePackage ? '#2563eb' : '#0284c7';
      ctx.beginPath();
      ctx.arc(tx, ty, Math.max(12, tr), 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = isBluePackage ? '#60a5fa' : '#38bdf8';
      ctx.lineWidth = 2.5;
      ctx.stroke();

      // Target icon crosshair inside
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(tx - 6, ty);
      ctx.lineTo(tx + 6, ty);
      ctx.moveTo(tx, ty - 6);
      ctx.lineTo(tx, ty + 6);
      ctx.stroke();

      // Label banner
      ctx.fillStyle = isBluePackage ? '#3b82f6' : '#0284c7';
      ctx.font = 'bold 10px monospace';
      const label = tgt.name.toUpperCase();
      const txtW = ctx.measureText(label).width;
      ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
      ctx.fillRect(tx - txtW / 2 - 4, ty - tr - 20, txtW + 8, 16);
      ctx.strokeStyle = '#60a5fa';
      ctx.strokeRect(tx - txtW / 2 - 4, ty - tr - 20, txtW + 8, 16);
      ctx.fillStyle = '#ffffff';
      ctx.fillText(label, tx - txtW / 2, ty - tr - 8);
    });

    // 6. Dynamic Obstacles (Simulated Humanoid / Moving Person)
    dynamicObstacles.forEach((dyn) => {
      const dx = toScreenX(dyn.x);
      const dy = toScreenY(dyn.y);
      const dr = Math.max(10, dyn.radius * scale);

      // Patrol path waypoints
      if (dyn.waypoints && dyn.waypoints.length > 1) {
        ctx.strokeStyle = 'rgba(249, 115, 22, 0.25)';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([3, 3]);
        ctx.beginPath();
        dyn.waypoints.forEach((wp, i) => {
          const wx = toScreenX(wp[0]);
          const wy = toScreenY(wp[1]);
          if (i === 0) ctx.moveTo(wx, wy);
          else ctx.lineTo(wx, wy);
        });
        ctx.closePath();
        ctx.stroke();
        ctx.setLineDash([]);
      }

      // Person Safety Bubble
      ctx.fillStyle = 'rgba(249, 115, 22, 0.18)';
      ctx.beginPath();
      ctx.arc(dx, dy, dr * 1.5, 0, Math.PI * 2);
      ctx.fill();

      // Body (Humanoid shoulders & head)
      ctx.fillStyle = '#ea580c';
      ctx.beginPath();
      ctx.arc(dx, dy, dr, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#fdba74';
      ctx.lineWidth = 2;
      ctx.stroke();

      // Head
      ctx.fillStyle = '#fed7aa';
      ctx.beginPath();
      ctx.arc(dx, dy, dr * 0.45, 0, Math.PI * 2);
      ctx.fill();

      // Label
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 9px monospace';
      ctx.fillText(`HUMAN [${dyn.name}]`, dx - 28, dy - dr - 6);
    });

    // 7. Breadcrumbs Trajectory
    if (showBreadcrumbs && breadcrumbsRef.current.length > 1) {
      ctx.strokeStyle = 'rgba(6, 182, 212, 0.35)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      breadcrumbsRef.current.forEach((pt, i) => {
        const px = toScreenX(pt.x);
        const py = toScreenY(pt.y);
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      });
      ctx.stroke();
    }

    // 8. Planned A* Global Path & Local Trajectory
    if (showPath && navigation.global_path && navigation.global_path.waypoints) {
      const gWaypoints = navigation.global_path.waypoints;
      if (gWaypoints.length > 1) {
        ctx.strokeStyle = 'rgba(6, 182, 212, 0.7)';
        ctx.lineWidth = 2.5;
        ctx.setLineDash([6, 4]);
        ctx.beginPath();
        gWaypoints.forEach((wp, i) => {
          const wx = toScreenX(wp.x);
          const wy = toScreenY(wp.y);
          if (i === 0) ctx.moveTo(wx, wy);
          else ctx.lineTo(wx, wy);
        });
        ctx.stroke();
        ctx.setLineDash([]);

        // Waypoint nodes
        gWaypoints.forEach((wp) => {
          ctx.fillStyle = '#06b6d4';
          ctx.beginPath();
          ctx.arc(toScreenX(wp.x), toScreenY(wp.y), 3, 0, Math.PI * 2);
          ctx.fill();
        });
      }

      // Local Path Horizon (Bright solid line)
      if (navigation.local_path && navigation.local_path.waypoints) {
        const lWaypoints = navigation.local_path.waypoints;
        if (lWaypoints.length > 1) {
          ctx.strokeStyle = '#22d3ee';
          ctx.lineWidth = 3.5;
          ctx.beginPath();
          ctx.moveTo(toScreenX(robot.pose.x), toScreenY(robot.pose.y));
          lWaypoints.forEach((wp) => {
            ctx.lineTo(toScreenX(wp.x), toScreenY(wp.y));
          });
          ctx.stroke();
        }
      }
    }

    // 9. LiDAR Laser Rays & Hit Points
    if (showLidar && lidarRays && lidarRays.length > 0) {
      const rx = toScreenX(robot.pose.x);
      const ry = toScreenY(robot.pose.y);

      lidarRays.forEach((ray) => {
        const hx = toScreenX(ray.x);
        const hy = toScreenY(ray.y);

        ctx.strokeStyle = ray.hit ? 'rgba(239, 68, 68, 0.35)' : 'rgba(16, 185, 129, 0.15)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(rx, ry);
        ctx.lineTo(hx, hy);
        ctx.stroke();

        if (ray.hit) {
          ctx.fillStyle = '#ef4444';
          ctx.beginPath();
          ctx.arc(hx, hy, 2.5, 0, Math.PI * 2);
          ctx.fill();
        }
      });
    }

    // 10. Autonomous Mobile Robot (Differential-Drive Chassis)
    const rx = toScreenX(robot.pose.x);
    const ry = toScreenY(robot.pose.y);
    const robotAngle = -robot.pose.theta; // invert angle for inverted Y screen coordinates

    ctx.save();
    ctx.translate(rx, ry);
    ctx.rotate(robotAngle);

    // Safety Radius Circles
    if (showSafetyRadius) {
      // Critical Distance (0.45m Hard Brake)
      const rCrit = 0.45 * scale;
      ctx.strokeStyle = 'rgba(239, 68, 68, 0.7)';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.arc(0, 0, rCrit, 0, Math.PI * 2);
      ctx.stroke();

      // Warning Distance (1.20m Slow Down)
      const rWarn = 1.2 * scale;
      ctx.strokeStyle = 'rgba(245, 158, 11, 0.4)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(0, 0, rWarn, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // Camera Frustum Indicator
    if (showCameraFov) {
      const fovDist = 2.5 * scale;
      const fovAngle = 0.70; // ~40 degrees half-angle
      ctx.fillStyle = 'rgba(6, 182, 212, 0.10)';
      ctx.strokeStyle = 'rgba(6, 182, 212, 0.4)';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(fovDist * Math.cos(-fovAngle), fovDist * Math.sin(-fovAngle));
      ctx.arc(0, 0, fovDist, -fovAngle, fovAngle);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }

    // Robot Dimensions in Pixels
    const chassisW = Math.max(26, 0.55 * scale);
    const chassisH = Math.max(20, 0.42 * scale);

    // Side Wheel: Left Wheel (Top in screen rotated coordinates)
    const wheelW = chassisW * 0.45;
    const wheelH = Math.max(5, chassisH * 0.22);
    ctx.fillStyle = '#0f172a';
    ctx.strokeStyle = '#475569';
    ctx.lineWidth = 1.5;
    ctx.fillRect(-wheelW / 2, -chassisH / 2 - wheelH + 1, wheelW, wheelH);
    ctx.strokeRect(-wheelW / 2, -chassisH / 2 - wheelH + 1, wheelW, wheelH);

    // Side Wheel: Right Wheel (Bottom in screen rotated coordinates)
    ctx.fillRect(-wheelW / 2, chassisH / 2 - 1, wheelW, wheelH);
    ctx.strokeRect(-wheelW / 2, chassisH / 2 - 1, wheelW, wheelH);

    // Main Chassis Body (Rounded rectangle)
    ctx.fillStyle = robot.emergency_stop ? '#450a0a' : '#090d16';
    ctx.strokeStyle = robot.emergency_stop ? '#ef4444' : '#06b6d4';
    ctx.lineWidth = 2.5;

    // Chassis Box
    ctx.beginPath();
    ctx.roundRect(-chassisW / 2, -chassisH / 2, chassisW, chassisH, 6);
    ctx.fill();
    ctx.stroke();

    // Front Bumper Accent (Facing Forward +X)
    ctx.fillStyle = '#0891b2';
    ctx.fillRect(chassisW / 2 - 4, -chassisH / 2 + 3, 4, chassisH - 6);

    // Front Camera Optical Sensor
    ctx.fillStyle = '#38bdf8';
    ctx.beginPath();
    ctx.arc(chassisW / 2, 0, Math.max(3, chassisH * 0.18), 0, Math.PI * 2);
    ctx.fill();

    // Direction Heading Arrow (+X forward)
    ctx.fillStyle = '#22d3ee';
    ctx.beginPath();
    ctx.moveTo(chassisW / 2 + 10, 0);
    ctx.lineTo(chassisW / 2, -5);
    ctx.lineTo(chassisW / 2, 5);
    ctx.closePath();
    ctx.fill();

    // Top LiDAR Turret Center Puck
    ctx.fillStyle = '#1e293b';
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(0, 0, Math.max(4, chassisH * 0.22), 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.restore();

    // 11. Coordinate System & Scale Indicator (Bottom-Left)
    ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
    ctx.fillRect(10, height - 36, 175, 26);
    ctx.strokeStyle = 'rgba(51, 65, 85, 0.8)';
    ctx.strokeRect(10, height - 36, 175, 26);
    ctx.fillStyle = '#94a3b8';
    ctx.font = '10px monospace';
    ctx.fillText(`ROBOT POSE: (${robot.pose.x.toFixed(2)}, ${robot.pose.y.toFixed(2)})m`, 18, height - 20);
  }, [
    zoom,
    panOffset,
    showGrid,
    showLidar,
    showSafetyRadius,
    showCameraFov,
    showPath,
    showBreadcrumbs,
    staticObstacles,
    dynamicObstacles,
    targets,
    activeTarget,
    lidarRays,
    robot.pose.x,
    robot.pose.y,
    robot.pose.theta,
    robot.emergency_stop,
    navigation.global_path,
    navigation.local_path,
  ]);

  // Mouse pan handlers
  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    isDragging.current = true;
    dragStart.current = { x: e.clientX - panOffset.x, y: e.clientY - panOffset.y };
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDragging.current) return;
    setPanOffset({
      x: e.clientX - dragStart.current.x,
      y: e.clientY - dragStart.current.y,
    });
  };

  const handleMouseUp = () => {
    isDragging.current = false;
  };

  const handleWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const zoomFactor = e.deltaY < 0 ? 1.1 : 0.9;
    setZoom((prev) => Math.max(0.5, Math.min(3.5, prev * zoomFactor)));
  };

  const resetView = () => {
    setZoom(1.0);
    setPanOffset({ x: 0, y: 0 });
  };

  return (
    <div className="relative w-full h-full bg-[#060911] overflow-hidden select-none">
      {/* 1. Main Canvas */}
      <canvas
        ref={canvasRef}
        width={1280}
        height={760}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onWheel={handleWheel}
        className="w-full h-full object-contain cursor-grab active:cursor-grabbing"
      />

      {/* 2. Top-Left View Controls & View Mode Toggle */}
      <div className="absolute top-3 left-3 flex items-center gap-2 font-mono text-xs z-20">
        <div className="flex bg-slate-950/90 border border-slate-800 rounded-md p-1 shadow-lg backdrop-blur">
          <button
            onClick={() => setZoom((z) => Math.min(3.5, z + 0.2))}
            className="p-1.5 hover:bg-slate-800 text-slate-300 rounded transition cursor-pointer"
            title="Zoom In"
          >
            <ZoomIn className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={() => setZoom((z) => Math.max(0.5, z - 0.2))}
            className="p-1.5 hover:bg-slate-800 text-slate-300 rounded transition cursor-pointer"
            title="Zoom Out"
          >
            <ZoomOut className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={resetView}
            className="p-1.5 hover:bg-slate-800 text-slate-300 rounded transition cursor-pointer"
            title="Reset View"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* View Mode Switcher: 2D Tactical vs 3D Perspective */}
        {onToggle3DView && (
          <button
            onClick={onToggle3DView}
            className="px-2.5 py-1.5 rounded-md bg-cyan-950/80 border border-cyan-700/70 hover:bg-cyan-900/80 text-cyan-300 font-bold transition cursor-pointer flex items-center gap-1.5 shadow-lg backdrop-blur"
            title="Switch between 2D Tactical and 3D Perspective View"
          >
            <Boxes className="w-3.5 h-3.5 text-cyan-400" />
            <span>SWITCH TO 3D</span>
          </button>
        )}

        {/* Simulation Speed Selector */}
        {onSetSimSpeed && (
          <div className="flex items-center gap-1 bg-slate-950/90 border border-slate-800 rounded-md p-1 text-[11px] shadow-lg backdrop-blur">
            <span className="text-slate-500 px-1 text-[10px]">SPEED:</span>
            {[0.5, 1.0, 2.0, 4.0].map((s) => (
              <button
                key={s}
                onClick={() => onSetSimSpeed(s)}
                className={`px-1.5 py-0.5 rounded transition cursor-pointer ${
                  simSpeed === s
                    ? 'bg-cyan-950 text-cyan-300 font-bold border border-cyan-700'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                {s}x
              </button>
            ))}
          </div>
        )}
      </div>

      {/* 3. Top-Right Sensor Overlays Toolbar */}
      <div className="absolute top-3 right-3 flex items-center gap-1.5 font-mono text-xs z-20 bg-slate-950/90 border border-slate-800 rounded-md p-1 shadow-lg backdrop-blur">
        <button
          onClick={() => setShowLidar(!showLidar)}
          className={`px-2 py-1 rounded transition cursor-pointer flex items-center gap-1 ${
            showLidar ? 'bg-cyan-950/80 text-cyan-300 border border-cyan-800' : 'text-slate-500 hover:text-slate-300'
          }`}
          title="Toggle LiDAR Rays"
        >
          <Radio className="w-3 h-3" />
          <span className="text-[10px]">LiDAR</span>
        </button>
        <button
          onClick={() => setShowSafetyRadius(!showSafetyRadius)}
          className={`px-2 py-1 rounded transition cursor-pointer flex items-center gap-1 ${
            showSafetyRadius
              ? 'bg-cyan-950/80 text-cyan-300 border border-cyan-800'
              : 'text-slate-500 hover:text-slate-300'
          }`}
          title="Toggle Safety Radius Rings"
        >
          <Shield className="w-3 h-3" />
          <span className="text-[10px]">SAFETY</span>
        </button>
        <button
          onClick={() => setShowCameraFov(!showCameraFov)}
          className={`px-2 py-1 rounded transition cursor-pointer flex items-center gap-1 ${
            showCameraFov
              ? 'bg-cyan-950/80 text-cyan-300 border border-cyan-800'
              : 'text-slate-500 hover:text-slate-300'
          }`}
          title="Toggle Front Camera FOV Frustum"
        >
          <Camera className="w-3 h-3" />
          <span className="text-[10px]">FOV</span>
        </button>
        <button
          onClick={() => setShowPath(!showPath)}
          className={`px-2 py-1 rounded transition cursor-pointer flex items-center gap-1 ${
            showPath ? 'bg-cyan-950/80 text-cyan-300 border border-cyan-800' : 'text-slate-500 hover:text-slate-300'
          }`}
          title="Toggle Planned A* Trajectory"
        >
          <MapPin className="w-3 h-3" />
          <span className="text-[10px]">PATH</span>
        </button>
      </div>

      {/* 4. Bottom-Right Picture-in-Picture (PiP) Robot Camera */}
      {showPipCamera && (
        <div className="absolute bottom-3 right-3 w-56 aspect-video bg-slate-950/95 border border-slate-700/80 rounded-lg overflow-hidden shadow-2xl z-20 backdrop-blur font-mono">
          <div className="flex items-center justify-between px-2 py-1 bg-slate-900 border-b border-slate-800 text-[10px]">
            <span className="flex items-center gap-1 text-cyan-300 font-bold">
              <Camera className="w-3 h-3 text-cyan-400" />
              <span>ROBOT CAM (FORWARD)</span>
            </span>
            <div className="flex gap-1 text-[9px]">
              <button
                onClick={() => setPipMode('rgb')}
                className={`px-1 rounded ${pipMode === 'rgb' ? 'bg-cyan-950 text-cyan-300' : 'text-slate-400'}`}
              >
                RGB
              </button>
              <button
                onClick={() => setPipMode('depth')}
                className={`px-1 rounded ${pipMode === 'depth' ? 'bg-cyan-950 text-cyan-300' : 'text-slate-400'}`}
              >
                DEPTH
              </button>
            </div>
          </div>
          <div className="relative w-full h-[calc(100%-24px)] flex items-center justify-center bg-black">
            {pipMode === 'rgb' && cameraFrame ? (
              <img src={cameraFrame} alt="Camera Stream" className="w-full h-full object-cover" />
            ) : pipMode === 'depth' && depthPreview ? (
              <img src={depthPreview} alt="Depth Stream" className="w-full h-full object-cover" />
            ) : (
              <div className="text-[10px] text-slate-500 text-center p-2">
                Simulated Camera Sensor Stream
              </div>
            )}
            {detections.length > 0 && pipMode === 'rgb' && (
              <div className="absolute bottom-1 left-1 px-1.5 py-0.5 rounded bg-blue-950/90 border border-blue-500 text-[9px] text-blue-200">
                {detections[0].class_name.toUpperCase()} ({(detections[0].confidence * 100).toFixed(0)}%)
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default SimulationViewport2D;
