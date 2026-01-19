/**
 * Rule-based workout selection and safety constraints
 */

import { TodaysWorkoutInput, WorkoutSegment } from "./types";
import { formatPaceRange, PaceEstimates } from "./pace";

/**
 * Compute peak weekly mileage from last 12 weeks
 */
export function getPeakWeeklyMileage(weeklyMileage: number[]): number {
  if (weeklyMileage.length === 0) return 0;
  return Math.max(...weeklyMileage);
}

/**
 * Compute average weekly mileage from recent weeks
 */
export function getAverageWeeklyMileage(weeklyMileage: number[], weeks: number = 4): number {
  if (weeklyMileage.length === 0) return 0;
  const recent = weeklyMileage.slice(-weeks);
  const sum = recent.reduce((a, b) => a + b, 0);
  return sum / recent.length;
}

/**
 * Long run distance computation result with rules tracking
 */
export interface LongRunDistanceResult {
  miles: number;
  rulesFired: string[];
  capsApplied: string[];
}

/**
 * Determine long run distance for today
 * 
 * Rules:
 * - Default: 30-35% of peak weekly mileage
 * - If lastLongRunMiles provided: cap increase at +10%
 * - Time-limited: reduce by ~10-15%
 */
export function computeLongRunDistance(
  peakWeeklyMileage: number,
  lastLongRunMiles: number | null,
  timeLimited: boolean = false
): number {
  const result = computeLongRunDistanceWithTrace(peakWeeklyMileage, lastLongRunMiles, timeLimited);
  return result.miles;
}

/**
 * Determine long run distance with rules tracking
 */
export function computeLongRunDistanceWithTrace(
  peakWeeklyMileage: number,
  lastLongRunMiles: number | null,
  timeLimited: boolean = false
): LongRunDistanceResult {
  const rulesFired: string[] = [];
  const capsApplied: string[] = [];

  // Base: 30-35% of peak week (use midpoint 32.5%)
  const basePercent = 0.325;
  let targetMiles = peakWeeklyMileage * basePercent;
  rulesFired.push(`30-35% of peak week (${peakWeeklyMileage.toFixed(1)}mi) = ${targetMiles.toFixed(1)}mi`);

  // Apply +10% cap if we have last long run data
  if (lastLongRunMiles !== null && lastLongRunMiles > 0) {
    const maxIncrease = lastLongRunMiles * 1.1; // +10% cap
    if (targetMiles > maxIncrease) {
      capsApplied.push(`+10% cap from last long run (${lastLongRunMiles.toFixed(1)}mi → max ${maxIncrease.toFixed(1)}mi)`);
      targetMiles = maxIncrease;
    } else {
      rulesFired.push(`Last long run check: ${targetMiles.toFixed(1)}mi <= max increase ${maxIncrease.toFixed(1)}mi (OK)`);
    }
    
    // Also ensure we don't go below last long run (unless very short)
    if (targetMiles < lastLongRunMiles * 0.9) {
      capsApplied.push(`Minimum 90% of last long run (${lastLongRunMiles.toFixed(1)}mi)`);
      targetMiles = lastLongRunMiles * 0.9;
    }
  }

  // Safety minimums and maximums
  if (targetMiles < 6) {
    capsApplied.push(`Minimum 6 miles enforced`);
    targetMiles = 6;
  }
  if (targetMiles > 22) {
    capsApplied.push(`Maximum 22 miles enforced`);
    targetMiles = 22;
  }

  // Time-limited: reduce by 10-15%
  if (timeLimited) {
    const beforeTimeLimit = targetMiles;
    targetMiles = Math.max(6, targetMiles * 0.88); // ~12% reduction, min 6
    rulesFired.push(`Time-limited: ${beforeTimeLimit.toFixed(1)}mi → ${targetMiles.toFixed(1)}mi (12% reduction)`);
  }

  return {
    miles: Math.round(targetMiles * 10) / 10, // Round to 1 decimal
    rulesFired,
    capsApplied,
  };
}

/**
 * Determine workout structure based on weekly mileage
 * 
 * Low mileage (< 40 mpw): Easy + Steady progression only, NO marathon pace
 * Medium mileage (40-55 mpw): Easy + Steady + optional progression finish
 * High mileage (55+ mpw): Easy + Steady + Steady/MP blocks possible
 */
