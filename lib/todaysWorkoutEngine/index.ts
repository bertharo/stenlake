/**
 * Today's Workout Engine
 * 
 * Deterministic, rule-based workout recommendation for a single long run.
 */

export { generateTodaysWorkout } from "./generateTodaysWorkout";
export type {
  TodaysWorkoutInput,
  TodaysWorkoutOutput,
  Goal,
  RecentRace,
  TodayConstraints,
  Terrain,
  WorkoutSegment,
} from "./types";
