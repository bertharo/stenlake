/**
 * Chat Integration for Today's Workout Engine
 * 
 * Detects workout requests and generates workout recommendations.
 */

import { Activity, Goal } from "@prisma/client";
import { PreparedContext } from "../conversation";
import { TrainingSignals } from "../training";
import { generateTodaysWorkout, TodaysWorkoutInput, TodaysWorkoutOutput } from "./index";
import { metersToUnit, DistanceUnit } from "../units";

/**
 * Check if user message is asking for today's workout
 */
export function isWorkoutRequest(message: string): boolean {
  const lower = message.toLowerCase();
  const workoutKeywords = [
    "today's workout",
    "todays workout",
    "today workout",
    "what should i run today",
    "what should i do today",
    "today's long run",
    "todays long run",
    "long run today",
    "workout for today",
    "today's run",
    "todays run",
  ];
  
  return workoutKeywords.some((keyword) => lower.includes(keyword));
}

/**
 * Extract workout data from context and activities
 */
export function extractWorkoutInput(
  goal: Goal | null,
  activities: Activity[],
  context: PreparedContext,
  distanceUnit: DistanceUnit,
  signals?: TrainingSignals
): TodaysWorkoutInput | null {
  if (!goal) {
    return null; // Need a goal for workout generation
  }

  // Get last 12 weeks of mileage
  const weeklyMileage: number[] = [];
  
  // Prefer signals.weeklyMileage (has more weeks) over context
  if (signals && signals.weeklyMileage.length > 0) {
    signals.weeklyMileage.forEach((w) => {
      const miles = metersToUnit(w.mileageKm * 1000, distanceUnit);
      weeklyMileage.push(miles);
    });
  } else if (context.weeklyMileage.length > 0) {
    // Fallback to context (has last 4 weeks)
    context.weeklyMileage.forEach((w) => {
      const miles = metersToUnit(w.mileageKm * 1000, distanceUnit);
      weeklyMileage.push(miles);
    });
  }
  
  // Pad to 12 weeks if we have less (needed for engine)
  if (weeklyMileage.length > 0 && weeklyMileage.length < 12) {
    const lastValue = weeklyMileage[weeklyMileage.length - 1];
    while (weeklyMileage.length < 12) {
      weeklyMileage.unshift(Math.max(5, lastValue * 0.9)); // Slightly lower for earlier weeks, min 5 miles
    }
  }
  
  // Take last 12 weeks
  const finalWeeklyMileage = weeklyMileage.length > 12 
    ? weeklyMileage.slice(-12) 
    : weeklyMileage;

  // Extract recent races from activities (look for race-type activities or fast runs)
  const recentRaces: Array<{ type: "5K" | "10K" | "Half Marathon" | "Marathon"; time: string; date: string }> = [];
  
  // Check activities for race-like efforts (fast paces relative to distance)
  // For now, we'll use a simple heuristic: very fast runs might be races
  // In a real system, you'd tag activities as races or parse from names
  activities
    .filter((a) => {
      const daysAgo = (Date.now() - new Date(a.startDate).getTime()) / (1000 * 60 * 60 * 24);
      return daysAgo <= 90; // Last 90 days
    })
    .slice(0, 3)
    .forEach((activity) => {
      const distanceKm = activity.distanceMeters / 1000;
      const timeSeconds = activity.movingTimeSeconds;
      
      // Heuristic: if pace is very fast for the distance, might be a race
      // We'll keep this simple and just use best recent effort as proxy
      // Real implementation would parse activity names or have race flags
    });

  // If no races found but we have activities, estimate from goal or recent runs
  if (recentRaces.length === 0 && activities.length > 0) {
    // Use goal pace as a proxy if we have goal but no races
    // This is a fallback - real system would track actual race results
  }

  // Find last long run (longest run in last 2 weeks)
  const twoWeeksAgo = Date.now() - 14 * 24 * 60 * 60 * 1000;
  const recentLongRuns = activities
    .filter((a) => {
      const date = new Date(a.startDate);
      return date.getTime() >= twoWeeksAgo && a.distanceMeters > 8000; // > 8km = likely long run
    })
    .sort((a, b) => b.distanceMeters - a.distanceMeters);
  
  const lastLongRunMiles = recentLongRuns.length > 0
    ? metersToUnit(recentLongRuns[0].distanceMeters, distanceUnit)
    : null;

  // Detect hilly terrain (high elevation gain)
  const avgElevationGain = activities
    .slice(0, 10)
    .filter((a) => a.elevationGainMeters)
    .reduce((sum, a) => sum + (a.elevationGainMeters || 0), 0) / Math.max(1, activities.filter((a) => a.elevationGainMeters).length);
  
  const hilly = avgElevationGain > 100; // > 100m avg elevation gain = hilly

  // Parse goal
  const goalRace = goal.distance >= 42000 ? "Marathon" :
                   goal.distance >= 21000 ? "Half Marathon" :
                   goal.distance >= 10000 ? "10K" : "5K";
  
  const goalHours = Math.floor(goal.targetTimeSeconds / 3600);
  const goalMinutes = Math.floor((goal.targetTimeSeconds % 3600) / 60);
  const goalSeconds = goal.targetTimeSeconds % 60;
  const goalTimeStr = goalHours > 0
    ? `${goalHours}:${String(goalMinutes).padStart(2, "0")}:${String(goalSeconds).padStart(2, "0")}`
    : `${goalMinutes}:${String(goalSeconds).padStart(2, "0")}`;

  return {
    goal: {
      race: goalRace,
      targetTime: goalTimeStr,
      date: goal.raceDate.toISOString().split("T")[0],
    },
    recentRaces: recentRaces.length > 0 ? recentRaces : [], // Will use defaults if empty
    weeklyMileage: finalWeeklyMileage,
    todayConstraints: {
      mustBe: "long_run",
      timeLimited: false, // Could be detected from message
    },
    lastLongRunMiles,
    terrain: { hilly },
  };
}

