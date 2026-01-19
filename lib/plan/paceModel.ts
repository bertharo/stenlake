import { Goal } from "@prisma/client";
import { RecentFitness } from "../strava/computeRecentFitness";
import { DistanceUnit, formatPace } from "../units";

/**
 * Pace ranges for different workout types (seconds per meter)
 */
export interface PaceRanges {
  easy: { min: number; max: number };
  marathon: { min: number; max: number };
  tempo: { min: number; max: number };
  interval: { min: number; max: number };
}

/**
 * Compute pace ranges from RecentFitness and goal
 */
export function computePaceRanges(
  fitness: RecentFitness,
  goal: Goal,
  distanceUnit: DistanceUnit
): PaceRanges {
  const goalDistanceKm = goal.distance / 1000;
  const goalPaceSecondsPerMeter = goal.targetTimeSeconds / goal.distance;
  
  // Easy pace: use inferred range from fitness, or estimate from goal pace
  let easyMin: number;
  let easyMax: number;
  
  if (fitness.easyPaceRange.min > 0 && fitness.easyPaceRange.max > 0) {
    easyMin = fitness.easyPaceRange.min;
    easyMax = fitness.easyPaceRange.max;
  } else {
    // Estimate: easy is 15-25% slower than marathon pace
    easyMin = goalPaceSecondsPerMeter * 1.15;
    easyMax = goalPaceSecondsPerMeter * 1.25;
  }
  
  // Marathon pace: goal pace ± 2% (accounting for race day variance)
  const marathonMin = goalPaceSecondsPerMeter * 0.98;
  const marathonMax = goalPaceSecondsPerMeter * 1.02;
  
  // Tempo pace: threshold effort
  let tempoMin: number;
  let tempoMax: number;
  
  if (fitness.tempoPaceEstimate) {
    // Use detected tempo pace ± 3%
    tempoMin = fitness.tempoPaceEstimate * 0.97;
    tempoMax = fitness.tempoPaceEstimate * 1.03;
  } else {
    // Estimate: tempo is 5-10% faster than marathon pace
    if (goalDistanceKm >= 42) {
      // Marathon training: tempo at marathon pace to slightly faster
      tempoMin = goalPaceSecondsPerMeter * 0.98;
      tempoMax = goalPaceSecondsPerMeter * 1.0;
    } else {
      // Shorter distances: tempo at threshold (5-10% faster)
      tempoMin = goalPaceSecondsPerMeter * 0.90;
      tempoMax = goalPaceSecondsPerMeter * 0.95;
    }
  }
  
  // Interval pace: VO2 or faster
  let intervalMin: number;
  let intervalMax: number;
  
  if (fitness.vo2PaceEstimate) {
    // Use detected VO2 pace ± 5%
    intervalMin = fitness.vo2PaceEstimate * 0.95;
    intervalMax = fitness.vo2PaceEstimate * 1.05;
  } else {
    // Estimate: intervals are 15-20% faster than marathon pace
    intervalMin = goalPaceSecondsPerMeter * 0.80;
    intervalMax = goalPaceSecondsPerMeter * 0.85;
  }
  
  // Validate: easy must be slower than marathon, tempo faster than easy, interval fastest
  if (easyMin <= marathonMax) {
    easyMin = marathonMax * 1.05; // Ensure easy is slower
  }
  if (tempoMin <= easyMax) {
    tempoMin = easyMax * 0.95; // Ensure tempo is faster than easy
  }
  if (intervalMin <= tempoMax) {
    intervalMin = tempoMax * 0.90; // Ensure intervals are faster than tempo
  }
  
  const ranges = {
    easy: { min: easyMin, max: easyMax },
    marathon: { min: marathonMin, max: marathonMax },
    tempo: { min: tempoMin, max: tempoMax },
    interval: { min: intervalMin, max: intervalMax },
  };
  
  // INVARIANT: Never allow exactly 9:30/mi (570 seconds/mile = 0.354 s/m)
  // This is a bug detection mechanism
  const NINE_THIRTY_S_PER_M = 570 / 1609.34; // 0.354 s/m
  const TOLERANCE = 0.001; // Small tolerance for floating point
  
  // Debug logging (dev only)
  if (process.env.NODE_ENV === 'development') {
    console.log('[PACE DEBUG] Computed pace ranges:', {
      easy: `${formatPace(ranges.easy.min, distanceUnit)} - ${formatPace(ranges.easy.max, distanceUnit)}`,
      marathon: `${formatPace(ranges.marathon.min, distanceUnit)} - ${formatPace(ranges.marathon.max, distanceUnit)}`,
      tempo: `${formatPace(ranges.tempo.min, distanceUnit)} - ${formatPace(ranges.tempo.max, distanceUnit)}`,
      interval: `${formatPace(ranges.interval.min, distanceUnit)} - ${formatPace(ranges.interval.max, distanceUnit)}`,
      source: fitness.easyPaceRange.min > 0 ? 'fitness data' : 'goal pace estimate',
      stack: new Error().stack?.split('\n').slice(1, 4).join('\n'),
    });
  }
  
  Object.entries(ranges).forEach(([type, range]) => {
    const checkPace = (pace: number, typeName: string, minMax: string) => {
      if (Math.abs(pace - NINE_THIRTY_S_PER_M) < TOLERANCE) {
        const error = new Error(
          `BUG DETECTED: Pace equals exactly 9:30/mi (${pace.toFixed(6)} s/m) for ${typeName}.${minMax}. ` +
          `This should never happen - pace must be computed from goal or fitness data. ` +
          `Stack: ${new Error().stack}`
        );
        if (process.env.NODE_ENV === 'development') {
          throw error;
        } else {
          console.error(error);
        }
      }
    };
    checkPace(range.min, type, 'min');
    checkPace(range.max, type, 'max');
  });
  
  return ranges;
}

/**
 * Format pace range as string (e.g., "8:10-8:50/mi")
 */
export function formatPaceRange(range: { min: number; max: number }, distanceUnit: DistanceUnit): string {
  const minFormatted = formatPace(range.min, distanceUnit);
  const maxFormatted = formatPace(range.max, distanceUnit);
  return `${minFormatted} - ${maxFormatted}`;
}

/**
 * Get target pace for a workout type (returns midpoint of range)
 */
export function getTargetPace(ranges: PaceRanges, workoutType: "easy" | "long" | "tempo" | "interval"): number {
  switch (workoutType) {
    case "easy":
    case "long":
      return (ranges.easy.min + ranges.easy.max) / 2;
    case "tempo":
      return (ranges.tempo.min + ranges.tempo.max) / 2;
    case "interval":
      return (ranges.interval.min + ranges.interval.max) / 2;
  }
}
