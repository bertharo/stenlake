"use client";

import { useState } from "react";
import { Goal } from "@prisma/client";
import { generateGoalBasedPlan, updatePlanFromRecentRuns } from "@/lib/actions";
import { DistanceUnit } from "@/lib/units";

interface PlanManagerProps {
  goal: Goal | null;
  hasPlan: boolean;
  distanceUnit: DistanceUnit;
}

export default function PlanManager({ goal, hasPlan, distanceUnit }: PlanManagerProps) {
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const handleGeneratePlan = async () => {
    if (!goal) {
      setError("Please set a race goal first in Settings.");
      return;
    }

    setIsGenerating(true);
    setError(null);
    setSuccess(null);

    try {
      const result = await generateGoalBasedPlan(5, "standard");
      setSuccess(`Plan generated successfully! ${result.rationale}`);
      // Reload page to show new plan
      setTimeout(() => {
        window.location.reload();
      }, 1500);
    } catch (err: any) {
      setError(err.message || "Failed to generate plan. Please try again.");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleUpdatePlan = async () => {
    setIsGenerating(true);
    setError(null);
    setSuccess(null);

    try {
      const result = await updatePlanFromRecentRuns();
      setSuccess(`Plan updated successfully! ${result.rationale}`);
      // Reload page to show updated plan
      setTimeout(() => {
        window.location.reload();
      }, 1500);
    } catch (err: any) {
      setError(err.message || "Failed to update plan. Please try again.");
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="border border-gray-800 rounded-lg p-6 bg-[#0f0f0f]">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xs uppercase tracking-wider text-gray-500">Training Plan</h2>
        <div className="flex gap-3">
          {!hasPlan ? (
            <button
              onClick={handleGeneratePlan}
              disabled={isGenerating || !goal}
              className="px-4 py-2 bg-gray-800 border border-gray-700 rounded text-sm hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {isGenerating ? "Generating..." : "Generate Plan"}
            </button>
          ) : (
            <>
              <button
                onClick={handleGeneratePlan}
                disabled={isGenerating || !goal}
                className="px-4 py-2 bg-gray-800 border border-gray-700 rounded text-sm hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {isGenerating ? "Regenerating..." : "Regenerate Plan"}
              </button>
              <button
                onClick={handleUpdatePlan}
                disabled={isGenerating}
                className="px-4 py-2 bg-gray-800 border border-gray-700 rounded text-sm hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {isGenerating ? "Updating..." : "Update From Recent Runs"}
              </button>
            </>
          )}
        </div>
      </div>

      {error && (
        <div className="mt-4 p-3 bg-red-900/30 border border-red-800 rounded text-sm text-red-300">
          {error}
        </div>
      )}

      {success && (
        <div className="mt-4 p-3 bg-green-900/30 border border-green-800 rounded text-sm text-green-300">
          {success}
        </div>
      )}

      {!goal && (
        <div className="mt-4 p-3 bg-yellow-900/30 border border-yellow-800 rounded text-sm text-yellow-300">
          Set a race goal in Settings to generate a training plan.
        </div>
      )}
    </div>
  );
}
