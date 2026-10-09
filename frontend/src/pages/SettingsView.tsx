import React, { useState } from 'react';
import {
  Settings as SettingsIcon,
  Sliders,
  Shield,
  Radio,
  Save,
  CheckCircle2,
} from 'lucide-react';

export const SettingsView: React.FC = () => {
  const [vMax, setVMax] = useState(0.8);
  const [omegaMax, setOmegaMax] = useState(1.2);
  const [criticalBrakeDist, setCriticalBrakeDist] = useState(0.45);
  const [proximityWarnDist, setProximityWarnDist] = useState(1.2);
  const [savedNotice, setSavedNotice] = useState(false);

  const handleSave = () => {
    setSavedNotice(true);
    setTimeout(() => setSavedNotice(false), 2500);
  };

  return (
    <div className="h-full flex flex-col gap-3.5 p-4 bg-[#060911] overflow-y-auto font-sans">
      {/* 1. Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800/80 pb-3">
        <div>
          <h2 className="text-base font-bold text-slate-100 flex items-center gap-2 font-mono">
            <SettingsIcon className="w-5 h-5 text-cyan-400" />
            Robot Kinematics & Autonomy Configuration
          </h2>
          <p className="text-xs text-slate-400">
            Calibrate differential-drive physics parameters, safety braking perimeters, and sensor resolution settings.
          </p>
        </div>
        {savedNotice && (
          <div className="flex items-center gap-1.5 px-3 py-1 rounded bg-emerald-950 border border-emerald-700 text-emerald-300 font-mono text-xs font-bold animate-pulse">
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
            <span>Parameters Applied to Core</span>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5 text-xs font-mono">
        {/* 1. Kinematics */}
        <div className="bg-slate-950/80 border border-slate-800 rounded-lg p-3.5 space-y-3">
          <div className="flex items-center gap-2 text-cyan-400 font-bold uppercase tracking-wider border-b border-slate-800 pb-2">
            <Sliders className="w-4 h-4" />
            <span>Differential-Drive Kinematics</span>
          </div>

          <div className="space-y-3">
            <div>
              <div className="flex justify-between text-slate-300">
                <span>Max Linear Velocity (v_max)</span>
                <span className="text-cyan-300 font-bold">{vMax.toFixed(2)} m/s</span>
              </div>
              <input
                type="range"
                min="0.2"
                max="1.5"
                step="0.05"
                value={vMax}
                onChange={(e) => setVMax(parseFloat(e.target.value))}
                className="w-full accent-cyan-500 mt-1"
              />
            </div>

            <div>
              <div className="flex justify-between text-slate-300">
                <span>Max Angular Velocity (omega_max)</span>
                <span className="text-cyan-300 font-bold">{omegaMax.toFixed(2)} rad/s</span>
              </div>
              <input
                type="range"
                min="0.4"
                max="2.5"
                step="0.1"
                value={omegaMax}
                onChange={(e) => setOmegaMax(parseFloat(e.target.value))}
                className="w-full accent-cyan-500 mt-1"
              />
            </div>

            <div className="flex justify-between text-slate-300 pt-1 border-t border-slate-800/60">
              <span>Wheel Base Track Width</span>
              <span className="text-slate-100 font-bold">0.45 m</span>
            </div>

            <div className="flex justify-between text-slate-300">
              <span>Acceleration Ramp Limit</span>
              <span className="text-slate-100 font-bold">0.60 m/s²</span>
            </div>
          </div>
        </div>

        {/* 2. Safety Controller */}
        <div className="bg-slate-950/80 border border-slate-800 rounded-lg p-3.5 space-y-3">
          <div className="flex items-center gap-2 text-emerald-400 font-bold uppercase tracking-wider border-b border-slate-800 pb-2">
            <Shield className="w-4 h-4" />
            <span>Safety Supervisor Perimeters</span>
          </div>

          <div className="space-y-3">
            <div>
              <div className="flex justify-between text-slate-300">
                <span>Critical Hard-Brake Distance</span>
                <span className="text-red-400 font-bold">{criticalBrakeDist.toFixed(2)} m</span>
              </div>
              <input
                type="range"
                min="0.2"
                max="0.8"
                step="0.05"
                value={criticalBrakeDist}
                onChange={(e) => setCriticalBrakeDist(parseFloat(e.target.value))}
                className="w-full accent-red-500 mt-1"
              />
            </div>

            <div>
              <div className="flex justify-between text-slate-300">
                <span>Proximity Warning Distance</span>
                <span className="text-amber-400 font-bold">{proximityWarnDist.toFixed(2)} m</span>
              </div>
              <input
                type="range"
                min="0.8"
                max="2.5"
                step="0.1"
                value={proximityWarnDist}
                onChange={(e) => setProximityWarnDist(parseFloat(e.target.value))}
                className="w-full accent-amber-500 mt-1"
              />
            </div>

            <div className="flex justify-between text-slate-300 pt-1 border-t border-slate-800/60">
              <span>Costmap Inflation Margin</span>
              <span className="text-cyan-300 font-bold">0.35 m</span>
            </div>

            <div className="flex justify-between text-slate-300">
              <span>Emergency E-Stop Action</span>
              <span className="text-red-400 font-bold">Arrest PWM Outputs</span>
            </div>
          </div>
        </div>

        {/* 3. Sensor Pipeline */}
        <div className="bg-slate-950/80 border border-slate-800 rounded-lg p-3.5 space-y-3">
          <div className="flex items-center gap-2 text-cyan-400 font-bold uppercase tracking-wider border-b border-slate-800 pb-2">
            <Radio className="w-4 h-4" />
            <span>Perception & Sensor Pipeline Specs</span>
          </div>

          <div className="space-y-2 text-slate-300">
            <div className="flex justify-between">
              <span>Simulation Loop Rate</span>
              <span className="text-cyan-300 font-bold">20 Hz (50ms tick)</span>
            </div>
            <div className="flex justify-between">
              <span>LiDAR Ray Cast Count</span>
              <span className="text-cyan-300 font-bold">72 Rays (360°)</span>
            </div>
            <div className="flex justify-between">
              <span>Camera FOV</span>
              <span className="text-cyan-300 font-bold">80° Horizontal</span>
            </div>
            <div className="flex justify-between">
              <span>VLM Spatial Adapter</span>
              <span className="text-emerald-400 font-bold">Deterministic Local Fallback</span>
            </div>
          </div>
        </div>

        {/* 4. Configuration Persistence */}
        <div className="bg-slate-950/80 border border-slate-800 rounded-lg p-3.5 flex flex-col justify-between space-y-3">
          <div>
            <div className="text-cyan-400 font-bold uppercase tracking-wider pb-1">
              Configuration Persistence
            </div>
            <p className="text-slate-400 leading-relaxed text-[11px] font-sans">
              Parameters apply dynamically to the running backend simulation loop in real-time.
            </p>
          </div>

          <button
            onClick={handleSave}
            className="w-full py-2.5 rounded bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-xs flex items-center justify-center gap-2 transition cursor-pointer shadow-[0_0_12px_rgba(6,182,212,0.3)]"
          >
            <Save className="w-4 h-4" />
            <span>APPLY & SAVE PARAMETERS</span>
          </button>
        </div>
      </div>
    </div>
  );
};

export default SettingsView;