export function determineWorkoutStructure(
  totalMiles: number,
  peakWeeklyMileage: number,
  paces: PaceEstimates,
  hilly: boolean
): WorkoutSegment[] {
  const segments: WorkoutSegment[] = [];

  // Always start with easy miles (50-60% of total)
  const easyMiles = Math.floor(totalMiles * 0.55);
  const remainingMiles = totalMiles - easyMiles;

  // Easy warmup section
  segments.push({
    label: "Easy",
    fromMile: 1,
    toMile: easyMiles,
    paceRange: formatPaceRange(paces.easy.min, paces.easy.max),
    notes: hilly ? "Conversational effort. Let pace float on hills—maintain effort." : "Conversational effort.",
  });

  // Determine intensity based on weekly mileage
  if (peakWeeklyMileage < 40) {
    // Low mileage: Steady progression only
    if (remainingMiles >= 2) {
      const steadyMiles = Math.min(remainingMiles, 3);
      segments.push({
        label: "Steady",
        fromMile: easyMiles + 1,
        toMile: easyMiles + steadyMiles,
        paceRange: formatPaceRange(paces.steady.min, paces.steady.max),
        notes: hilly
          ? "Comfortably focused effort. NOT marathon pace. Keep effort constant on hills."
          : "Comfortably focused effort. NOT marathon pace.",
      });

      // Optional finish if more miles remain
      if (remainingMiles > steadyMiles) {
        const finishMiles = remainingMiles - steadyMiles;
        segments.push({
          label: "Optional finish",
          fromMile: easyMiles + steadyMiles + 1,
          toMile: totalMiles,
          paceRange: formatPaceRange(paces.steady.min * 0.97, paces.steady.max * 0.97),
          notes: "Only if smooth; skip if form degrades.",
        });
      }
    }
  } else if (peakWeeklyMileage < 55) {
    // Medium mileage: Steady + optional progression
    if (remainingMiles >= 2) {
      const steadyMiles = Math.floor(remainingMiles * 0.6);
      segments.push({
        label: "Steady",
        fromMile: easyMiles + 1,
        toMile: easyMiles + steadyMiles,
        paceRange: formatPaceRange(paces.steady.min, paces.steady.max),
        notes: hilly
          ? "Comfortably focused effort. NOT marathon pace. Keep effort constant on hills."
          : "Comfortably focused effort. NOT marathon pace.",
      });

      // Progression finish
      if (remainingMiles > steadyMiles) {
        segments.push({
          label: "Progression finish",
          fromMile: easyMiles + steadyMiles + 1,
          toMile: totalMiles,
          paceRange: formatPaceRange(paces.steady.min * 0.95, paces.steady.max * 0.95),
          notes: "Gradual pickup. Only if feeling smooth.",
        });
      }
    }
  } else {
    // High mileage (55+ mpw): Can include marathon-pace-like efforts
    if (remainingMiles >= 3 && paces.marathon) {
      const steadyMiles = Math.floor(remainingMiles * 0.5);
      segments.push({
        label: "Steady",
        fromMile: easyMiles + 1,
        toMile: easyMiles + steadyMiles,
        paceRange: formatPaceRange(paces.steady.min, paces.steady.max),
        notes: hilly
          ? "Comfortably focused effort. Keep effort constant on hills."
          : "Comfortably focused effort.",
      });

      // Marathon-pace section (only at high mileage)
      const mpMiles = Math.min(remainingMiles - steadyMiles, 3);
      if (mpMiles >= 2) {
        segments.push({
          label: "Marathon pace",
          fromMile: easyMiles + steadyMiles + 1,
          toMile: easyMiles + steadyMiles + mpMiles,
          paceRange: formatPaceRange(paces.marathon.min, paces.marathon.max),
          notes: hilly
            ? "Controlled MP effort. Focus on even effort, not pace, on hills."
            : "Controlled MP effort.",
        });
      }

      // Easy cooldown if miles remain
      if (remainingMiles > steadyMiles + mpMiles) {
        const cooldownMiles = remainingMiles - steadyMiles - mpMiles;
        segments.push({
          label: "Easy cooldown",
          fromMile: easyMiles + steadyMiles + mpMiles + 1,
          toMile: totalMiles,
          paceRange: formatPaceRange(paces.easy.min, paces.easy.max),
          notes: "Return to easy effort.",
        });
      }
    } else {
      // Fallback to steady + progression
      segments.push({
        label: "Steady",
        fromMile: easyMiles + 1,
        toMile: totalMiles,
        paceRange: formatPaceRange(paces.steady.min, paces.steady.max),
        notes: hilly
          ? "Comfortably focused effort. Keep effort constant on hills."
          : "Comfortably focused effort.",
      });
    }
  }

  return segments;
}

/**
 * Generate guardrails based on workout and context
 */
export function generateGuardrails(
  peakWeeklyMileage: number,
  hasMarathonPace: boolean,
  hilly: boolean
): string[] {
  const guardrails: string[] = [];

  if (peakWeeklyMileage < 40) {
    guardrails.push("No marathon-pace blocks at this mileage.");
  }

  if (hasMarathonPace) {
    guardrails.push("Marathon pace should feel controlled and sustainable.");
  }

  if (hilly) {
    guardrails.push("Keep effort constant on hills; pace floats.");
  }

  guardrails.push("Finish feeling like you could do 1–2 more miles.");

  if (peakWeeklyMileage < 50) {
    guardrails.push("Prioritize completion over pace.");
  }

  return guardrails;
}

/**
 * Generate rationale based on inputs
 */
export function generateRationale(
  totalMiles: number,
  peakWeeklyMileage: number,
  recentRaces: { type: string; time: string }[],
  hasMarathonPace: boolean,
  hilly: boolean
): string {
  const parts: string[] = [];

  // Reference recent race if available
  if (recentRaces.length > 0) {
    const bestRecent = recentRaces[0]; // Assume sorted by recency
    parts.push(`Based on your ${bestRecent.time} ${bestRecent.type.toLowerCase()}`);
  } else {
    parts.push("Based on your current fitness");
  }

  // Reference mileage
  parts.push(`and a ${peakWeeklyMileage.toFixed(0)}-mile peak week`);

  // Workout focus
  if (hasMarathonPace) {
    parts.push("this long run includes controlled marathon-pace work");
  } else {
    parts.push("this prioritizes aerobic extension and durability with a controlled progression");
  }

  // Mileage context
  if (peakWeeklyMileage < 40) {
    parts.push("Marathon-pace work is deferred until your weekly volume stabilizes higher.");
  } else if (peakWeeklyMileage < 55) {
    parts.push("with a steady progression to build race-specific fitness.");
  } else {
    parts.push("to bridge the gap between aerobic base and race-specific fitness.");
  }

  // Terrain note
  if (hilly) {
    parts.push("Effort-based pacing accounts for the hilly terrain.");
  }

  return parts.join(", ");
}
