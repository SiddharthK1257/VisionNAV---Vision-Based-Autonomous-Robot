import React, { useState } from 'react';
import {
  ScrollText,
  Filter,
  CheckCircle2,
  AlertTriangle,
  Cpu,
  Route,
  ShieldAlert,
  Activity,
  Layers,
  Search,
  Sparkles,
  HelpCircle,
  Clock,
  Compass,
} from 'lucide-react';
import { DecisionEntry, ActionType } from '../types/robotics';

interface DecisionLogViewProps {
  decisions: DecisionEntry[];
}

export const DecisionLogView: React.FC<DecisionLogViewProps> = ({ decisions }) => {
  const [filterAction, setFilterAction] = useState<string>('ALL');
  const [searchTerm, setSearchTerm] = useState<string>('');

  const filtered = decisions.filter((d) => {
    const matchesAction = filterAction === 'ALL' || d.action === filterAction;
    const matchesSearch =
      !searchTerm ||
      d.reason.toLowerCase().includes(searchTerm.toLowerCase()) ||
      d.action.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesAction && matchesSearch;
  });

  const getBadgeStyle = (action: ActionType) => {
    switch (action) {
      case 'REPLAN':
        return 'bg-purple-950/80 text-purple-300 border-purple-700';
      case 'STOP':
        return 'bg-red-950/80 text-red-300 border-red-700';
      case 'SLOW_DOWN':
        return 'bg-amber-950/80 text-amber-300 border-amber-700';
      case 'TARGET_REACHED':
        return 'bg-blue-950/80 text-blue-300 border-blue-600';
      case 'FOLLOW_PATH':
      case 'MOVE_FORWARD':
        return 'bg-emerald-950/80 text-emerald-300 border-emerald-700';
      case 'AVOID':
        return 'bg-orange-950/80 text-orange-300 border-orange-700';
      default:
        return 'bg-slate-900 text-slate-300 border-slate-700';
    }
  };

  const getActionCount = (action: string) => {
    if (action === 'ALL') return decisions.length;
    return decisions.filter((d) => d.action === action).length;
  };

  // Helper to derive Section 18 explainable facets from real decision entries
  const getExplainableFacets = (entry: DecisionEntry) => {
    const act = entry.action;
    const dist = entry.context?.nearest_dist;
    const spd = entry.context?.speed;

    let whatHappened = entry.reason;
    let dataTrigger = 'Nominal sensor telemetry (LiDAR & Odometry)';
    let actionTaken = `Commanded velocity ${spd !== undefined ? spd.toFixed(2) + ' m/s' : '0.45 m/s'}`;
    let whyChosen = 'Trajectory tracking along planned A* waypoints with safety distance maintained.';

    if (act === 'STOP') {
      whatHappened = 'Robot brought to emergency standstill before immediate obstacle.';
      dataTrigger = `Obstacle detected at ${dist !== undefined ? dist.toFixed(2) + 'm' : '< 0.45m'} (critical safety boundary breach).`;
      actionTaken = 'Actuator velocity clamped to 0.0 m/s; emergency stop latched if needed.';
      whyChosen = 'Rule-based Safety Controller Rule #3: Collision prevention hard brake.';
    } else if (act === 'SLOW_DOWN') {
      whatHappened = 'Robot linear speed throttled to provide additional reaction distance.';
      dataTrigger = `Proximity alert at ${dist !== undefined ? dist.toFixed(2) + 'm' : '< 1.20m'} in forward corridor.`;
      actionTaken = `Speed throttled proportionally to ${spd !== undefined ? spd.toFixed(2) + ' m/s' : '0.20 m/s'}.`;
      whyChosen = 'Warning distance threshold breached; decelerating to maintain stopping distance.';
    } else if (act === 'REPLAN') {
      whatHappened = 'Dynamic corridor conflict detected; online A* replan executed.';
      dataTrigger = 'Static or dynamic obstacle intersecting remaining trajectory waypoints.';
      actionTaken = 'Local costmap updated with obstacle footprint; alternative detour route computed.';
      whyChosen = 'Original path corridor is non-traversable; alternative collision-free path found.';
    } else if (act === 'TARGET_REACHED') {
      whatHappened = 'Autonomous navigation completed at destination target.';
      dataTrigger = 'Distance to destination < 0.50m arrival tolerance.';
      actionTaken = 'Wheel velocities set to 0; mission state transitioned to TARGET_REACHED.';
      whyChosen = 'Objective accomplished within geometric tolerance envelope.';
    }

    return { whatHappened, dataTrigger, actionTaken, whyChosen };
  };

  return (
    <div className="h-full flex flex-col gap-3.5 p-4 bg-[#060911] overflow-y-auto font-sans select-none">
      {/* 1. Header with Filters & Search */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800/80 pb-3">
        <div>
          <h2 className="text-base font-bold text-slate-100 flex items-center gap-2 font-mono">
            <ScrollText className="w-5 h-5 text-cyan-400" />
            Explainable Autonomous Decision Stream
          </h2>
          <p className="text-xs text-slate-400">
            Real-time audit log with explainable rationale: What Happened ➔ Trigger Data ➔ Action Taken ➔ Rationale
          </p>
        </div>

        {/* Search input */}
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-2.5" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search decisions..."
              className="pl-8 pr-3 py-1.5 rounded bg-slate-900 border border-slate-700 text-xs font-mono text-slate-200 placeholder-slate-500 outline-none focus:border-cyan-500"
            />
          </div>
        </div>
      </div>

      {/* Filter Action Badges */}
      <div className="flex flex-wrap items-center gap-1.5 text-xs font-mono">
        <Filter className="w-3.5 h-3.5 text-slate-500 mr-1" />
        {['ALL', 'REPLAN', 'STOP', 'SLOW_DOWN', 'FOLLOW_PATH', 'TARGET_REACHED'].map((filter) => {
          const count = getActionCount(filter);
          return (
            <button
              key={filter}
              onClick={() => setFilterAction(filter)}
              className={`px-2 py-1 rounded text-[11px] transition cursor-pointer border flex items-center gap-1 ${
                filterAction === filter
                  ? 'bg-cyan-950 border-cyan-600 text-cyan-300 font-bold shadow-[0_0_8px_rgba(6,182,212,0.2)]'
                  : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
              }`}
            >
              <span>{filter.replace(/_/g, ' ')}</span>
              <span className="text-[9px] px-1 rounded bg-slate-950/80 text-slate-400">
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* 2. Decision Timeline Stream */}
      <div className="space-y-3">
        {filtered.length === 0 ? (
          <div className="p-8 text-center bg-slate-950/80 border border-slate-800 rounded-lg text-slate-500 text-xs font-mono">
            No decision events recorded matching current filter.
          </div>
        ) : (
          filtered.map((entry, idx) => {
            const { whatHappened, dataTrigger, actionTaken, whyChosen } = getExplainableFacets(entry);

            return (
              <div
                key={entry.id || idx}
                className={`bg-slate-950/85 border rounded-xl p-3.5 space-y-2.5 text-xs font-mono transition ${
                  idx === 0
                    ? 'border-cyan-800/90 shadow-[0_0_15px_rgba(6,182,212,0.15)]'
                    : 'border-slate-800/80 hover:border-slate-700'
                }`}
              >
                {/* Top Row: Timestamp, Action Badge, Confidence */}
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800/70 pb-2">
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 rounded bg-slate-900 border border-slate-800 text-slate-400 text-[11px] font-semibold">
                      {entry.timestamp}
                    </span>
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-bold border uppercase tracking-wider ${getBadgeStyle(
                        entry.action
                      )}`}
                    >
                      {entry.action.replace(/_/g, ' ')}
                    </span>
                    <span className="text-[11px] text-slate-400">
                      Confidence: {(entry.confidence * 100).toFixed(0)}%
                    </span>
                    {idx === 0 && (
                      <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-cyan-950 text-cyan-300 border border-cyan-800">
                        LATEST DECISION
                      </span>
                    )}
                  </div>

                  {entry.context && (
                    <div className="flex items-center gap-3 text-[11px] text-slate-400">
                      {entry.context.nearest_dist !== undefined && (
                        <span>Obstacle: <strong>{entry.context.nearest_dist.toFixed(2)}m</strong></span>
                      )}
                      {entry.context.speed !== undefined && (
                        <span>Speed: <strong>{entry.context.speed.toFixed(2)} m/s</strong></span>
                      )}
                    </div>
                  )}
                </div>

                {/* 4-Point Explainable Rationale Cards (Section 18) */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-2 font-sans text-xs">
                  {/* 1. What Happened */}
                  <div className="p-2.5 rounded bg-slate-900/60 border border-slate-800 space-y-1">
                    <div className="text-[10px] text-slate-400 font-mono font-bold uppercase tracking-wider">
                      1. WHAT HAPPENED
                    </div>
                    <p className="text-slate-200 leading-relaxed text-[11px]">
                      {whatHappened}
                    </p>
                  </div>

                  {/* 2. Trigger Data */}
                  <div className="p-2.5 rounded bg-slate-900/60 border border-slate-800 space-y-1">
                    <div className="text-[10px] text-cyan-400 font-mono font-bold uppercase tracking-wider">
                      2. DATA TRIGGER
                    </div>
                    <p className="text-slate-200 leading-relaxed text-[11px]">
                      {dataTrigger}
                    </p>
                  </div>

                  {/* 3. Action Taken */}
                  <div className="p-2.5 rounded bg-slate-900/60 border border-slate-800 space-y-1">
                    <div className="text-[10px] text-amber-400 font-mono font-bold uppercase tracking-wider">
                      3. ACTION TAKEN
                    </div>
                    <p className="text-slate-200 leading-relaxed text-[11px]">
                      {actionTaken}
                    </p>
                  </div>

                  {/* 4. Why Chosen */}
                  <div className="p-2.5 rounded bg-slate-900/60 border border-slate-800 space-y-1">
                    <div className="text-[10px] text-emerald-400 font-mono font-bold uppercase tracking-wider">
                      4. WHY CHOSEN
                    </div>
                    <p className="text-slate-200 leading-relaxed text-[11px]">
                      {whyChosen}
                    </p>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};

export default DecisionLogView;
