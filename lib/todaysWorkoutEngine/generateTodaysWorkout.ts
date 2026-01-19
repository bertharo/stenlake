/**
 * Generate Today's Workout
 * 
 * Main entry point for deterministic, rule-based workout recommendation.
 */

import { TodaysWorkoutInput, TodaysWorkoutOutput } from "./types";
import { computePaceEstimates } from "./pace";
import {
  getPeakWeeklyMileage,
  computeLongRunDistance,
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

  // Compute key metrics
  const peakWeeklyMileage = getPeakWeeklyMileage(input.weeklyMileage);
  const paces = computePaceEstimates(input.recentRaces);
  const hilly = input.terrain?.hilly ?? false;

  // Determine long run distance
  const totalMiles = computeLongRunDistance(
    peakWeeklyMileage,
    input.lastLongRunMiles,
    input.todayConstraints.timeLimited ?? false
  );

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

  return {
    title: "Today's Long Run",
    totalMiles,
    segments,
    rationale,
    guardrails,
  };
}
