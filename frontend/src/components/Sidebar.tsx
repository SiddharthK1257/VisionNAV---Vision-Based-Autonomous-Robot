import React from 'react';
import {
  LayoutDashboard,
  Eye,
  Compass,
  Database,
  Activity,
  ScrollText,
  Crosshair,
  BarChart3,
  Settings,
  Sparkles,
  ChevronLeft,
  ChevronRight,
  Shield,
} from 'lucide-react';
import { NavTab } from '../types/robotics';

export type { NavTab };

interface SidebarProps {
  currentTab: NavTab;
  onSelectTab: (tab: NavTab) => void;
  onStartDemo: () => void;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentTab,
  onSelectTab,
  onStartDemo,
  collapsed = false,
  onToggleCollapse,
}) => {
  const navItems: { id: NavTab; label: string; icon: React.ReactNode; badge?: string }[] = [
    { id: 'command_center', label: 'Command Center', icon: <LayoutDashboard className="w-4 h-4" /> },
    { id: 'live_vision', label: 'Live Vision', icon: <Eye className="w-4 h-4" />, badge: 'CV' },
    { id: 'navigation_map', label: 'Navigation Map', icon: <Compass className="w-4 h-4" /> },
    { id: 'decision_log', label: 'Decision Log', icon: <ScrollText className="w-4 h-4" /> },
    { id: 'mission_results', label: 'Mission Results', icon: <BarChart3 className="w-4 h-4" /> },
  ];

  return (
    <aside
      className={`bg-[#070a12]/95 border-r border-slate-800/80 flex flex-col justify-between p-2 select-none shrink-0 h-[calc(100vh-3.5rem)] transition-all duration-300 font-sans ${
        collapsed ? 'w-14 items-center' : 'w-56'
      }`}
    >
      <div className="space-y-1 w-full">
        {/* Rail Header with Collapse Toggle */}
        <div className="flex items-center justify-between px-2 py-1.5 border-b border-slate-800/80 mb-2">
          {!collapsed && (
            <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest font-mono">
              SYSTEM MODULES
            </div>
          )}
          {onToggleCollapse && (
            <button
              onClick={onToggleCollapse}
              className="p-1 rounded bg-slate-900 border border-slate-800 text-slate-400 hover:text-white transition cursor-pointer mx-auto"
              title={collapsed ? 'Expand Sidebar' : 'Collapse Sidebar'}
            >
              {collapsed ? <ChevronRight className="w-3.5 h-3.5" /> : <ChevronLeft className="w-3.5 h-3.5" />}
            </button>
          )}
        </div>

        {/* Navigation Items */}
        {navItems.map((item) => {
          const isActive = currentTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onSelectTab(item.id)}
              className={`w-full flex items-center justify-between px-2.5 py-2 rounded-md text-xs font-mono transition cursor-pointer ${
                isActive
                  ? 'bg-cyan-950/80 text-cyan-300 border border-cyan-700/60 shadow-[0_0_12px_rgba(6,182,212,0.2)] font-bold'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/80 border border-transparent'
              } ${collapsed ? 'justify-center px-1' : ''}`}
              title={collapsed ? item.label : undefined}
            >
              <div className="flex items-center gap-2.5">
                <span className={isActive ? 'text-cyan-400' : 'text-slate-400'}>{item.icon}</span>
                {!collapsed && <span className="truncate">{item.label}</span>}
              </div>
              {!collapsed && item.badge && (
                <span className="px-1.5 py-0.2 rounded text-[9px] font-mono bg-cyan-900/60 text-cyan-300 border border-cyan-700/50">
                  {item.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Bottom Judge Demo Trigger Card (Compact if collapsed) */}
      {!collapsed ? (
        <div className="p-3 rounded-lg bg-gradient-to-br from-cyan-950/40 to-slate-900 border border-cyan-800/50 space-y-2">
          <div className="flex items-center gap-1.5 text-xs font-bold text-cyan-300 font-mono">
            <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
            <span>Judge Demo Mode</span>
          </div>
          <p className="text-[11px] text-slate-400 leading-tight">
            Executes autonomous warehouse mission with dynamic obstacle replanning.
          </p>
          <button
            onClick={onStartDemo}
            className="w-full py-1.5 rounded bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold font-mono text-xs transition cursor-pointer shadow-[0_0_14px_rgba(6,182,212,0.35)]"
          >
            START DEMO
          </button>
        </div>
      ) : (
        <button
          onClick={onStartDemo}
          className="p-2.5 rounded bg-cyan-500 hover:bg-cyan-400 text-slate-950 transition cursor-pointer shadow-[0_0_12px_rgba(6,182,212,0.3)] mb-2"
          title="Start Judge Demo"
        >
          <Sparkles className="w-4 h-4" />
        </button>
      )}
    </aside>
  );
};

export default Sidebar;
