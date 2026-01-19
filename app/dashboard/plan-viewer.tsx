"use client";

import { useState, useMemo } from "react";
import { Plan, PlanItem, Goal } from "@prisma/client";
import { formatDistance, formatPace, metersToUnit, DistanceUnit } from "@/lib/units";

interface PlanViewerProps {
  plan: Plan & { items: PlanItem[] };
  goal: Goal | null;
  distanceUnit: DistanceUnit;
  weeklyMileageProgression?: Array<{ week: number; mileageKm: number }>;
}

export default function PlanViewer({ plan, goal, distanceUnit, weeklyMileageProgression }: PlanViewerProps) {
  const [currentWeek, setCurrentWeek] = useState(0);
  const [showGraph, setShowGraph] = useState(false);

  // Group plan items by week (must be called before early return)
  const weeks = useMemo(() => {
    // SAFETY: Return empty array if no plan/items
    if (!plan || !plan.items || plan.items.length === 0) {
      return [];
    }
    
    const planStart = new Date(plan.startDate);
    planStart.setHours(0, 0, 0, 0);
    
    const weekGroups: PlanItem[][] = [];
    const sortedItems = [...plan.items].sort((a, b) => 
      new Date(a.date).getTime() - new Date(b.date).getTime()
    );
    
    let currentWeekStart = new Date(planStart);
    let currentWeekItems: PlanItem[] = [];
    
    sortedItems.forEach((item) => {
      const itemDate = new Date(item.date);
      itemDate.setHours(0, 0, 0, 0);
      
      // Check if item belongs to current week
      const weekEnd = new Date(currentWeekStart);
      weekEnd.setDate(weekEnd.getDate() + 7);
      
      if (itemDate >= currentWeekStart && itemDate < weekEnd) {
        currentWeekItems.push(item);
      } else {
        // Start new week
        if (currentWeekItems.length > 0) {
          weekGroups.push(currentWeekItems);
        }
        currentWeekItems = [item];
        currentWeekStart = new Date(itemDate);
        // Set to Monday of that week
        const day = currentWeekStart.getDay();
        const diff = currentWeekStart.getDate() - day + (day === 0 ? -6 : 1);
        currentWeekStart.setDate(diff);
      }
    });
    
    if (currentWeekItems.length > 0) {
      weekGroups.push(currentWeekItems);
    }
    
    return weekGroups;
  }, [plan]);

  const totalWeeks = weeks.length;
  const currentWeekItems = weeks[currentWeek] || [];
  
  // Calculate weekly totals
  const weeklyTotals = useMemo(() => {
    return weeks.map((weekItems) => {
      const total = weekItems
        .filter(item => item.distanceMeters)
        .reduce((sum, item) => sum + (item.distanceMeters || 0), 0);
      return metersToUnit(total, distanceUnit);
    });
  }, [weeks, distanceUnit]);

  // Get week start date
  const getWeekStartDate = (weekIndex: number): Date => {
    if (weekIndex < weeks.length && weeks[weekIndex].length > 0) {
      return new Date(weeks[weekIndex][0].date);
    }
    const start = new Date(plan.startDate);
    start.setDate(start.getDate() + (weekIndex * 7));
    return start;
  };

  const weekStartDate = getWeekStartDate(currentWeek);
  const weekEndDate = new Date(weekStartDate);
  weekEndDate.setDate(weekEndDate.getDate() + 6);

  // Calculate max value for graph
  const maxMileage = Math.max(...weeklyTotals, ...(weeklyMileageProgression?.map(w => metersToUnit(w.mileageKm * 1000, distanceUnit)) || [0]));

  // Extract provenance from plan (if available in notes or metadata)
  // For now, log it in dev mode
  if (typeof window !== 'undefined' && process.env.NODE_ENV === 'development') {
    console.log('[PLAN VIEWER] Rendering plan with', plan.items.length, 'items');
  }

  return (
    <div className="space-y-4">
      {/* Dev-only provenance display */}
      {typeof window !== 'undefined' && process.env.NODE_ENV === 'development' && (
        <div className="text-xs text-gray-600 bg-gray-900 p-2 rounded border border-gray-800">
          PLAN SOURCE: planEngine:v1 (check console for provenance details)
        </div>
      )}
      
      {/* Week Navigation */}
      <div className="flex items-center justify-between border border-gray-800 rounded-lg p-4 bg-[#0f0f0f]">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setCurrentWeek(Math.max(0, currentWeek - 1))}
            disabled={currentWeek === 0}
            className="px-3 py-1 bg-gray-800 hover:bg-gray-700 text-white rounded text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            ← Prev
          </button>
          
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-400">Week</span>
            <select
              value={currentWeek}
              onChange={(e) => setCurrentWeek(parseInt(e.target.value))}
              className="px-3 py-1 bg-gray-900 border border-gray-700 text-white rounded text-sm focus:outline-none focus:border-purple-600"
            >
              {weeks.map((_, idx) => (
                <option key={idx} value={idx}>
                  {idx + 1}
                </option>
              ))}
            </select>
            <span className="text-sm text-gray-400">of {totalWeeks}</span>
          </div>
          
          <button
            onClick={() => setCurrentWeek(Math.min(totalWeeks - 1, currentWeek + 1))}
            disabled={currentWeek >= totalWeeks - 1}
            className="px-3 py-1 bg-gray-800 hover:bg-gray-700 text-white rounded text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Next →
          </button>
        </div>

        <div className="flex items-center gap-4">
          <div className="text-right">
            <div className="text-xs text-gray-500">Week Total</div>
            <div className="text-sm font-medium text-white">
              {weeklyTotals[currentWeek]?.toFixed(1) || "0"}{distanceUnit === "mi" ? "mi" : "km"}
            </div>
          </div>
          <button
            onClick={() => setShowGraph(!showGraph)}
            className="px-3 py-1 bg-purple-600 hover:bg-purple-700 text-white rounded text-sm transition-colors"
          >
            {showGraph ? "Hide" : "Show"} Graph
          </button>
        </div>
      </div>

      {/* Volume Progression Graph */}
      {showGraph && (
        <div className="border border-gray-800 rounded-lg p-4 bg-[#0f0f0f]">
          <h3 className="text-sm uppercase tracking-wider text-gray-400 mb-4">Weekly Volume Progression</h3>
          <div className="relative">
            {/* Y-axis label */}
            <div className="absolute left-0 top-0 bottom-8 flex flex-col justify-between text-xs text-gray-500 pr-2" style={{ width: "40px" }}>
              <span className="text-right">{maxMileage.toFixed(0)}</span>
              <span className="text-right">0</span>
            </div>
            <div className="absolute left-0 bottom-0 text-xs text-gray-500" style={{ width: "40px", transform: "rotate(-90deg)", transformOrigin: "left center", whiteSpace: "nowrap" }}>
              Total {distanceUnit === "mi" ? "Miles" : "Km"} per Week
            </div>
            
            {/* Graph area */}
            <div className="ml-12 mr-4 mb-6">
              <div className="relative h-64">
                {/* Y-axis grid lines */}
                <div className="absolute inset-0 flex flex-col justify-between">
                  {[0, 0.25, 0.5, 0.75, 1].map((ratio) => (
                    <div key={ratio} className="border-t border-gray-800" />
                  ))}
                </div>
                
                {/* Graph bars */}
                <div className="absolute inset-0 flex items-end justify-between gap-1">
                  {weeklyTotals.map((total, idx) => {
                    const height = maxMileage > 0 ? (total / maxMileage) * 100 : 0;
                    const isCurrentWeek = idx === currentWeek;
                    return (
                      <div key={idx} className="flex-1 flex flex-col items-center h-full">
                        <div className="relative w-full h-full flex items-end">
                          <div
                            className={`w-full rounded-t transition-all cursor-pointer hover:opacity-80 ${
                              isCurrentWeek ? "bg-purple-600" : "bg-purple-800"
                            }`}
                            style={{ height: `${height}%` }}
                            title={`Week ${idx + 1}: ${total.toFixed(1)}${distanceUnit === "mi" ? "mi" : "km"}`}
                            onClick={() => setCurrentWeek(idx)}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
                
                {/* Y-axis value labels */}
                <div className="absolute -left-10 top-0 bottom-0 flex flex-col justify-between text-xs text-gray-500">
                  {[1, 0.75, 0.5, 0.25, 0].map((ratio) => (
                    <span key={ratio} className="text-right">
                      {(maxMileage * ratio).toFixed(0)}
                    </span>
                  ))}
                </div>
              </div>
              
              {/* X-axis - Week numbers */}
              <div className="flex justify-between mt-2">
                {weeklyTotals.map((_, idx) => {
                  const isCurrentWeek = idx === currentWeek;
                  return (
                    <div
                      key={idx}
                      className={`flex-1 text-center text-xs cursor-pointer transition-colors ${
                        isCurrentWeek ? "text-purple-400 font-medium" : "text-gray-500"
                      } hover:text-gray-300`}
                      onClick={() => setCurrentWeek(idx)}
                    >
                      Week {idx + 1}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Weekly Plan Table */}
      <div className="border border-gray-800 rounded-lg overflow-hidden bg-[#0f0f0f]">
        <div className="px-4 sm:px-6 py-3 border-b border-gray-800">
          <h2 className="text-sm uppercase tracking-wider text-gray-400">
            Week {currentWeek + 1} Training Plan
          </h2>
          <p className="text-xs text-gray-500 mt-1">
            {weekStartDate.toLocaleDateString("en-US", { month: "long", day: "numeric" })} - {weekEndDate.toLocaleDateString("en-US", { month: "long", day: "numeric" })}
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-800">
                <th className="px-4 sm:px-6 py-3 text-left text-xs uppercase tracking-wider text-gray-400 font-medium">Day</th>
                <th className="px-4 sm:px-6 py-3 text-left text-xs uppercase tracking-wider text-gray-400 font-medium">Type</th>
                <th className="px-4 sm:px-6 py-3 text-right text-xs uppercase tracking-wider text-gray-400 font-medium">Distance</th>
                <th className="px-4 sm:px-6 py-3 text-right text-xs uppercase tracking-wider text-gray-400 font-medium">Pace</th>
                <th className="px-4 sm:px-6 py-3 text-left text-xs uppercase tracking-wider text-gray-400 font-medium">Notes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
              {currentWeekItems.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 sm:px-6 py-8 text-center text-sm text-gray-500">
                    No runs scheduled for this week
                  </td>
                </tr>
              ) : (
                currentWeekItems.map((item) => {
                  const date = new Date(item.date);
                  const dayName = date.toLocaleDateString("en-US", { weekday: "short" });
                  const dayNum = date.getDate();
                  
                  // SAFETY TRIPWIRE: Log error in dev if rendering pace/distance from plan
                  // This should not happen since plan generation is disabled
                  if (typeof window !== 'undefined' && process.env.NODE_ENV === 'development') {
                    if (item.targetPace || item.distanceMeters) {
                      console.error('[PLAN SAFETY TRIPWIRE] Rendering pace/distance from plan. Plan generation should be disabled.');
                    }
                  }
                  
                  return (
                    <tr key={item.id} className="hover:bg-gray-900/50 transition-colors">
                      <td className="px-4 sm:px-6 py-4">
                        <div className="text-sm font-medium text-white">{dayName}</div>
                        <div className="text-xs text-gray-500">{dayNum}</div>
                      </td>
                      <td className="px-4 sm:px-6 py-4">
                        <span className={`inline-flex items-center px-2 py-1 rounded text-xs font-medium ${
                          item.type === "rest" 
                            ? "bg-gray-800 text-gray-400"
                            : item.type === "long"
                            ? "bg-purple-900/50 text-purple-300"
                            : item.type === "tempo" || item.type === "interval"
                            ? "bg-purple-800/50 text-purple-200"
                            : "bg-purple-900/30 text-purple-300"
                        }`}>
                          {item.type.charAt(0).toUpperCase() + item.type.slice(1)}
                        </span>
                      </td>
                      <td className="px-4 sm:px-6 py-4 text-right">
                        {item.distanceMeters ? (
                          <span className="text-sm text-white">
                            {formatDistance(item.distanceMeters, distanceUnit)}
                          </span>
                        ) : (
                          <span className="text-sm text-gray-500">-</span>
                        )}
                      </td>
                      <td className="px-4 sm:px-6 py-4 text-right">
                        {item.targetPace ? (
                          <span className="text-sm text-white">
                            {formatPace(item.targetPace, distanceUnit)}
                          </span>
                        ) : (
                          <span className="text-sm text-gray-500">-</span>
                        )}
                      </td>
                      <td className="px-4 sm:px-6 py-4">
                        <span className="text-sm text-gray-400">{item.notes || "-"}</span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
