"use client";

import { TrainingSignals, getLastRunSummary } from "@/lib/training";
import { Plan, PlanItem, Goal, Activity } from "@prisma/client";
import { useState } from "react";
import ChatWindow from "./chat-window";
import { formatDistance, formatPace, metersToUnit, DistanceUnit } from "@/lib/units";
import PlanManager from "./plan-manager";
import PlanViewer from "./plan-viewer";

interface DashboardClientProps {
  signals: TrainingSignals;
  plan: (Plan & { items: PlanItem[] }) | null;
  goal: Goal | null;
  activities: Activity[];
  distanceUnit: DistanceUnit;
}

export default function DashboardClient({ signals, plan, goal, activities, distanceUnit }: DashboardClientProps) {
  const [showChat, setShowChat] = useState(false);
  const lastRun = getLastRunSummary(activities, signals.medianPace);

  // Trajectory calculation (simple: based on weekly mileage trend vs goal)
  let trajectory = "On track";
  let confidence = 75;
  
  if (goal && signals.weeklyMileage.length > 0) {
    const lastWeek = signals.weeklyMileage[signals.weeklyMileage.length - 1];
    const weeksUntilRace = Math.ceil(
      (goal.raceDate.getTime() - new Date().getTime()) / (7 * 24 * 60 * 60 * 1000)
    );
    // Convert goal distance to user's unit for comparison
    const goalDistanceInUnit = metersToUnit(goal.distance, distanceUnit);
    const targetWeeklyMileage = goalDistanceInUnit / weeksUntilRace;
    const lastWeekMileageInUnit = metersToUnit(lastWeek.mileageKm * 1000, distanceUnit);
    
    if (lastWeekMileageInUnit < targetWeeklyMileage * 0.9) {
      trajectory = "Behind";
      confidence = 50;
    } else if (lastWeekMileageInUnit > targetWeeklyMileage * 1.1) {
      trajectory = "Ahead";
      confidence = 85;
    }
  }

  // Load calculation - convert to user's unit
  const currentWeekMileageKm = signals.weeklyMileage.length > 0
    ? signals.weeklyMileage[signals.weeklyMileage.length - 1].mileageKm
    : 0;
  const currentWeekMileage = metersToUnit(currentWeekMileageKm * 1000, distanceUnit);
  const recommendedMin = currentWeekMileage * 0.9;
  const recommendedMax = currentWeekMileage * 1.1;

  // Next run (tomorrow or first scheduled)
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(0, 0, 0, 0);
  
  const nextRun = plan?.items.find((item) => {
    const itemDate = new Date(item.date);
    itemDate.setHours(0, 0, 0, 0);
    return itemDate >= tomorrow && item.type !== "rest";
  }) || plan?.items.find((item) => item.type !== "rest");

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-[#fafafa]">
      {/* Mobile-first: Stack vertically, desktop: side-by-side */}
      <div className="flex flex-col lg:flex-row h-screen">
        {/* Main Dashboard Content */}
        <div className="flex-1 overflow-y-auto">
          <div className="max-w-5xl mx-auto p-4 sm:p-6 lg:p-8">
            <div className="mb-6 sm:mb-8">
              <div className="flex items-center justify-between mb-2">
                <h1 className="text-2xl sm:text-3xl font-light tracking-tight">Dashboard</h1>
                {/* Mobile chat toggle */}
                <button
                  onClick={() => setShowChat(!showChat)}
                  className="lg:hidden px-4 py-2 bg-gray-900 border border-gray-800 rounded-lg text-sm hover:bg-gray-800 transition-colors"
                >
                  {showChat ? "Hide Chat" : "Chat"}
                </button>
              </div>
              {goal && (
                <p className="text-xs sm:text-sm text-gray-400">
                  {formatDistance(goal.distance, distanceUnit)} race on {goal.raceDate.toLocaleDateString()}
                </p>
              )}
            </div>

            {/* Training Metrics Table */}
            <div className="border border-gray-800 rounded-lg overflow-hidden bg-[#0f0f0f] mb-6 sm:mb-8">
              <div className="px-4 sm:px-6 py-3 border-b border-gray-800">
                <h2 className="text-sm uppercase tracking-wider text-gray-400">Training Metrics - Latest Data</h2>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-gray-800">
                      <th className="px-4 sm:px-6 py-3 text-left text-xs uppercase tracking-wider text-gray-400 font-medium">Metric</th>
                      <th className="px-4 sm:px-6 py-3 text-right text-xs uppercase tracking-wider text-gray-400 font-medium">Value</th>
                      <th className="px-4 sm:px-6 py-3 text-right text-xs uppercase tracking-wider text-gray-400 font-medium">Details</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-800">
                    {/* Trajectory */}
                    <tr className="hover:bg-[#1a1a1a] transition-colors">
                      <td className="px-4 sm:px-6 py-4 text-sm text-gray-300">Trajectory</td>
                      <td className="px-4 sm:px-6 py-4 text-right">
                        <span className="text-lg font-light text-white">{trajectory}</span>
                      </td>
                      <td className="px-4 sm:px-6 py-4 text-right text-sm text-gray-400">
                        {confidence}% confidence
                      </td>
                    </tr>

                    {/* Current Week Load */}
                    <tr className="hover:bg-[#1a1a1a] transition-colors">
                      <td className="px-4 sm:px-6 py-4 text-sm text-gray-300">Current Week Load</td>
                      <td className="px-4 sm:px-6 py-4 text-right">
                        <span className="text-lg font-light text-white">
                          {currentWeekMileage.toFixed(1)} {distanceUnit === "mi" ? "mi" : "km"}
                        </span>
                      </td>
                      <td className="px-4 sm:px-6 py-4 text-right text-sm text-gray-400">
                        {recommendedMin.toFixed(1)} - {recommendedMax.toFixed(1)} {distanceUnit === "mi" ? "mi" : "km"} recommended
                        {signals.fatigueRisk && (
                          <span className="ml-2 text-xs text-amber-500">⚠ Fatigue risk</span>
                        )}
                      </td>
                    </tr>

                    {/* Last Week Total */}
                    <tr className="hover:bg-[#1a1a1a] transition-colors">
                      <td className="px-4 sm:px-6 py-4 text-sm text-gray-300">Last Week Total</td>
                      <td className="px-4 sm:px-6 py-4 text-right">
                        {signals.lastWeekStats ? (
                          <span className="text-lg font-light text-white">
                            {metersToUnit(signals.lastWeekStats.totalMileageKm * 1000, distanceUnit).toFixed(1)} {distanceUnit === "mi" ? "mi" : "km"}
                          </span>
                        ) : (
                          <span className="text-sm text-gray-500">-</span>
                        )}
                      </td>
                      <td className="px-4 sm:px-6 py-4 text-right text-sm text-gray-400">
                        {signals.lastWeekStats ? (
                          <>{signals.lastWeekStats.runCount} {signals.lastWeekStats.runCount === 1 ? "run" : "runs"}</>
                        ) : (
                          <span className="text-gray-500">-</span>
                        )}
                      </td>
                    </tr>

                    {/* Last Week Average */}
                    <tr className="hover:bg-[#1a1a1a] transition-colors">
                      <td className="px-4 sm:px-6 py-4 text-sm text-gray-300">Last Week Average</td>
                      <td className="px-4 sm:px-6 py-4 text-right">
                        {signals.lastWeekStats && signals.lastWeekStats.runCount > 0 ? (
                          <span className="text-lg font-light text-white">
                            {metersToUnit(signals.lastWeekStats.averageDistanceKm * 1000, distanceUnit).toFixed(1)} {distanceUnit === "mi" ? "mi" : "km"}
                          </span>
                        ) : (
                          <span className="text-sm text-gray-500">-</span>
                        )}
                      </td>
                      <td className="px-4 sm:px-6 py-4 text-right text-sm text-gray-400">
                        {signals.lastWeekStats && signals.lastWeekStats.runCount > 0 ? (
                          <>per run</>
                        ) : (
                          <span className="text-gray-500">-</span>
                        )}
                      </td>
                    </tr>

                    {/* Next Run */}
                    <tr className="hover:bg-[#1a1a1a] transition-colors">
                      <td className="px-4 sm:px-6 py-4 text-sm text-gray-300">Next Run</td>
                      <td className="px-4 sm:px-6 py-4 text-right">
                        {nextRun ? (
                          <span className="text-lg font-light text-white capitalize">{nextRun.type}</span>
                        ) : (
                          <span className="text-sm text-gray-500">-</span>
                        )}
                      </td>
                      <td className="px-4 sm:px-6 py-4 text-right text-sm text-gray-400">
                        {nextRun ? (
                          <>
                            {nextRun.distanceMeters && formatDistance(nextRun.distanceMeters, distanceUnit)}
                            {nextRun.notes && <span className="ml-2 text-gray-500">• {nextRun.notes}</span>}
                          </>
                        ) : (
                          <span className="text-gray-500">No run scheduled</span>
                        )}
                      </td>
                    </tr>

                    {/* Intensity Distribution */}
                    <tr className="hover:bg-[#1a1a1a] transition-colors">
                      <td className="px-4 sm:px-6 py-4 text-sm text-gray-300">Intensity Distribution</td>
                      <td className="px-4 sm:px-6 py-4 text-right">
                        <span className="text-lg font-light text-white">
                          {signals.intensityDistribution.easy}E / {signals.intensityDistribution.moderate}M / {signals.intensityDistribution.hard}H
                        </span>
                      </td>
                      <td className="px-4 sm:px-6 py-4 text-right text-sm text-gray-400">
                        Easy / Moderate / Hard
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            {/* Plan Manager */}
            <div className="mb-6">
              <PlanManager goal={goal} hasPlan={!!plan} distanceUnit={distanceUnit} />
            </div>

            {/* Plan Viewer with Week Navigation */}
            {plan ? (
              <PlanViewer plan={plan} goal={goal} distanceUnit={distanceUnit} />
            ) : (
              <div className="border border-gray-800 rounded-lg p-8 bg-[#0f0f0f] text-center">
                <p className="text-sm text-gray-400">No training plan yet. Generate one above.</p>
              </div>
            )}
          </div>
        </div>

        {/* Chat Window - Mobile: bottom sheet, Desktop: side panel */}
        <div className={`${
          showChat ? "flex" : "hidden"
        } lg:flex flex-col fixed lg:relative inset-x-0 bottom-0 lg:inset-auto lg:w-96 lg:border-l border-gray-800 bg-[#0f0f0f] z-50 lg:z-auto h-[70vh] lg:h-auto`}>
          <ChatWindow lastRun={lastRun} onClose={() => setShowChat(false)} distanceUnit={distanceUnit} />
        </div>
      </div>
    </div>
  );
}
