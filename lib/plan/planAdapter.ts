import { TrainingPlan, PlanDay } from "./validatePlan";
import { DistanceUnit, unitToMeters } from "../units";
import { getTargetPace, PaceRanges } from "./paceModel";

/**
 * DEPRECATED: This function is disabled. Plans are now converted directly in lib/actions.ts.
 * 
 * @deprecated Conversion happens directly in lib/actions.ts::generateGoalBasedPlan()
 */
export function convertPlanToLegacyFormat(
  plan: TrainingPlan,
  paceRanges: PaceRanges,
  distanceUnit: DistanceUnit
): {
  startDate: Date;
  items: Array<{
    date: Date;
    type: "easy" | "long" | "tempo" | "interval" | "rest";
    distanceMeters: number | null;
    notes: string;
    targetPace: number | null;
  }>;
  weeklyMileage: number;
  weeklyMileageProgression: Array<{ week: number; mileageKm: number }>;
  rationale: string;
} {
  // HARD DISABLED: This adapter is deprecated
  throw new Error(
    "lib/plan/planAdapter.ts::convertPlanToLegacyFormat is deprecated and disabled. " +
    "Plan conversion now happens directly in lib/actions.ts::generateGoalBasedPlan(). " +
    "Use lib/planEngine/getTrainingPlan() instead."
  );
}