/**
 * Format workout output for chat response
 */
export function formatWorkoutForChat(workout: TodaysWorkoutOutput): string {
  const parts: string[] = [];
  
  parts.push(`## ${workout.title}`);
  parts.push(`**${workout.totalMiles.toFixed(1)} miles total**\n`);
  
  parts.push("### Plan:");
  workout.segments.forEach((segment) => {
    parts.push(`- **Miles ${segment.fromMile}-${segment.toMile}: ${segment.label}** (${segment.paceRange})`);
    parts.push(`  ${segment.notes}`);
  });
  
  parts.push("\n### Rationale:");
  parts.push(workout.rationale);
  
  parts.push("\n### Safety notes:");
  workout.guardrails.forEach((guardrail) => {
    parts.push(`- ${guardrail}`);
  });
  
  return parts.join("\n");
}

/**
 * Generate and format today's workout for chat
 */
export function generateTodaysWorkoutForChat(
  goal: Goal | null,
  activities: Activity[],
  context: PreparedContext,
  distanceUnit: DistanceUnit,
  userMessage: string,
  signals?: TrainingSignals
): { message: string; workout: TodaysWorkoutOutput | null } | null {
  if (!isWorkoutRequest(userMessage)) {
    return null;
  }

  const input = extractWorkoutInput(goal, activities, context, distanceUnit, signals);
  if (!input) {
    return {
      message: "I'd love to give you a workout recommendation! First, please set a race goal in Settings.",
      workout: null,
    };
  }

  try {
    const workout = generateTodaysWorkout(input);
    const message = formatWorkoutForChat(workout);
    
    return { message, workout };
  } catch (error: any) {
    console.error("Error generating workout:", error);
    return {
      message: "I had trouble generating your workout. Please make sure you have recent training data and a race goal set.",
      workout: null,
    };
  }
}
