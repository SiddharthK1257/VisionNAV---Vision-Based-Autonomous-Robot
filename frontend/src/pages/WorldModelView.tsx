import React from 'react';
import { Database, Filter, Search, Tag, CheckCircle2, Layers } from 'lucide-react';
import { TrackedObject, WorldState } from '../types/robotics';

interface WorldModelViewProps {
  worldState: WorldState | null;
  trackedObjects: TrackedObject[];
}

export const WorldModelView: React.FC<WorldModelViewProps> = ({
  worldState,
  trackedObjects,
}) => {
  return (
    <div className="h-full flex flex-col gap-3.5 p-4 bg-[#060911] overflow-y-auto font-sans">
      {/* 1. Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800/80 pb-3">
        <div>
          <h2 className="text-base font-bold text-slate-100 flex items-center gap-2 font-mono">
            <Database className="w-5 h-5 text-cyan-400" />
            World Model & Object Tracking State
          </h2>
          <p className="text-xs text-slate-400">
            Continuously maintained spatial knowledge base with persistent tracking IDs, velocities, and classification.
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs font-mono">
          <span className="px-2.5 py-1 rounded bg-slate-900 border border-slate-700 text-slate-300">
            Active Tracks: {trackedObjects.length}
          </span>
          <span className="px-2.5 py-1 rounded bg-cyan-950 border border-cyan-800 text-cyan-300">
            Static Entities: {worldState?.static_obstacles.length || 0}
          </span>
        </div>
      </div>

      {/* 2. Main Tracked Objects Table */}
      <div className="bg-slate-950/80 border border-slate-800 rounded-lg overflow-hidden shadow-xl">
        <div className="px-3.5 py-2.5 bg-slate-900/90 border-b border-slate-800 flex items-center justify-between font-mono">
          <span className="text-xs font-bold text-cyan-400 uppercase tracking-wider">
            Live Perception Tracking Register
          </span>
          <span className="text-[11px] text-slate-400">Updates @ 20 Hz</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs font-mono">
            <thead className="bg-slate-900/40 text-slate-400 border-b border-slate-800 text-[10px] uppercase">
              <tr>
                <th className="py-2.5 px-3">Object ID</th>
                <th className="py-2.5 px-3">Class</th>
                <th className="py-2.5 px-3">Confidence</th>
                <th className="py-2.5 px-3">Distance</th>
                <th className="py-2.5 px-3">Position (X, Y)</th>
                <th className="py-2.5 px-3">Velocity (Vx, Vy)</th>
                <th className="py-2.5 px-3">Type</th>
                <th className="py-2.5 px-3">Motion Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 text-slate-200">
              {trackedObjects.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-slate-500">
                    No objects currently tracked in robot sensor range.
                  </td>
                </tr>
              ) : (
                trackedObjects.map((obj) => {
                  const isPerson = obj.class_name === 'person';
                  const isMoving =
                    obj.status === 'Moving' ||
                    Math.abs(obj.velocity[0]) > 0.05 ||
                    Math.abs(obj.velocity[1]) > 0.05;

                  return (
                    <tr key={obj.track_id} className="hover:bg-slate-900/60 transition">
                      <td className="py-2.5 px-3 font-bold text-cyan-300">{obj.track_id}</td>
                      <td className="py-2.5 px-3 capitalize font-medium text-slate-100 flex items-center gap-1.5">
                        <span
                          className={`w-2 h-2 rounded-full ${
                            isPerson ? 'bg-orange-400' : 'bg-emerald-400'
                          }`}
                        />
                        {obj.class_name}
                      </td>
                      <td className="py-2.5 px-3">
                        <span className="text-emerald-400 font-semibold">
                          {(obj.confidence * 100).toFixed(0)}%
                        </span>
                      </td>
                      <td className="py-2.5 px-3 font-semibold text-slate-200">
                        {obj.distance.toFixed(2)} m
                      </td>
                      <td className="py-2.5 px-3 text-slate-300">
                        ({obj.position[0].toFixed(2)}, {obj.position[1].toFixed(2)})
                      </td>
                      <td className="py-2.5 px-3 text-slate-400">
                        ({obj.velocity[0].toFixed(2)}, {obj.velocity[1].toFixed(2)}) m/s
                      </td>
                      <td className="py-2.5 px-3">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            obj.is_dynamic
                              ? 'bg-orange-950 text-orange-400 border border-orange-800'
                              : 'bg-slate-900 text-slate-300 border border-slate-700'
                          }`}
                        >
                          {obj.is_dynamic ? 'Dynamic' : 'Static'}
                        </span>
                      </td>
                      <td className="py-2.5 px-3">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            isMoving
                              ? 'bg-amber-950 text-amber-300 border border-amber-800 animate-pulse'
                              : 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                          }`}
                        >
                          {obj.status}
                        </span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* 3. Environment Static Features */}
      {worldState && worldState.static_obstacles && (
        <div className="bg-slate-950/80 border border-slate-800 rounded-lg p-3 space-y-2 font-mono">
          <div className="text-xs font-bold text-slate-300 uppercase tracking-wider">
            Environment Structural Features & Furniture
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
            {worldState.static_obstacles.slice(0, 8).map((obs) => (
              <div key={obs.id} className="p-2 rounded bg-slate-900/70 border border-slate-800">
                <div className="text-slate-200 font-medium truncate">{obs.name}</div>
                <div className="text-[10px] text-slate-400 flex items-center justify-between mt-1">
                  <span>Class: {obs.class_name}</span>
                  <span>
                    ({obs.x.toFixed(1)}, {obs.y.toFixed(1)})
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default WorldModelView;
