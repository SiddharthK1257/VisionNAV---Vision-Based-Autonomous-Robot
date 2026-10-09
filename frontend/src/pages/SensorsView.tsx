import React from 'react';
import {
  Activity,
  Radio,
  Camera,
  Compass,
  Zap,
  Battery,
  ShieldCheck,
  CheckCircle,
  Gauge,
  Cpu,
} from 'lucide-react';
import { RobotState, LiDARHit } from '../types/robotics';

interface SensorsViewProps {
  robot: RobotState;
  lidarRays: LiDARHit[];
  nearestObstacle: number;
}

export const SensorsView: React.FC<SensorsViewProps> = ({
  robot,
  lidarRays,
  nearestObstacle,
}) => {
  const headingDeg = (robot.pose.theta * 180) / Math.PI;

  return (
    <div className="h-full flex flex-col gap-3.5 p-4 bg-[#060911] overflow-y-auto font-sans">
      {/* 1. Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800/80 pb-3">
        <div>
          <h2 className="text-base font-bold text-slate-100 flex items-center gap-2 font-mono">
            <Activity className="w-5 h-5 text-cyan-400" />
            Sensor Array & Hardware Diagnostics
          </h2>
          <p className="text-xs text-slate-400">
            Real-time status of LiDAR, RGB perspective camera, IMU gyroscopes, wheel encoders, and battery management system.
          </p>
        </div>
        <div className="flex items-center gap-2 font-mono text-xs">
          <span className="px-2.5 py-1 rounded bg-emerald-950/80 border border-emerald-800 text-emerald-300 flex items-center gap-1.5">
            <CheckCircle className="w-3.5 h-3.5 text-emerald-400" />
            SYSTEM HEALTH: {robot.sensor_health}
          </span>
        </div>
      </div>

      {/* 2. Grid of 4 Sensor Subsystems */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
        {/* 1. 360° LiDAR Scanner */}
        <div className="bg-slate-950/80 border border-slate-800 rounded-lg p-3.5 space-y-3 font-mono">
          <div className="flex items-center justify-between border-b border-slate-800 pb-2">
            <div className="flex items-center gap-2 text-xs font-bold text-cyan-400 uppercase">
              <Radio className="w-4 h-4 text-cyan-400" />
              <span>360° LiDAR Sensor Array</span>
            </div>
            <span className="text-[10px] text-emerald-400 font-bold px-1.5 py-0.5 rounded bg-emerald-950/60 border border-emerald-800">
              ONLINE (20 Hz)
            </span>
          </div>

          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="p-2.5 rounded bg-slate-900/80 border border-slate-800">
              <div className="text-[9px] text-slate-500 uppercase">POINTS SCANNED</div>
              <div className="text-base font-bold text-slate-100 mt-1">72 Rays / Rev</div>
            </div>
            <div className="p-2.5 rounded bg-slate-900/80 border border-slate-800">
              <div className="text-[9px] text-slate-500 uppercase">MAX SCAN RANGE</div>
              <div className="text-base font-bold text-slate-100 mt-1">8.00 m</div>
            </div>
            <div className="p-2.5 rounded bg-slate-900/80 border border-slate-800">
              <div className="text-[9px] text-slate-500 uppercase">NEAREST OBSTACLE</div>
              <div
                className={`text-base font-bold mt-1 ${
                  nearestObstacle < 0.8 ? 'text-amber-400 animate-pulse' : 'text-cyan-300'
                }`}
              >
                {nearestObstacle.toFixed(2)} m
              </div>
            </div>
            <div className="p-2.5 rounded bg-slate-900/80 border border-slate-800">
              <div className="text-[9px] text-slate-500 uppercase">NOISE MODEL</div>
              <div className="text-base font-bold text-slate-100 mt-1">Gaussian (σ=0.01)</div>
            </div>
          </div>
        </div>

        {/* 2. RGB Front Camera */}
        <div className="bg-slate-950/80 border border-slate-800 rounded-lg p-3.5 space-y-3 font-mono">
          <div className="flex items-center justify-between border-b border-slate-800 pb-2">
            <div className="flex items-center gap-2 text-xs font-bold text-emerald-400 uppercase">
              <Camera className="w-4 h-4 text-emerald-400" />
              <span>Front RGB AI Camera</span>
            </div>
            <span className="text-[10px] text-emerald-400 font-bold px-1.5 py-0.5 rounded bg-emerald-950/60 border border-emerald-800">
              STREAMING
            </span>
          </div>

          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="p-2.5 rounded bg-slate-900/80 border border-slate-800">
              <div className="text-[9px] text-slate-500 uppercase">FRAME RATE</div>
              <div className="text-base font-bold text-slate-100 mt-1">20 FPS</div>
            </div>
            <div className="p-2.5 rounded bg-slate-900/80 border border-slate-800">
              <div className="text-[9px] text-slate-500 uppercase">FIELD OF VIEW</div>
              <div className="text-base font-bold text-slate-100 mt-1">80° Horizontal</div>
            </div>
            <div className="p-2.5 rounded bg-slate-900/80 border border-slate-800">
              <div className="text-[9px] text-slate-500 uppercase">PERCEPTION ENGINE</div>
              <div className="text-base font-bold text-cyan-300 mt-1">YOLOv8 + MOT</div>
            </div>
            <div className="p-2.5 rounded bg-slate-900/80 border border-slate-800">
              <div className="text-[9px] text-slate-500 uppercase">OPTICAL MODEL</div>
              <div className="text-base font-bold text-slate-100 mt-1">Pinhole Camera</div>
            </div>
          </div>
        </div>

        {/* 3. IMU (Inertial Measurement Unit) */}
        <div className="bg-slate-950/80 border border-slate-800 rounded-lg p-3.5 space-y-3 font-mono">
          <div className="flex items-center justify-between border-b border-slate-800 pb-2">
            <div className="flex items-center gap-2 text-xs font-bold text-cyan-400 uppercase">
              <Compass className="w-4 h-4 text-cyan-400" />
              <span>Simulated 6-DOF IMU</span>
            </div>
            <span className="text-[10px] text-slate-400 font-bold px-1.5 py-0.5 rounded bg-slate-900 border border-slate-800">
              CALIBRATED
            </span>
          </div>

          <div className="grid grid-cols-3 gap-2 text-xs">
            <div className="p-2.5 rounded bg-slate-900/80 border border-slate-800">
              <div className="text-[9px] text-slate-500 uppercase">YAW HEADING</div>
              <div className="text-sm font-bold text-slate-100 mt-1">
                {headingDeg.toFixed(1)}°
              </div>
            </div>
            <div className="p-2.5 rounded bg-slate-900/80 border border-slate-800">
              <div className="text-[9px] text-slate-500 uppercase">ANGULAR VEL</div>
              <div className="text-sm font-bold text-slate-100 mt-1">
                {robot.twist.angular.toFixed(2)} rad/s
              </div>
            </div>
            <div className="p-2.5 rounded bg-slate-900/80 border border-slate-800">
              <div className="text-[9px] text-slate-500 uppercase">GRAVITY (AZ)</div>
              <div className="text-sm font-bold text-slate-100 mt-1">9.81 m/s²</div>
            </div>
          </div>
        </div>

        {/* 4. Odometry & Power System */}
        <div className="bg-slate-950/80 border border-slate-800 rounded-lg p-3.5 space-y-3 font-mono">
          <div className="flex items-center justify-between border-b border-slate-800 pb-2">
            <div className="flex items-center gap-2 text-xs font-bold text-emerald-400 uppercase">
              <Zap className="w-4 h-4 text-emerald-400" />
              <span>Odometry & Power System</span>
            </div>
            <span className="text-[10px] text-emerald-400 font-bold px-1.5 py-0.5 rounded bg-emerald-950/60 border border-emerald-800">
              NOMINAL
            </span>
          </div>

          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="p-2.5 rounded bg-slate-900/80 border border-slate-800">
              <div className="text-[9px] text-slate-500 uppercase">CUMULATIVE TRAVEL</div>
              <div className="text-base font-bold text-cyan-300 mt-1">
                {robot.odometry_distance.toFixed(2)} m
              </div>
            </div>
            <div className="p-2.5 rounded bg-slate-900/80 border border-slate-800">
              <div className="text-[9px] text-slate-500 uppercase">BATTERY PACK</div>
              <div className="text-base font-bold text-slate-100 mt-1">
                {robot.battery.voltage.toFixed(1)} V (24V pack)
              </div>
            </div>
            <div className="p-2.5 rounded bg-slate-900/80 border border-slate-800">
              <div className="text-[9px] text-slate-500 uppercase">LEFT WHEEL VEL</div>
              <div className="text-sm font-bold text-slate-100 mt-1">
                {robot.wheels.left.toFixed(2)} m/s
              </div>
            </div>
            <div className="p-2.5 rounded bg-slate-900/80 border border-slate-800">
              <div className="text-[9px] text-slate-500 uppercase">RIGHT WHEEL VEL</div>
              <div className="text-sm font-bold text-slate-100 mt-1">
                {robot.wheels.right.toFixed(2)} m/s
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default SensorsView;
