import React from 'react';
import {
  Sparkles,
  CheckCircle2,
  ChevronRight,
  AlertTriangle,
  Eye,
  Target,
  Route,
  Cpu,
  X,
} from 'lucide-react';
import { NavigationState } from '../types/robotics';

interface JudgeDemoBannerProps {
  active: boolean;
  navState: NavigationState;
  onDismiss: () => void;
}

export const JudgeDemoBanner: React.FC<JudgeDemoBannerProps> = ({
  active,
  navState,
  onDismiss,
}) => {
  if (!active && navState !== 'TARGET_REACHED') return null;

  const steps = [
    { id: 'PERCEIVE', label: '1. PERCEIVE', icon: <Eye className="w-3 h-3" /> },
    { id: 'UNDERSTAND', label: '2. UNDERSTAND', icon: <Target className="w-3 h-3" /> },
    { id: 'PLAN', label: '3. PLAN', icon: <Route className="w-3 h-3" /> },
    { id: 'NAVIGATE', label: '4. NAVIGATE', icon: <Route className="w-3 h-3" /> },
    { id: 'AVOID', label: '5. AVOID', icon: <AlertTriangle className="w-3 h-3" /> },
    { id: 'REPLAN', label: '6. REPLAN', icon: <Cpu className="w-3 h-3" /> },
    { id: 'ARRIVE', label: '7. ARRIVE', icon: <CheckCircle2 className="w-3 h-3" /> },
  ];

  const getStepStatus = (stepId: string) => {
    const s = String(navState);
    if (s === 'TARGET_REACHED') return 'completed';

    const stageHierarchy: Record<string, number> = {
      MISSION_RECEIVED: 1,
      TARGET_SEARCHING: 1,
      SEARCHING: 1,
      TARGET_IDENTIFIED: 2,
      TARGET_LOCALIZED: 2,
      TARGET_FOUND: 2,
      GOAL_SET: 3,
      PLANNING: 3,
      PLANNING_GLOBAL_PATH: 3,
      GLOBAL_PATH_COMPUTED: 3,
      LOCAL_PATH_GENERATED: 4,
      NAVIGATING: 4,
      OBSTACLE_DETECTED: 5,
      ROBOT_STOPPING: 5,
      ROBOT_STOPPED: 5,
      LOCAL_MAP_UPDATED: 6,
      REPLANNING: 6,
      NEW_ROUTE_CALCULATED: 6,
      TARGET_REACHED: 7,
    };

    const stepHierarchy: Record<string, number> = {
      PERCEIVE: 1,
      UNDERSTAND: 2,
      PLAN: 3,
      NAVIGATE: 4,
      AVOID: 5,
      REPLAN: 6,
      ARRIVE: 7,
    };

    const currentRank = stageHierarchy[s] || 0;
    const thisStepRank = stepHierarchy[stepId] || 0;

    if (currentRank > thisStepRank) return 'completed';
    if (currentRank === thisStepRank) return 'current';
    return 'pending';
  };

  return (
    <div className="bg-[#090e1a]/95 border-b border-cyan-800/80 px-4 py-2 flex flex-wrap items-center justify-between gap-2 select-none z-30 backdrop-blur shadow-lg font-mono">
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-1.5 px-2 py-0.5 rounded bg-cyan-950 text-cyan-300 border border-cyan-700 text-xs font-bold shadow-sm">
          <Sparkles className="w-3.5 h-3.5 text-cyan-400 status-active-pulse" />
          <span>JUDGE DEMO TIMELINE</span>
        </div>
        <span className="text-xs text-slate-300 hidden md:inline">
          Warehouse Blue Package Retrieval with Dynamic Detour Replan
        </span>
      </div>

      {/* 7-Step Horizontal Pipeline Stepper */}
      <div className="flex items-center gap-1 overflow-x-auto text-[10px]">
        {steps.map((step, idx) => {
          const status = getStepStatus(step.id);
          const isCurrent = status === 'current';
          const isCompleted = status === 'completed';

          return (
            <React.Fragment key={step.id}>
              <div
                className={`px-2 py-1 rounded flex items-center gap-1 transition ${
                  isCurrent
                    ? 'bg-cyan-500 text-slate-950 font-bold shadow-[0_0_12px_rgba(6,182,212,0.6)] animate-pulse'
                    : isCompleted
                    ? 'bg-emerald-950/80 text-emerald-300 border border-emerald-800'
                    : 'bg-slate-950 text-slate-500 border border-slate-800'
                }`}
              >
                {step.icon}
                <span>{step.label}</span>
              </div>
              {idx < steps.length - 1 && (
                <ChevronRight className="w-3 h-3 text-slate-700 shrink-0" />
              )}
            </React.Fragment>
          );
        })}

        <button
          onClick={onDismiss}
          className="ml-2 p-1 text-slate-500 hover:text-slate-300 transition cursor-pointer"
          title="Dismiss Banner"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
};

export default JudgeDemoBanner;
