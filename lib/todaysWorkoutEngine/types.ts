/**
 * Today's Workout Engine - Types
 * 
 * Deterministic, rule-based workout recommendation for a single long run.
 */

export interface Goal {
  race: string; // e.g., "Boston Marathon"
  targetTime: string; // e.g., "2:40:00"
  date: string; // ISO date string, e.g., "2026-04-20"
}

export interface RecentRace {
  type: "5K" | "10K" | "Half Marathon" | "Marathon";
  time: string; // e.g., "1:29:00"
  date: string; // ISO date string
}

export interface TodayConstraints {
  mustBe: "long_run";
  timeLimited?: boolean; // If true, suggests slightly shorter options
}

export interface Terrain {
  hilly?: boolean; // If true, uses effort-based guidance
}

export interface TodaysWorkoutInput {
  goal: Goal;
  recentRaces: RecentRace[];
  weeklyMileage: number[]; // Last 12 weeks (most recent last)
  todayConstraints: TodayConstraints;
  lastLongRunMiles: number | null;
  terrain?: Terrain;
}

export interface WorkoutSegment {
  label: string; // e.g., "Easy", "Steady", "Progression"
  fromMile: number; // Inclusive
  toMile: number; // Inclusive
  paceRange: string; // e.g., "7:45–8:15/mi"
  notes: string; // Effort guidance
}

export interface TodaysWorkoutOutput {
  title: string;
  totalMiles: number;
  segments: WorkoutSegment[];
  rationale: string;
  guardrails: string[];
}
