/**
 * Single retrieval function for training plan
 * 
 * This is the ONE canonical function used by dashboard + chat.
 * All plan generation goes through this function.
 */

import { Activity, Goal as PrismaGoal } from "@prisma/client";
import { computeRecentFitness } from "./computeRecentFitness";
import { computePaceRanges, computePaceRangesWithSource } from "./computePaceRanges";
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
          fingerprint: `ENGINE_V1_NOT_CONFIGURED_${Date.now().toString(16)}`,
          generatedAt: new Date().toISOString(),
          assumptions: ["No goal configured"],
          paceSource: "default",
          rulesFired: [],
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
  
  // Compute pace ranges with source tracking
  const paceResult = computePaceRangesWithSource(fitness, canonicalGoal);
  const paces = paceResult.ranges;
  
  // Collect rules and debug info
  const rulesFired: string[] = [];
  const capsApplied: string[] = [];
  const warnings: string[] = [...paceResult.warnings];
  
  // Generate plan
  let plan = generate12WeekPlan(fitness, canonicalGoal, paces);
  rulesFired.push(...plan.meta.rulesFired);
  
  // Validate
  let validation = validatePlan(plan);
  
  // If invalid, try regeneration up to 3 times with different templates
  let attempts = 0;
  const maxAttempts = 3;
  
  while (!validation.isValid && attempts < maxAttempts) {
    attempts++;
    
    // Try with different mode or adjustments
    const adjustedGoal: Goal = attempts === 1
      ? { ...canonicalGoal, mode: "conservative" }
      : attempts === 2
      ? { ...canonicalGoal, mode: "standard", daysPerWeek: Math.max(4, canonicalGoal.daysPerWeek - 1) }
      : { ...canonicalGoal, mode: "conservative", daysPerWeek: Math.max(4, canonicalGoal.daysPerWeek - 1) };
    
    plan = generate12WeekPlan(fitness, adjustedGoal, paces);
    rulesFired.push(...plan.meta.rulesFired);
    validation = validatePlan(plan);
    
    if (attempts === maxAttempts) {
      rulesFired.push(`Regeneration attempt ${attempts} with adjusted parameters`);
    }
  }
  
  // If still invalid after attempts, return conservative fallback
  let fallbackReason: { reason: string; triggered: boolean } | undefined;
  if (!validation.isValid) {
    // Generate conservative fallback plan
    const conservativeGoal: Goal = {
      ...canonicalGoal,
      mode: "conservative",
    };
    plan = generate12WeekPlan(fitness, conservativeGoal, paces);
    rulesFired.push(...plan.meta.rulesFired);
    validation = validatePlan(plan);
    
    const fallbackMsg = `Plan validation failed after ${maxAttempts} attempts - using conservative fallback`;
    plan.meta.assumptions.push(fallbackMsg);
    
    fallbackReason = {
      reason: validation.errors.join("; "),
      triggered: true,
    };
  }
  
  // Override meta with canonical entry point information
  plan.meta = {
    ...plan.meta,
    provenance: "lib/planEngine/getTrainingPlan.ts",
    generatedAt: new Date().toISOString(),
    paceSource: paceResult.paceSource,
    rulesFired: Array.from(new Set(rulesFired)), // Deduplicate
    debug: {
      paceSource: paceResult.paceSource,
      rulesFired: Array.from(new Set(rulesFired)),
      capsApplied,
      assumptions: plan.meta.assumptions,
      warnings: warnings.length > 0 ? warnings : undefined,
      fallback: fallbackReason,
    },
    // Keep fingerprint from generate12WeekPlan (deterministic)
  };
  
  return {
    plan,
    validation,
  };
}
