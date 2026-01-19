"use client";

import { useState } from "react";
import { generateGoalBasedPlan, updatePlanFromRecentRuns } from "@/lib/actions";
import { useRouter } from "next/navigation";
import { formatDistance, metersToUnit, DistanceUnit } from "@/lib/units";
import { Goal } from "@prisma/client";

interface PlanManagerProps {
  goal: Goal | null;
  hasPlan: boolean;
  distanceUnit: DistanceUnit;
}

export default function PlanManager({ goal, hasPlan, distanceUnit }: PlanManagerProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const handleGeneratePlan = async () => {
    if (!goal) {
      setMessage("Please set a race goal first in Settings");
      return;
    }

    setLoading(true);
    setMessage(null);
    try {
      const result = await generateGoalBasedPlan();
      if (result && result.plan) {
        setMessage(`Plan generated! ${result.rationale}`);
        // Refresh the page to show the new plan
        router.refresh();
        // Also do a hard refresh after a short delay to ensure it's visible
        setTimeout(() => {
          window.location.href = window.location.href;
        }, 1000);
      } else {
        throw new Error("Plan was not created successfully");
      }
    } catch (error: any) {
      console.error("Plan generation error:", error);
      setMessage(error.message || "Failed to generate plan");
      setLoading(false);
    }
  };

  const handleUpdateFromRuns = async () => {
    if (!goal) {
      setMessage("Please set a race goal first in Settings");
      return;
    }

    setLoading(true);
    setMessage(null);
    try {
      const result = await updatePlanFromRecentRuns();
      setMessage(`Plan updated based on your recent runs! ${result.rationale}`);
      router.refresh();
    } catch (error: any) {
      setMessage(error.message || "Failed to update plan");
    } finally {
      setLoading(false);
    }
  };

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
        {!hasPlan ? (
          <button
            onClick={handleGeneratePlan}
            disabled={loading}
            className="w-full px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? "Generating..." : "Generate Weekly Plan"}
          </button>
        ) : (
          <>
            <button
              onClick={handleUpdateFromRuns}
              disabled={loading}
              className="w-full px-4 py-2 bg-purple-700/50 hover:bg-purple-700/70 text-white border border-purple-600 rounded text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? "Updating..." : "Update Plan from Recent Runs"}
            </button>
            <button
              onClick={handleGeneratePlan}
              disabled={loading}
              className="w-full px-4 py-2 bg-gray-800 hover:bg-gray-700 text-white rounded text-sm transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? "Regenerating..." : "Regenerate Plan"}
            </button>
          </>
        )}

        {message && (
          <div className={`p-3 rounded text-sm ${
            message.includes("Failed") || message.includes("Please set")
              ? "bg-red-900/30 text-red-300 border border-red-800"
              : "bg-purple-900/30 text-purple-300 border border-purple-800"
          }`}>
            {message}
          </div>
        )}
      </div>
    </div>
  );
}
