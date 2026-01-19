"use client";

import { TrainingSignals, getLastRunSummary } from "@/lib/training";
import { Plan, PlanItem, Goal, Activity } from "@prisma/client";
import { useState } from "react";
import ChatWindow from "./chat-window";
import { formatDistance, formatPace, metersToUnit, DistanceUnit } from "@/lib/units";

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

            {/* KPI Cards - Stack on mobile, grid on desktop */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 sm:gap-6 mb-6 sm:mb-8">
              {/* Trajectory */}
              <div className="border border-gray-800 rounded-lg p-4 sm:p-6 bg-[#0f0f0f]">
                <h2 className="text-xs uppercase tracking-wider text-gray-500 mb-3 sm:mb-4">Trajectory</h2>
                <div className="text-xl sm:text-2xl font-light mb-2">{trajectory}</div>
                <div className="text-xs sm:text-sm text-gray-400">Confidence: {confidence}%</div>
              </div>

              {/* Load */}
              <div className="border border-gray-800 rounded-lg p-4 sm:p-6 bg-[#0f0f0f]">
                <h2 className="text-xs uppercase tracking-wider text-gray-500 mb-3 sm:mb-4">Load</h2>
                <div className="text-xl sm:text-2xl font-light mb-2">{currentWeekMileage.toFixed(1)} {distanceUnit === "mi" ? "mi" : "km"}</div>
                <div className="text-xs sm:text-sm text-gray-400">
                  Recommended: {recommendedMin.toFixed(1)} - {recommendedMax.toFixed(1)} {distanceUnit === "mi" ? "mi" : "km"}
                </div>
                {signals.fatigueRisk && (
                  <div className="mt-2 text-xs text-amber-500">Fatigue risk detected</div>
                )}
              </div>

              {/* Last Week Total */}
              <div className="border border-gray-800 rounded-lg p-4 sm:p-6 bg-[#0f0f0f]">
                <h2 className="text-xs uppercase tracking-wider text-gray-500 mb-3 sm:mb-4">Last Week Total</h2>
                {signals.lastWeekStats ? (
                  <>
                    <div className="text-xl sm:text-2xl font-light mb-2">
                      {metersToUnit(signals.lastWeekStats.totalMileageKm * 1000, distanceUnit).toFixed(1)} {distanceUnit === "mi" ? "mi" : "km"}
                    </div>
                    <div className="text-xs sm:text-sm text-gray-400">
                      {signals.lastWeekStats.runCount} {signals.lastWeekStats.runCount === 1 ? "run" : "runs"}
                    </div>
                  </>
                ) : (
                  <div className="text-xs sm:text-sm text-gray-500">No data</div>
                )}
              </div>

              {/* Last Week Average */}
              <div className="border border-gray-800 rounded-lg p-4 sm:p-6 bg-[#0f0f0f]">
                <h2 className="text-xs uppercase tracking-wider text-gray-500 mb-3 sm:mb-4">Last Week Avg</h2>
                {signals.lastWeekStats && signals.lastWeekStats.runCount > 0 ? (
                  <>
                    <div className="text-xl sm:text-2xl font-light mb-2">
                      {metersToUnit(signals.lastWeekStats.averageDistanceKm * 1000, distanceUnit).toFixed(1)} {distanceUnit === "mi" ? "mi" : "km"}
                    </div>
                    <div className="text-xs sm:text-sm text-gray-400">per run</div>
                  </>
                ) : (
                  <div className="text-xs sm:text-sm text-gray-500">No data</div>
                )}
              </div>

              {/* Next Run */}
              <div className="border border-gray-800 rounded-lg p-4 sm:p-6 bg-[#0f0f0f]">
                <h2 className="text-xs uppercase tracking-wider text-gray-500 mb-3 sm:mb-4">Next Run</h2>
                {nextRun ? (
                  <>
                    <div className="text-xl sm:text-2xl font-light mb-2 capitalize">{nextRun.type}</div>
                    {nextRun.distanceMeters && (
                      <div className="text-xs sm:text-sm text-gray-400 mb-2">
                        {formatDistance(nextRun.distanceMeters, distanceUnit)}
                      </div>
                    )}
                    {nextRun.notes && (
                      <div className="text-xs text-gray-500">{nextRun.notes}</div>
                    )}
                  </>
                ) : (
                  <div className="text-xs sm:text-sm text-gray-500">No run scheduled</div>
                )}
              </div>
            </div>

            {/* Weekly Plan - Horizontal scroll on mobile */}
            <div className="border border-gray-800 rounded-lg p-4 sm:p-6 bg-[#0f0f0f]">
              <h2 className="text-xs uppercase tracking-wider text-gray-500 mb-4">This Week</h2>
              <div className="grid grid-cols-7 gap-2 overflow-x-auto">
                {plan?.items.map((item) => {
                  const date = new Date(item.date);
                  const isToday = date.toDateString() === new Date().toDateString();
                  return (
                    <div
                      key={item.id}
                      className={`p-2 sm:p-3 border rounded min-w-[60px] ${
                        isToday ? "border-gray-600 bg-gray-900" : "border-gray-800"
                      }`}
                    >
                      <div className="text-xs text-gray-500 mb-1">
                        {date.toLocaleDateString("en-US", { weekday: "short" })}
                      </div>
                      <div className="text-xs mb-1 capitalize">{item.type}</div>
                      {item.distanceMeters && (
                        <div className="text-xs text-gray-400">
                          {formatDistance(item.distanceMeters, distanceUnit, 1)}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
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
