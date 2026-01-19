/**
 * Compute RecentFitness from Strava activities
 * 
 * Converts activities to miles and computes fitness metrics
 * for the last 6 weeks (42 days).
 */

import { Activity } from "@prisma/client";
import { RecentFitness } from "./types";

const METERS_PER_MILE = 1609.34;
const SECONDS_PER_MINUTE = 60;

/**
 * Convert Prisma Activity to StravaActivity format
 */
function normalizeActivity(activity: Activity): {
  startDate: Date;
  distanceMeters: number;
  movingTimeSec: number;
  avgHr?: number;
  distanceMiles: number;
  paceSecPerMile: number;
} {
  const distanceMiles = activity.distanceMeters / METERS_PER_MILE;
  const paceSecPerMile = activity.movingTimeSeconds / distanceMiles;
  
  return {
    startDate: new Date(activity.startDate),
    distanceMeters: activity.distanceMeters,
    movingTimeSec: activity.movingTimeSeconds,
    avgHr: activity.avgHeartRate || undefined,
    distanceMiles,
    paceSecPerMile: distanceMiles > 0 ? paceSecPerMile : 0,
  };
}

/**
 * Get calendar week start (Monday) for a date
 */
function getWeekStart(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Monday
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

/**
 * Compute weekly miles for last 6 calendar weeks ending this week
 */
function computeWeeklyMiles(
  activities: Activity[],
  windowDays: number = 42
): number[] {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - windowDays);
  cutoff.setHours(0, 0, 0, 0);
  
  const recent = activities
    .filter((a) => new Date(a.startDate) >= cutoff)
    .map(normalizeActivity);
  
  if (recent.length === 0) {
    return [];
  }
  
  // Group by week (Monday to Sunday)
  const weekMap = new Map<string, number>();
  
  recent.forEach((a) => {
    const weekStart = getWeekStart(a.startDate);
    const weekKey = weekStart.toISOString().split('T')[0];
    weekMap.set(weekKey, (weekMap.get(weekKey) || 0) + a.distanceMiles);
  });
  
  // Get last 6 weeks ending this week
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const thisWeekStart = getWeekStart(today);
  
  const weeklyMiles: number[] = [];
  for (let i = 5; i >= 0; i--) {
    const weekStart = new Date(thisWeekStart);
    weekStart.setDate(weekStart.getDate() - (i * 7));
    const weekKey = weekStart.toISOString().split('T')[0];
    weeklyMiles.push(weekMap.get(weekKey) || 0);
  }
  
  return weeklyMiles;
}

/**
 * Compute long run miles (max single run in last 6 weeks)
 */
function computeLongRunMiles(activities: Activity[], windowDays: number = 42): number {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - windowDays);
  
  const recent = activities
    .filter((a) => new Date(a.startDate) >= cutoff)
    .map(normalizeActivity);
  
  if (recent.length === 0) {
    return 0;
  }
  
  const maxRun = Math.max(...recent.map((a) => a.distanceMiles));
  return maxRun;
}

/**
 * Compute easy pace range from easy runs
 * Easy runs: pace >= 8% slower than median, or HR < 75% max if available
 */
function computeEasyPaceRange(
  activities: Activity[],
  windowDays: number = 42,
  goalMarathonPaceSecPerMile?: number
): [number, number] {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - windowDays);
  
  const recent = activities
    .filter((a) => new Date(a.startDate) >= cutoff)
    .map(normalizeActivity);
  
  if (recent.length === 0) {
    // No data: use goal pace + 60-120s heuristic
    if (goalMarathonPaceSecPerMile) {
      return [
        goalMarathonPaceSecPerMile + 60,
        goalMarathonPaceSecPerMile + 120,
      ];
    }
    // Fallback: assume 8:00/mile easy pace
    return [480, 540]; // 8:00-9:00/mile
  }
  
  // Compute median pace
  const paces = recent.map((a) => a.paceSecPerMile).sort((a, b) => a - b);
  const medianPace = paces[Math.floor(paces.length / 2)];
  
  // Find easy runs: pace >= 8% slower than median, or HR < 150 if available
  const easyRuns = recent.filter((a) => {
    const paceDiff = (a.paceSecPerMile - medianPace) / medianPace;
    if (a.avgHr && a.avgHr > 0) {
      return a.avgHr < 150 || paceDiff >= 0.08;
    }
    return paceDiff >= 0.08;
  });
  
  if (easyRuns.length === 0) {
    // No easy runs detected: estimate from median (8-12% slower)
    return [
      medianPace * 1.08,
      medianPace * 1.12,
    ];
  }
  
  // Use 25th and 75th percentiles of easy runs
  const easyPaces = easyRuns.map((a) => a.paceSecPerMile).sort((a, b) => a - b);
  const p25 = easyPaces[Math.floor(easyPaces.length * 0.25)];
  const p75 = easyPaces[Math.floor(easyPaces.length * 0.75)];
  
  return [
    Math.max(p25, medianPace * 1.08), // At least 8% slower
    Math.min(p75, medianPace * 1.15), // Cap at 15% slower
  ];
}

/**
 * Estimate threshold/tempo pace
 */
