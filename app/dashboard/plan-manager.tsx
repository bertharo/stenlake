"use client";

import { formatDistance, DistanceUnit } from "@/lib/units";
import { Goal } from "@prisma/client";

interface PlanManagerProps {
  goal: Goal | null;
  hasPlan: boolean;
  distanceUnit: DistanceUnit;
}

export default function PlanManager({ goal, hasPlan, distanceUnit }: PlanManagerProps) {
  // Plan generation functions removed - see lib/actions.ts
  // const handleGeneratePlan and handleUpdateFromRuns are disabled

  if (!goal) {
    return (
      <div className="border border-gray-800 rounded-lg p-4 bg-[#0f0f0f]">
        <p className="text-sm text-gray-400">
          Set a race goal in Settings to generate a training plan
        </p>
      </div>
    );
  }

  const weeksUntilRace = Math.ceil(
    (goal.raceDate.getTime() - new Date().getTime()) / (7 * 24 * 60 * 60 * 1000)
  );

  return (
    <div className="border border-gray-800 rounded-lg p-4 sm:p-6 bg-[#0f0f0f]">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-sm uppercase tracking-wider text-gray-400 mb-1">Training Plan</h3>
          <p className="text-xs text-gray-500">
            {formatDistance(goal.distance, distanceUnit)} race in {weeksUntilRace} {weeksUntilRace === 1 ? "week" : "weeks"}
          </p>
        </div>
      </div>

      <div className="space-y-3">
        {/* Plan generation is disabled - show placeholder */}
        <button
          disabled
          className="w-full px-4 py-2 bg-gray-800 text-gray-500 rounded text-sm font-medium cursor-not-allowed"
        >
          Generate Weekly Plan (Coming Soon)
        </button>
        <p className="text-xs text-gray-500 text-center">
          Training plan generation is temporarily disabled while we rebuild it.
        </p>
        
        {/* OLD CODE (disabled):
        {!hasPlan ? (
          <button onClick={handleGeneratePlan} ...>Generate Weekly Plan</button>
        ) : (
          <>
            <button onClick={handleUpdateFromRuns} ...>Update Plan from Recent Runs</button>
            <button onClick={handleGeneratePlan} ...>Regenerate Plan</button>
          </>
        )}
        */}
      </div>
    </div>
  );
}
