/**
 * Pace computation helpers
 * 
 * Converts race times to training pace ranges.
 */

import { RecentRace } from "./types";

/**
 * Parse time string (e.g., "1:29:00") to total seconds
 */
export function parseTime(timeStr: string): number {
  const parts = timeStr.split(":").map(Number);
  if (parts.length === 2) {
    // MM:SS format
    return parts[0] * 60 + parts[1];
  } else if (parts.length === 3) {
    // HH:MM:SS format
    return parts[0] * 3600 + parts[1] * 60 + parts[2];
  }
  throw new Error(`Invalid time format: ${timeStr}`);
}

/**
 * Format seconds per mile to pace string (e.g., "7:45/mi")
 */
export function formatPace(secPerMile: number): string {
  const minutes = Math.floor(secPerMile / 60);
  const seconds = Math.floor(secPerMile % 60);
  return `${minutes}:${String(seconds).padStart(2, "0")}/mi`;
}

/**
 * Format pace range (e.g., "7:45–8:15/mi")
 */
export function formatPaceRange(minSecPerMile: number, maxSecPerMile: number): string {
  return `${formatPace(minSecPerMile)}–${formatPace(maxSecPerMile)}`;
}

/**
 * Get race distance in miles
 */
function getRaceDistanceMiles(raceType: RecentRace["type"]): number {
  switch (raceType) {
    case "5K":
      return 3.10686;
    case "10K":
      return 6.21371;
    case "Half Marathon":
      return 13.109375;
    case "Marathon":
      return 26.21875;
  }
}

/**
 * Estimate pace ranges from recent race performance
 */
export interface PaceEstimates {
  easy: { min: number; max: number }; // seconds per mile
  steady: { min: number; max: number };
  threshold: { min: number; max: number };
  marathon: { min: number; max: number } | null; // null if no marathon data
}

/**
 * Compute pace estimates from recent race results
 * 
 * Uses best recent race to estimate training paces:
 * - Easy: 20-30% slower than threshold pace
 * - Steady: 8-15% slower than threshold pace (comfortably hard)
 * - Threshold: Based on half marathon pace (close to HM pace)
 * - Marathon: Only if we have marathon data
 */
export function computePaceEstimates(recentRaces: RecentRace[]): PaceEstimates {
  if (recentRaces.length === 0) {
    // Conservative defaults if no race data
    return {
      easy: { min: 8 * 60 + 0, max: 9 * 60 + 0 }, // 8:00-9:00/mi
      steady: { min: 7 * 60 + 15, max: 7 * 60 + 45 }, // 7:15-7:45/mi
      threshold: { min: 6 * 60 + 45, max: 7 * 60 + 15 }, // 6:45-7:15/mi
      marathon: null,
    };
  }

  // Use best recent race (fastest pace)
  let bestPaceSecPerMile = Infinity;
  let marathonPaceSecPerMile: number | null = null;

  for (const race of recentRaces) {
    const distanceMiles = getRaceDistanceMiles(race.type);
    const timeSeconds = parseTime(race.time);
    const paceSecPerMile = timeSeconds / distanceMiles;

    if (paceSecPerMile < bestPaceSecPerMile) {
      bestPaceSecPerMile = paceSecPerMile;
    }

    if (race.type === "Marathon") {
      marathonPaceSecPerMile = paceSecPerMile;
    }
  }

  // Use half marathon as proxy for threshold if available
  // Otherwise use best race pace adjusted
  let thresholdBase = bestPaceSecPerMile;
  const halfMarathon = recentRaces.find((r) => r.type === "Half Marathon");
  if (halfMarathon) {
    const hmTime = parseTime(halfMarathon.time);
    thresholdBase = hmTime / 13.109375; // Half marathon distance in miles
  }

  // Threshold: very close to HM pace (±2%)
  const thresholdMin = thresholdBase * 0.98;
  const thresholdMax = thresholdBase * 1.02;

  // Steady: 8-15% slower than threshold (comfortably hard, not threshold)
  const steadyMin = thresholdBase * 1.08;
  const steadyMax = thresholdBase * 1.15;

  // Easy: 20-30% slower than threshold
  const easyMin = thresholdBase * 1.20;
  const easyMax = thresholdBase * 1.30;

  return {
    easy: { min: easyMin, max: easyMax },
    steady: { min: steadyMin, max: steadyMax },
    threshold: { min: thresholdMin, max: thresholdMax },
    marathon: marathonPaceSecPerMile
      ? {
          min: marathonPaceSecPerMile * 0.98,
          max: marathonPaceSecPerMile * 1.02,
        }
      : null,
  };
}
