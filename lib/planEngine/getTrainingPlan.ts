/**
 * Single retrieval function for training plan
 * 
 * This is the ONE canonical function used by dashboard + chat.
 * All plan generation goes through this function.
 */

import { Activity, Goal as PrismaGoal } from "@prisma/client";
import { computeRecentFitness } from "./computeRecentFitness";
import { computePaceRanges } from "./computePaceRanges";
import { generate12WeekPlan } from "./generate12WeekPlan";
import { validatePlan, ValidationResult } from "./validatePlan";
import { TrainingPlan, Goal } from "./types";

/**
 * Convert Prisma Goal to canonical Goal type
 */
function convertGoal(prismaGoal: PrismaGoal, daysPerWeek: number = 5, mode: "conservative" | "standard" | "aggressive" = "standard"): Goal {
  const distanceKm = prismaGoal.distance / 1000;
  
  let race: "marathon" | "half" | "10k" | "5k";
  if (distanceKm >= 42) {
    race = "marathon";
  } else if (distanceKm >= 21) {
    race = "half";
  } else if (distanceKm >= 10) {
    race = "10k";
  } else {
    race = "5k";
  }
  
  // Get Monday of this week as start date
  const today = new Date();
  const day = today.getDay();
  const diff = today.getDate() - day + (day === 0 ? -6 : 1);
  const startDate = new Date(today);
  startDate.setDate(diff);
  startDate.setHours(0, 0, 0, 0);
  
  return {
    race,
    targetTimeSec: prismaGoal.targetTimeSeconds,
    startDate,
    raceDate: prismaGoal.raceDate,
    daysPerWeek,
    mode,
  };
}

/**
 * Get training plan
 * 
 * Single entry point for plan generation.
 * Used by dashboard and chat.
 */
export async function getTrainingPlan(
  goal: PrismaGoal | null,
  activities: Activity[],
  daysPerWeek: number = 5,
  mode: "conservative" | "standard" | "aggressive" = "standard"
): Promise<{
  plan: TrainingPlan;
  validation: ValidationResult;
}> {
  // Check if goal is configured
  if (!goal) {
    return {
      plan: {
        status: "not_configured",
        meta: {
          provenance: "lib/planEngine/getTrainingPlan",
          fingerprint: `ENGINE_V1_NOT_CONFIGURED_${Math.random().toString(16).slice(2)}`,
          generatedAt: new Date().toISOString(),
          assumptions: ["No goal configured"],
          fitnessSummary: {
            avgWeeklyMiles: 0,
            maxWeeklyMiles: 0,
            longRunMiles: 0,
            lastRunDate: null,
          },
        },
        weeks: [],
      },
      validation: {
        isValid: false,
        errors: ["No goal configured"],
        warnings: [],
      },
    };
  }
  
  // Convert goal
  const canonicalGoal = convertGoal(goal, daysPerWeek, mode);
  
  // Compute marathon pace for fitness computation
  const distanceMiles = canonicalGoal.race === "marathon" ? 26.21875 :
                        canonicalGoal.race === "half" ? 13.109375 :
                        canonicalGoal.race === "10k" ? 6.21371 :
                        3.10686;
  const goalMarathonPaceSecPerMile = canonicalGoal.targetTimeSec / distanceMiles;
  
  // Compute fitness
  const fitness = computeRecentFitness(
    activities,
    42, // 6 weeks
    goalMarathonPaceSecPerMile
  );
  
  // Compute pace ranges
  const paces = computePaceRanges(fitness, canonicalGoal);
  
  // Generate plan
  let plan = generate12WeekPlan(fitness, canonicalGoal, paces);
  
  // Validate
  let validation = validatePlan(plan);
  
  // If invalid, try regeneration up to 3 times
  let attempts = 0;
  const maxAttempts = 3;
  
  while (!validation.isValid && attempts < maxAttempts) {
    attempts++;
    
    // Adjust parameters and regenerate
    // For now, just regenerate (random variation will produce different results)
    plan = generate12WeekPlan(fitness, canonicalGoal, paces);
    validation = validatePlan(plan);
  }
  
  // If still invalid after attempts, return conservative fallback
  if (!validation.isValid) {
    // Generate conservative fallback plan
    const conservativeGoal: Goal = {
      ...canonicalGoal,
      mode: "conservative",
    };
    plan = generate12WeekPlan(fitness, conservativeGoal, paces);
    validation = validatePlan(plan);
    
    plan.meta.assumptions.push(
      `Plan validation failed after ${maxAttempts} attempts - using conservative fallback`
    );
  }
  
  return {
    plan,
    validation,
  };
}
