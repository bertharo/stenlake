/**
 * Generate Today's Workout
 * 
 * Main entry point for deterministic, rule-based workout recommendation.
 */

import { TodaysWorkoutInput, TodaysWorkoutOutput, DebugTrace } from "./types";
import { computePaceEstimates, computePaceEstimatesWithSource } from "./pace";
import {
  getPeakWeeklyMileage,
  computeLongRunDistance,
  computeLongRunDistanceWithTrace,
  determineWorkoutStructure,
  generateGuardrails,
  generateRationale,
} from "./rules";

/**
 * Generate a single long run workout recommendation for today
 */
export function generateTodaysWorkout(input: TodaysWorkoutInput): TodaysWorkoutOutput {
  // Validate inputs
  if (input.weeklyMileage.length === 0) {
    throw new Error("weeklyMileage must have at least one week of data");
  }

  // Compute key metrics with debug traces
  const peakWeeklyMileage = getPeakWeeklyMileage(input.weeklyMileage);
  const paceResult = computePaceEstimatesWithSource(input.recentRaces);
  const paces = paceResult.estimates;
  const hilly = input.terrain?.hilly ?? false;

  // Determine long run distance with rules tracking
  const distanceResult = computeLongRunDistanceWithTrace(
    peakWeeklyMileage,
    input.lastLongRunMiles,
    input.todayConstraints.timeLimited ?? false
  );
  const totalMiles = distanceResult.miles;

  // Determine workout structure
  const segments = determineWorkoutStructure(totalMiles, peakWeeklyMileage, paces, hilly);

  // Check if workout includes marathon pace
  const hasMarathonPace = segments.some((s) => s.label.toLowerCase().includes("marathon pace"));

  // Generate guardrails
  const guardrails = generateGuardrails(peakWeeklyMileage, hasMarathonPace, hilly);

  // Generate rationale
  const rationale = generateRationale(
    totalMiles,
    peakWeeklyMileage,
    input.recentRaces.map((r) => ({ type: r.type, time: r.time })),
    hasMarathonPace,
    hilly
  );

  // Build debug trace
  const debug: DebugTrace = {
    paceSource: paceResult.paceSource,
    rulesFired: [
      ...distanceResult.rulesFired,
      `Peak weekly mileage: ${peakWeeklyMileage.toFixed(1)}mi`,
      `Intensity structure: ${peakWeeklyMileage < 40 ? "Low mileage (steady only)" : peakWeeklyMileage < 55 ? "Medium mileage (steady + progression)" : "High mileage (MP blocks possible)"}`,
    ],
    capsApplied: [
      ...distanceResult.capsApplied,
      ...(hasMarathonPace && peakWeeklyMileage < 55 ? ["Marathon pace blocked (weekly mileage < 55mpw)"] : []),
    ],
    assumptions: [
      ...paceResult.assumptions,
      ...(input.recentRaces.length === 0 ? ["No recent race data - using conservative pace defaults"] : []),
    ],
    warnings: paceResult.warnings.length > 0 ? paceResult.warnings : undefined,
  };

  return {
    title: "Today's Long Run",
    totalMiles,
    segments,
    rationale,
    guardrails,
    debug,
  };
}
