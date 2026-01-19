import { Goal } from "@prisma/client";
import { RecentFitness } from "../strava/computeRecentFitness";
import { DistanceUnit, formatPace } from "../units";

/**
 * Pace ranges for different workout types (seconds per meter)
 */
export interface PaceRanges {
  easy: { min: number; max: number };
  marathon: { min: number; max: number };
  tempo: { min: number; max: number };
  interval: { min: number; max: number };
}

/**
 * DEPRECATED: This function is disabled. Use lib/planEngine/computePaceRanges() instead.
 * 
 * @deprecated Use lib/planEngine/computePaceRanges() instead
 */
export function computePaceRanges(
  fitness: RecentFitness,
  goal: Goal,
  distanceUnit: DistanceUnit
): PaceRanges {
  // HARD DISABLED: This old pace model is deprecated
  throw new Error(
    "lib/plan/paceModel.ts::computePaceRanges is deprecated and disabled. " +
    "Use lib/planEngine/computePaceRanges() instead. " +
    "This old pace model has been replaced by the canonical plan engine."
  );
  
  // OLD CODE (disabled - kept for reference but unreachable):
  // This code is never executed due to throw above, but kept for reference
  const _fitness = fitness as any;
  const _goal = goal as any;
  const _distanceUnit = distanceUnit as any;
  
  // Return dummy value to satisfy TypeScript (unreachable)
  return {
    easy: { min: 0, max: 0 },
    marathon: { min: 0, max: 0 },
    tempo: { min: 0, max: 0 },
    interval: { min: 0, max: 0 },
  };
}

/**
 * DEPRECATED: This function is disabled. Use lib/units/formatPaceRange() instead.
 * 
 * @deprecated Use lib/units/formatPaceRange() instead
 */
export function formatPaceRange(range: { min: number; max: number }, distanceUnit: DistanceUnit): string {
  throw new Error(
    "lib/plan/paceModel.ts::formatPaceRange is deprecated and disabled. " +
    "Use lib/units/formatPaceRange() instead."
  );
}

/**
 * DEPRECATED: This function is disabled.
 * 
 * @deprecated Pace selection now happens in lib/planEngine/generate12WeekPlan()
 */
export function getTargetPace(ranges: PaceRanges, workoutType: "easy" | "long" | "tempo" | "interval"): number {
  throw new Error(
    "lib/plan/paceModel.ts::getTargetPace is deprecated and disabled. " +
    "Pace selection now happens in lib/planEngine/generate12WeekPlan()."
  );
}
