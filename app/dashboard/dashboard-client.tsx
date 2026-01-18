"use client";

import { TrainingSignals, getLastRunSummary } from "@/lib/training";
import { Plan, PlanItem, Goal, Activity } from "@prisma/client";
import { useState } from "react";
import ChatPanel from "./chat-panel";

interface DashboardClientProps {
  signals: TrainingSignals;
  plan: (Plan & { items: PlanItem[] }) | null;
  goal: Goal | null;
  activities: Activity[];
}

export default function DashboardClient({ signals, plan, goal, activities }: DashboardClientProps) {
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
    const targetWeeklyMileage = (goal.distance / 1000) / weeksUntilRace;
    
    if (lastWeek.mileageKm < targetWeeklyMileage * 0.9) {
      trajectory = "Behind";
      confidence = 50;
    } else if (lastWeek.mileageKm > targetWeeklyMileage * 1.1) {
      trajectory = "Ahead";
      confidence = 85;
    }
  }

  // Load calculation
  const currentWeekMileage = signals.weeklyMileage.length > 0
    ? signals.weeklyMileage[signals.weeklyMileage.length - 1].mileageKm
    : 0;
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
      <div className="max-w-6xl mx-auto p-8">
        <div className="mb-8">
          <h1 className="text-3xl font-light tracking-tight mb-2">Dashboard</h1>
          {goal && (
            <p className="text-sm text-gray-400">
              {(goal.distance / 1000).toFixed(1)}km race on {goal.raceDate.toLocaleDateString()}
            </p>
          )}
        </div>

        {/* Three main cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          {/* Trajectory */}
          <div className="border border-gray-800 rounded-lg p-6 bg-[#0f0f0f]">
            <h2 className="text-xs uppercase tracking-wider text-gray-500 mb-4">Trajectory</h2>
            <div className="text-2xl font-light mb-2">{trajectory}</div>
            <div className="text-sm text-gray-400">Confidence: {confidence}%</div>
          </div>

          {/* Load */}
          <div className="border border-gray-800 rounded-lg p-6 bg-[#0f0f0f]">
            <h2 className="text-xs uppercase tracking-wider text-gray-500 mb-4">Load</h2>
            <div className="text-2xl font-light mb-2">{currentWeekMileage.toFixed(1)} km</div>
            <div className="text-sm text-gray-400">
              Recommended: {recommendedMin.toFixed(1)} - {recommendedMax.toFixed(1)} km
            </div>
            {signals.fatigueRisk && (
              <div className="mt-2 text-xs text-amber-500">Fatigue risk detected</div>
            )}
          </div>

          {/* Next Run */}
          <div className="border border-gray-800 rounded-lg p-6 bg-[#0f0f0f]">
            <h2 className="text-xs uppercase tracking-wider text-gray-500 mb-4">Next Run</h2>
            {nextRun ? (
              <>
                <div className="text-2xl font-light mb-2 capitalize">{nextRun.type}</div>
                {nextRun.distanceMeters && (
                  <div className="text-sm text-gray-400 mb-2">
                    {(nextRun.distanceMeters / 1000).toFixed(1)} km
                  </div>
                )}
                {nextRun.notes && (
                  <div className="text-xs text-gray-500">{nextRun.notes}</div>
                )}
              </>
            ) : (
              <div className="text-sm text-gray-500">No run scheduled</div>
            )}
          </div>
        </div>

        {/* Weekly Plan */}
        <div className="border border-gray-800 rounded-lg p-6 bg-[#0f0f0f] mb-8">
          <h2 className="text-xs uppercase tracking-wider text-gray-500 mb-4">This Week</h2>
          <div className="grid grid-cols-7 gap-2">
            {plan?.items.map((item) => {
              const date = new Date(item.date);
              const isToday = date.toDateString() === new Date().toDateString();
              return (
                <div
                  key={item.id}
                  className={`p-3 border rounded ${
                    isToday ? "border-gray-600 bg-gray-900" : "border-gray-800"
                  }`}
                >
                  <div className="text-xs text-gray-500 mb-1">
                    {date.toLocaleDateString("en-US", { weekday: "short" })}
                  </div>
                  <div className="text-xs mb-1 capitalize">{item.type}</div>
                  {item.distanceMeters && (
                    <div className="text-xs text-gray-400">
                      {(item.distanceMeters / 1000).toFixed(1)}km
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Chat Panel Trigger */}
        {lastRun && (
          <div className="fixed bottom-6 right-6">
            <button
              onClick={() => setShowChat(true)}
              className="bg-gray-900 border border-gray-800 rounded-lg px-6 py-3 text-sm hover:bg-gray-800 transition-colors"
            >
              Talk about this run
            </button>
          </div>
        )}

        {/* Chat Panel */}
        {showChat && (
          <ChatPanel
            lastRun={lastRun!}
            onClose={() => setShowChat(false)}
          />
        )}
      </div>
    </div>
  );
}