function estimateThresholdPace(
  activities: Activity[],
  windowDays: number = 42,
  medianPace?: number
): number | null {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - windowDays);
  
  const recent = activities
    .filter((a) => new Date(a.startDate) >= cutoff)
    .map(normalizeActivity);
  
  if (recent.length === 0) {
    return null;
  }
  
  const paces = recent.map((a) => a.paceSecPerMile).sort((a, b) => a - b);
  const medPace = medianPace || paces[Math.floor(paces.length / 2)];
  
  // Find tempo runs: pace 0-8% faster than median, sustained (>= 15 min)
  const tempoRuns = recent.filter((a) => {
    const paceDiff = (medPace - a.paceSecPerMile) / medPace;
    const durationMin = a.movingTimeSec / SECONDS_PER_MINUTE;
    return paceDiff >= 0 && paceDiff <= 0.08 && durationMin >= 15;
  });
  
  if (tempoRuns.length === 0) {
    // Estimate: threshold is typically 5-8% faster than easy
    return medPace * 0.92;
  }
  
  const tempoPaces = tempoRuns.map((a) => a.paceSecPerMile).sort((a, b) => a - b);
  return tempoPaces[Math.floor(tempoPaces.length / 2)];
}

/**
 * Estimate VO2 pace from best 5K/10K efforts
 */
function estimateVO2Pace(activities: Activity[], windowDays: number = 42): number | null {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - windowDays);
  
  const recent = activities
    .filter((a) => new Date(a.startDate) >= cutoff)
    .map(normalizeActivity);
  
  if (recent.length === 0) {
    return null;
  }
  
  const paces = recent.map((a) => a.paceSecPerMile).sort((a, b) => a - b);
  const medianPace = paces[Math.floor(paces.length / 2)];
  
  // Find VO2 efforts: 3-10km (1.86-6.21 miles), 10%+ faster than median
  const vo2Efforts = recent
    .filter((a) => {
      const distanceMiles = a.distanceMiles;
      const paceDiff = (medianPace - a.paceSecPerMile) / medianPace;
      return distanceMiles >= 1.86 && distanceMiles <= 6.21 && paceDiff >= 0.10;
    })
    .map((a) => a.paceSecPerMile)
    .sort((a, b) => a - b); // Fastest first
  
  if (vo2Efforts.length === 0) {
    return null;
  }
  
  return vo2Efforts[0]; // Use fastest effort
}

/**
 * Main function: Compute RecentFitness from activities
 */
export function computeRecentFitness(
  activities: Activity[],
  windowDays: number = 42,
  goalMarathonPaceSecPerMile?: number
): RecentFitness {
  const assumptions: string[] = [];
  
  // Compute weekly miles
  const weeklyMiles = computeWeeklyMiles(activities, windowDays);
  
  if (weeklyMiles.length === 0 || weeklyMiles.every((m) => m === 0)) {
    assumptions.push("No recent runs found - using conservative defaults");
    return {
      windowDays,
      weeklyMiles: [],
      avgWeeklyMiles: 0,
      maxWeeklyMiles: 0,
      longRunMiles: 0,
      easyPaceRangeSecPerMile: goalMarathonPaceSecPerMile
        ? [goalMarathonPaceSecPerMile + 60, goalMarathonPaceSecPerMile + 120]
        : [480, 540], // 8:00-9:00/mile default
      thresholdPaceSecPerMile: null,
      vo2PaceSecPerMile: null,
      lastRunDate: null,
      assumptions,
    };
  }
  
  const avgWeeklyMiles = weeklyMiles.reduce((sum, m) => sum + m, 0) / weeklyMiles.length;
  const maxWeeklyMiles = Math.max(...weeklyMiles);
  const longRunMiles = computeLongRunMiles(activities, windowDays);
  
  // Compute paces
  const easyPaceRange = computeEasyPaceRange(activities, windowDays, goalMarathonPaceSecPerMile);
  
  // Get median pace for threshold/VO2 estimation
  const recent = activities
    .filter((a) => {
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - windowDays);
      return new Date(a.startDate) >= cutoff;
    })
    .map(normalizeActivity);
  const paces = recent.map((a) => a.paceSecPerMile).sort((a, b) => a - b);
  const medianPace = paces[Math.floor(paces.length / 2)];
  
  const thresholdPace = estimateThresholdPace(activities, windowDays, medianPace);
  const vo2Pace = estimateVO2Pace(activities, windowDays);
  
  // Last run date
  const lastRun = activities
    .filter((a) => a.distanceMeters > 0)
    .sort((a, b) => new Date(b.startDate).getTime() - new Date(a.startDate).getTime())[0];
  const lastRunDate = lastRun ? new Date(lastRun.startDate).toISOString().split('T')[0] : null;
  
  // Track assumptions
  if (thresholdPace === null) {
    assumptions.push("No tempo/threshold efforts detected - estimated from median pace");
  }
  if (vo2Pace === null) {
    assumptions.push("No 5K/10K race efforts found - VO2 pace not estimated");
  }
  if (longRunMiles === 0) {
    assumptions.push("No long runs detected in recent training");
  }
  
  return {
    windowDays,
    weeklyMiles,
    avgWeeklyMiles,
    maxWeeklyMiles,
    longRunMiles,
    easyPaceRangeSecPerMile: easyPaceRange,
    thresholdPaceSecPerMile: thresholdPace,
    vo2PaceSecPerMile: vo2Pace,
    lastRunDate,
    assumptions,
  };
}
