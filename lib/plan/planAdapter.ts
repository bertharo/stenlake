import { TrainingPlan, PlanDay } from "./validatePlan";
import { DistanceUnit, unitToMeters } from "../units";
import { getTargetPace, PaceRanges } from "./paceModel";

/**
 * Convert new TrainingPlan format to legacy format for database storage
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
  const items: Array<{
    date: Date;
    type: "easy" | "long" | "tempo" | "interval" | "rest";
    distanceMeters: number | null;
    notes: string;
    targetPace: number | null;
  }> = [];
  
  // Flatten all weeks into items
  plan.weeks.forEach((week) => {
    week.days.forEach((day) => {
      const totalMiles = day.miles + (day.warmupMiles || 0) + (day.cooldownMiles || 0);
      const distanceMeters = day.type === "rest" ? null : unitToMeters(totalMiles, distanceUnit);
      
      // Get target pace
      let targetPace: number | null = null;
      if (day.type !== "rest") {
        if (day.paceRanges) {
          // Use midpoint of range
          targetPace = (day.paceRanges.min + day.paceRanges.max) / 2;
        } else {
          // Fallback to pace model
          targetPace = getTargetPace(paceRanges, day.type);
        }
      }
      
      items.push({
        date: day.date,
        type: day.type,
        distanceMeters,
        notes: day.notes || "",
        targetPace,
      });
    });
  });
  
  // Weekly mileage progression
  const weeklyMileageProgression = plan.weeks.map((week) => ({
    week: week.weekNumber,
    mileageKm: unitToMeters(week.totalMiles, distanceUnit) / 1000,
  }));
  
  // First week mileage
  const firstWeekMileage = plan.weeks.length > 0
    ? unitToMeters(plan.weeks[0].totalMiles, distanceUnit) / 1000
    : 0;
  
  // Rationale with provenance info
  const assumptions = plan.meta.assumptions.length > 0
    ? ` Assumptions: ${plan.meta.assumptions.join("; ")}.`
    : "";
  const provenanceInfo = plan.meta.provenance 
    ? ` [Source: ${plan.meta.provenance.source}, Engine: ${plan.meta.provenance.engine}:${plan.meta.provenance.version}]`
    : "";
  const rationale = `Generated ${plan.weeks.length}-week plan for ${plan.meta.goal.distanceMeters / 1000}km race. ` +
    `Starting at ${plan.weeks[0]?.totalMiles.toFixed(1)}${distanceUnit === "mi" ? "mi" : "km"}/week, ` +
    `peaking at ${Math.max(...plan.weeks.map((w) => w.totalMiles)).toFixed(1)}${distanceUnit === "mi" ? "mi" : "km"}/week ` +
    `with taper in final weeks.${assumptions}${provenanceInfo}`;
  
  // Log provenance in dev mode
  if (process.env.NODE_ENV === 'development' && plan.meta.provenance) {
    console.log('[PLAN ADAPTER] Plan provenance:', plan.meta.provenance);
  }
  
  return {
    startDate: plan.meta.startDate,
    items,
    weeklyMileage: firstWeekMileage,
    weeklyMileageProgression,
    rationale,
  };
}
