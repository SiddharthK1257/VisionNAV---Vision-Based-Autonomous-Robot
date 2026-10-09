import React from 'react';
import {
  BarChart3,
  TrendingUp,
  Percent,
  CheckCircle2,
  Award,
  Zap,
  Clock,
  Layers,
  ShieldCheck,
} from 'lucide-react';
import { AnalyticsSummary, NavigationMetrics } from '../types/robotics';

interface AnalyticsViewProps {
  analytics: AnalyticsSummary;
  metrics: NavigationMetrics;
}

export const AnalyticsView: React.FC<AnalyticsViewProps> = ({ analytics, metrics }) => {
  return (
    <div className="h-full flex flex-col gap-3.5 p-4 bg-[#060911] overflow-y-auto font-sans">
      {/* 1. Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800/80 pb-3">
        <div>
          <h2 className="text-base font-bold text-slate-100 flex items-center gap-2 font-mono">
            <BarChart3 className="w-5 h-5 text-cyan-400" />
            Autonomy Analytics & Performance Benchmarks
          </h2>
          <p className="text-xs text-slate-400">
            Real-time quantitative metrics assessing navigation efficiency, perception stability, and safety adherence.
          </p>
        </div>
      </div>

      {/* 2. Three Core Autonomy KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 font-mono">
        {/* Path Efficiency */}
        <div className="p-4 rounded-lg bg-slate-950/80 border border-slate-800 space-y-2">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span className="uppercase">Path Efficiency</span>
            <TrendingUp className="w-4 h-4 text-cyan-400" />
          </div>
          <div className="text-3xl font-extrabold text-cyan-300">
            {analytics.average_path_efficiency.toFixed(1)}%
          </div>
          <div className="w-full bg-slate-800 rounded-full h-1.5 overflow-hidden">
            <div
              className="bg-cyan-400 h-1.5 rounded-full shadow-[0_0_8px_rgba(6,182,212,0.5)]"
              style={{ width: `${analytics.average_path_efficiency}%` }}
            />
          </div>
          <p className="text-[11px] text-slate-400 pt-1 font-sans">
            Shortest feasible path / actual executed path trajectory
          </p>
        </div>

        {/* Navigation Success Rate */}
        <div className="p-4 rounded-lg bg-slate-950/80 border border-slate-800 space-y-2">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span className="uppercase">Navigation Success</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-3xl font-extrabold text-emerald-300">
            {analytics.navigation_success_rate.toFixed(1)}%
          </div>
          <div className="w-full bg-slate-800 rounded-full h-1.5 overflow-hidden">
            <div
              className="bg-emerald-400 h-1.5 rounded-full shadow-[0_0_8px_rgba(16,185,129,0.5)]"
              style={{ width: `${analytics.navigation_success_rate}%` }}
            />
          </div>
          <p className="text-[11px] text-slate-400 pt-1 font-sans">
            Completed destination arrivals / total dispatched missions
          </p>
        </div>

        {/* Perception Stability */}
        <div className="p-4 rounded-lg bg-slate-950/80 border border-slate-800 space-y-2">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span className="uppercase">Perception Stability</span>
            <Award className="w-4 h-4 text-amber-400" />
          </div>
          <div className="text-3xl font-extrabold text-amber-300">
            {analytics.perception_stability.toFixed(1)}%
          </div>
          <div className="w-full bg-slate-800 rounded-full h-1.5 overflow-hidden">
            <div
              className="bg-amber-400 h-1.5 rounded-full shadow-[0_0_8px_rgba(245,158,11,0.5)]"
              style={{ width: `${analytics.perception_stability}%` }}
            />
          </div>
          <p className="text-[11px] text-slate-400 pt-1 font-sans">
            Persistent track associations across consecutive camera frames
          </p>
        </div>
      </div>

      {/* 3. Numerical Metrics Summary Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 font-mono">
        <div className="p-3 rounded bg-slate-950/80 border border-slate-800 text-xs">
          <div className="text-slate-500 uppercase text-[10px]">Total Replans</div>
          <div className="text-lg font-bold text-slate-100 mt-1">{analytics.total_replans}</div>
        </div>

        <div className="p-3 rounded bg-slate-950/80 border border-slate-800 text-xs">
          <div className="text-slate-500 uppercase text-[10px]">Obstacle Encounters</div>
          <div className="text-lg font-bold text-amber-400 mt-1">{analytics.total_obstacle_encounters}</div>
        </div>

        <div className="p-3 rounded bg-slate-950/80 border border-slate-800 text-xs">
          <div className="text-slate-500 uppercase text-[10px]">Average Speed</div>
          <div className="text-lg font-bold text-slate-100 mt-1">{analytics.average_speed.toFixed(2)} m/s</div>
        </div>

        <div className="p-3 rounded bg-slate-950/80 border border-slate-800 text-xs">
          <div className="text-slate-500 uppercase text-[10px]">Avg Mission Time</div>
          <div className="text-lg font-bold text-slate-100 mt-1">
            {analytics.average_mission_duration.toFixed(1)} s
          </div>
        </div>
      </div>

      {/* 4. Efficiency Distribution Visualization */}
      <div className="bg-slate-950/80 border border-slate-800 rounded-lg p-4 space-y-3 font-mono">
        <div className="text-xs font-bold text-slate-300 uppercase tracking-wider">
          Mission Performance Distribution (Synthetic Profiling)
        </div>

        <div className="space-y-2 text-xs">
          {[
            { label: 'Warehouse Blue Package Retrieval', efficiency: 94, duration: '16.2s', status: 'Optimal' },
            { label: 'Charging Station Return', efficiency: 98, duration: '12.4s', status: 'Optimal' },
            { label: 'QA Inspection Table Transit', efficiency: 89, duration: '19.8s', status: 'Detoured' },
            { label: 'Executive Meeting Area Transit', efficiency: 92, duration: '15.1s', status: 'Optimal' },
          ].map((item, idx) => (
            <div key={idx} className="p-2.5 rounded bg-slate-900/60 border border-slate-800 space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="font-semibold text-slate-200">{item.label}</span>
                <span className="text-cyan-400 font-bold">{item.efficiency}% Efficiency</span>
              </div>
              <div className="w-full bg-slate-800 rounded-full h-1.5 overflow-hidden">
                <div className="bg-cyan-500 h-1.5 rounded-full" style={{ width: `${item.efficiency}%` }} />
              </div>
              <div className="flex items-center justify-between text-[10px] text-slate-400">
                <span>Duration: {item.duration}</span>
                <span className="text-emerald-400">{item.status}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default AnalyticsView;
