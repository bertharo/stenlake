/**
 * CANONICAL PLAN ENGINE
 * 
 * This is the ONLY module that generates training plans.
 * All other modules MUST call this module - no other plan generation allowed.
 */

import { Goal, Activity } from "@prisma/client";
import { RecentFitness, computeRecentFitness } from "../strava/computeRecentFitness";
import { PaceRanges, computePaceRanges } from "../plan/paceModel";
import { validatePlan, TrainingPlan } from "../plan/validatePlan";
import { DistanceUnit } from "../units";
import { generateMarathonPlan as generatePlanInternal } from "../plan/generatePlan";
import { convertPlanToLegacyFormat } from "../plan/planAdapter";

export interface PlanEngineOptions {
  goal: Goal;
  activities: Activity[];
  distanceUnit: DistanceUnit;
  aggressiveMode?: boolean;
  demoMode?: boolean; // If true, use demo fitness profile
}

export interface PlanEngineResult {
  plan: TrainingPlan;
  legacyFormat: {
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
  };
  validationErrors: string[];
  provenance: {
    engine: string;
    version: string;
    inputsUsed: string[];
    source: "strava" | "demo" | "conservative";
  };
}

/**
 * CANONICAL PLAN GENERATOR
 * 
 * This is the ONLY function that generates plans.
 * All code paths MUST call this function.
 */
export async function generate12WeekPlan(options: PlanEngineOptions): Promise<PlanEngineResult> {
  const { goal, activities, distanceUnit, aggressiveMode = false, demoMode = false } = options;
  
  // Compute fitness - use demo profile if requested
  let fitness: RecentFitness;
  const inputsUsed: string[] = [];
  
  if (demoMode) {
    // Create demo fitness profile
    fitness = createDemoFitnessProfile(goal, distanceUnit);
    inputsUsed.push("demoProfile");
  } else if (activities.length === 0) {
    // No activities - use conservative defaults
    fitness = computeRecentFitness([], 42);
    inputsUsed.push("noActivities");
  } else {
    // Use real Strava data
    fitness = computeRecentFitness(activities, 42);
    inputsUsed.push(`strava:last42days:${activities.length}runs`);
  }
  
  inputsUsed.push(`goal:${goal.distance / 1000}km:${Math.round(goal.targetTimeSeconds / 60)}min`);
  
  // Compute pace ranges
  const paceRanges = computePaceRanges(fitness, goal, distanceUnit);
  
  // Generate plan
  const { plan, validationErrors } = generatePlanInternal({
    goal,
    activities: demoMode ? [] : activities,
    distanceUnit,
    aggressiveMode,
  });
  
  // Add provenance to plan meta
  const planWithProvenance: TrainingPlan = {
    ...plan,
    meta: {
      ...plan.meta,
      provenance: {
        engine: "planEngine",
        version: "v1",
        inputsUsed,
        source: demoMode ? "demo" : activities.length === 0 ? "conservative" : "strava",
      },
    },
  };
  
  // Convert to legacy format for database
  const legacyFormat = convertPlanToLegacyFormat(planWithProvenance, paceRanges, distanceUnit);
  
  return {
    plan: planWithProvenance,
    legacyFormat,
    validationErrors,
    provenance: {
      engine: "planEngine",
      version: "v1",
      inputsUsed,
      source: demoMode ? "demo" : activities.length === 0 ? "conservative" : "strava",
    },
  };
}

/**
 * Create demo fitness profile for testing/demo mode
 */
function createDemoFitnessProfile(goal: Goal, distanceUnit: DistanceUnit): RecentFitness {
  const goalDistanceKm = goal.distance / 1000;
  const goalPaceSecondsPerMeter = goal.targetTimeSeconds / goal.distance;
  
  // Create realistic demo profile based on goal
  const baseWeeklyMileage = goalDistanceKm >= 42 ? 50 : 30;
  const easyPace = goalPaceSecondsPerMeter * 1.20; // 20% slower than goal
  
  return {
    weeklyMileage: [
      { week: "2024-W50", mileageKm: baseWeeklyMileage * 0.9 },
      { week: "2024-W51", mileageKm: baseWeeklyMileage * 0.95 },
      { week: "2024-W52", mileageKm: baseWeeklyMileage },
      { week: "2025-W01", mileageKm: baseWeeklyMileage * 1.05 },
      { week: "2025-W02", mileageKm: baseWeeklyMileage * 1.1 },
      { week: "2025-W03", mileageKm: baseWeeklyMileage },
    ],
    maxLongRunMeters: goalDistanceKm >= 42 ? 30000 : 20000,
    recentLongRuns: [
      { date: new Date(), distanceMeters: goalDistanceKm >= 42 ? 30000 : 20000 },
    ],
    easyPaceRange: { min: easyPace * 0.98, max: easyPace * 1.02 },
    tempoPaceEstimate: goalPaceSecondsPerMeter * 0.95,
    vo2PaceEstimate: goalPaceSecondsPerMeter * 0.85,
    recentLoad: 15,
    fatigueRisk: false,
    recentRunCount: 20,
    averageWeeklyMileage: baseWeeklyMileage,
    peakWeeklyMileage: baseWeeklyMileage * 1.1,
    assumptions: ["Demo fitness profile"],
  };
}

// Re-export for convenience
export { computeRecentFitness } from "../strava/computeRecentFitness";
export { computePaceRanges } from "../plan/paceModel";
export { validatePlan } from "../plan/validatePlan";
export type { TrainingPlan } from "../plan/validatePlan";
export type { PaceRanges } from "../plan/paceModel";
export type { RecentFitness } from "../strava/computeRecentFitness";
