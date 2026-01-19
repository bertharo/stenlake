import { Activity } from "@prisma/client";
import { DistanceUnit, metersToUnit } from "../units";

/**
 * RecentFitness: Canonical fitness profile computed from recent Strava runs
 * Based on last N days (default 42 days = 6 weeks)
 */
export interface RecentFitness {
  // Rolling weekly mileage (last 6 weeks)
  weeklyMileage: Array<{ week: string; mileageKm: number }>;
  
  // Long run distance (max in last 6 weeks)
  maxLongRunMeters: number;
  recentLongRuns: Array<{ date: Date; distanceMeters: number }>;
  
  // Pace estimates (seconds per meter)
  easyPaceRange: { min: number; max: number }; // Inferred from easy runs
  tempoPaceEstimate: number | null; // Threshold pace estimate
  vo2PaceEstimate: number | null; // From best 5K/10K effort if available
  
  // Fatigue/load proxy
  recentLoad: number; // TRIMP-like: sum(duration * intensityFactor)
  fatigueRisk: boolean;
  
  // Additional context
  recentRunCount: number;
  averageWeeklyMileage: number;
  peakWeeklyMileage: number; // Highest week in last 6 weeks
  assumptions: string[]; // What we assumed due to missing data
}

/**
 * Compute RecentFitness from activities (last N days, default 42)
 */
export function computeRecentFitness(
  activities: Activity[],
  daysBack: number = 42
): RecentFitness {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - daysBack);
  
  const recent = activities
    .filter((a) => new Date(a.startDate) >= cutoffDate)
    .filter((a) => a.distanceMeters > 0 && a.movingTimeSeconds > 0)
    .sort((a, b) => new Date(b.startDate).getTime() - new Date(a.startDate).getTime());
  
  const assumptions: string[] = [];
  
  if (recent.length === 0) {
    assumptions.push("No recent runs found - pace ranges will be computed from goal pace only");
    // Don't set default easy pace - let paceModel compute from goal pace
    return {
      weeklyMileage: [],
      maxLongRunMeters: 0,
      recentLongRuns: [],
      easyPaceRange: { min: 0, max: 0 }, // Signal to paceModel to use goal-based estimate
      tempoPaceEstimate: null,
      vo2PaceEstimate: null,
      recentLoad: 0,
      fatigueRisk: false,
      recentRunCount: 0,
      averageWeeklyMileage: 0,
      peakWeeklyMileage: 0,
      assumptions,
    };
  }
  
  // Compute weekly mileage (last 6 weeks)
  const weeklyMileage = computeWeeklyMileage(recent);
  
  // Long runs (runs >= 20% of weekly average or >= 10km)
  const avgWeeklyKm = weeklyMileage.length > 0
    ? weeklyMileage.reduce((sum, w) => sum + w.mileageKm, 0) / weeklyMileage.length
    : 0;
  const longRunThreshold = Math.max(avgWeeklyKm * 0.20, 10); // 20% of weekly or 10km min
  
  const longRuns = recent
    .filter((a) => a.distanceMeters / 1000 >= longRunThreshold)
    .map((a) => ({ date: new Date(a.startDate), distanceMeters: a.distanceMeters }))
    .sort((a, b) => b.distanceMeters - a.distanceMeters);
  
  const maxLongRunMeters = longRuns.length > 0 ? longRuns[0].distanceMeters : 0;
  
  // Compute pace estimates
  const medianPace = computeMedianPace(recent);
  const easyPaceRange = inferEasyPaceRange(recent, medianPace);
  const tempoPaceEstimate = estimateTempoPace(recent, medianPace);
  const vo2PaceEstimate = estimateVO2Pace(recent);
  
  // Compute load (TRIMP-like: duration * intensity factor)
  const recentLoad = computeLoad(recent, medianPace);
  
  // Fatigue risk: volume spike or too many hard runs
  const fatigueRisk = assessFatigueRisk(recent, weeklyMileage);
  
  // Peak weekly mileage
  const peakWeeklyMileage = weeklyMileage.length > 0
    ? Math.max(...weeklyMileage.map((w) => w.mileageKm))
    : 0;
  
  const averageWeeklyMileage = weeklyMileage.length > 0
    ? weeklyMileage.reduce((sum, w) => sum + w.mileageKm, 0) / weeklyMileage.length
    : 0;
  
  // Track assumptions
  if (tempoPaceEstimate === null) {
    assumptions.push("No tempo/threshold efforts detected - estimated from median pace");
  }
  if (vo2PaceEstimate === null) {
    assumptions.push("No 5K/10K race efforts found - VO2 pace not estimated");
  }
  if (longRuns.length === 0) {
    assumptions.push("No long runs detected in recent training");
  }
  
  return {
    weeklyMileage,
    maxLongRunMeters,
    recentLongRuns: longRuns.slice(0, 5), // Keep top 5
    easyPaceRange,
    tempoPaceEstimate,
    vo2PaceEstimate,
    recentLoad,
    fatigueRisk,
    recentRunCount: recent.length,
    averageWeeklyMileage,
    peakWeeklyMileage,
    assumptions,
  };
}

/**
 * Compute weekly mileage by ISO week
 */
function computeWeeklyMileage(activities: Activity[]): Array<{ week: string; mileageKm: number }> {
  const weeklyMap = new Map<string, number>();
  
  activities.forEach((a) => {
    const date = new Date(a.startDate);
    const week = getISOWeek(date);
    const km = a.distanceMeters / 1000;
    weeklyMap.set(week, (weeklyMap.get(week) || 0) + km);
  });
  
  return Array.from(weeklyMap.entries())
    .map(([week, mileageKm]) => ({ week, mileageKm }))
    .sort((a, b) => a.week.localeCompare(b.week));
}

/**
 * Get ISO week string (e.g., "2024-W50")
 */
function getISOWeek(date: Date): string {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, "0")}`;
}

/**
 * Compute median pace (seconds per meter)
 */
function computeMedianPace(activities: Activity[]): number {
  const validPaces = activities
    .map((a) => a.movingTimeSeconds / a.distanceMeters)
    .filter((p) => p > 0.2 && p < 1.0); // Reasonable range: 3:20/km to 16:40/km
  
  if (validPaces.length === 0) {
    return 0.36; // Default ~5:00/km
  }
  
  validPaces.sort((a, b) => a - b);
  return validPaces[Math.floor(validPaces.length / 2)];
}

/**
 * Infer easy pace range from easy runs (8-12% slower than median, or HR-based if available)
 */
function inferEasyPaceRange(activities: Activity[], medianPace: number): { min: number; max: number } {
  // Find easy runs: pace >= 8% slower than median, or HR < 75% max if available
  const easyRuns = activities.filter((a) => {
    const pace = a.movingTimeSeconds / a.distanceMeters;
    const paceDiff = (pace - medianPace) / medianPace;
    
    // If HR available, use HR-based classification
    if (a.avgHeartRate && a.avgHeartRate > 0) {
      // Assume max HR ~220 - age (rough estimate), or use HR < 150 as easy
      return a.avgHeartRate < 150 || paceDiff >= 0.08;
    }
    
    // Otherwise use pace-based: 8%+ slower than median
    return paceDiff >= 0.08;
  });
  
  if (easyRuns.length === 0) {
    // No easy runs detected, estimate from median
    return {
      min: medianPace * 1.08,
      max: medianPace * 1.12,
    };
  }
  
  const easyPaces = easyRuns.map((a) => a.movingTimeSeconds / a.distanceMeters);
  easyPaces.sort((a, b) => a - b);
  
  // Use 25th and 75th percentiles for range
  const p25 = easyPaces[Math.floor(easyPaces.length * 0.25)];
  const p75 = easyPaces[Math.floor(easyPaces.length * 0.75)];
  
  return {
    min: Math.max(p25, medianPace * 1.08), // At least 8% slower
    max: Math.min(p75, medianPace * 1.15), // Cap at 15% slower
  };
}

/**
 * Estimate tempo/threshold pace from recent runs
 * Look for sustained efforts at threshold intensity
 */
function estimateTempoPace(activities: Activity[], medianPace: number): number | null {
  // Find tempo runs: pace 0-8% faster than median, sustained effort (>= 15 min)
  const tempoRuns = activities.filter((a) => {
    const pace = a.movingTimeSeconds / a.distanceMeters;
    const paceDiff = (medianPace - pace) / medianPace;
    const durationMinutes = a.movingTimeSeconds / 60;
    
    // Tempo: 0-8% faster, sustained (>= 15 min)
    return paceDiff >= 0 && paceDiff <= 0.08 && durationMinutes >= 15;
  });
  
  if (tempoRuns.length === 0) {
    // Estimate from median: threshold is typically 5-8% faster than easy
    return medianPace * 0.92; // ~8% faster than median
  }
  
  // Use median of tempo runs
  const tempoPaces = tempoRuns.map((a) => a.movingTimeSeconds / a.distanceMeters);
  tempoPaces.sort((a, b) => a - b);
  return tempoPaces[Math.floor(tempoPaces.length / 2)];
}

/**
 * Estimate VO2 pace from best 5K/10K efforts
 */
function estimateVO2Pace(activities: Activity[]): number | null {
  // Look for runs in 5K-10K range (3-10km) that are fast (pace significantly faster than median)
  const medianPace = computeMedianPace(activities);
  
  const vo2Efforts = activities
    .filter((a) => {
      const distanceKm = a.distanceMeters / 1000;
      const pace = a.movingTimeSeconds / a.distanceMeters;
      const paceDiff = (medianPace - pace) / medianPace;
      
      // VO2 efforts: 3-10km, 10%+ faster than median
      return distanceKm >= 3 && distanceKm <= 10 && paceDiff >= 0.10;
    })
    .map((a) => ({ pace: a.movingTimeSeconds / a.distanceMeters, distanceKm: a.distanceMeters / 1000 }))
    .sort((a, b) => a.pace - b.pace); // Fastest first
  
  if (vo2Efforts.length === 0) {
    return null;
  }
  
  // Use fastest effort (best performance)
  return vo2Efforts[0].pace;
}

/**
 * Compute training load (TRIMP-like: duration * intensity factor)
 */
function computeLoad(activities: Activity[], medianPace: number): number {
  let totalLoad = 0;
  
  activities.forEach((a) => {
    const durationHours = a.movingTimeSeconds / 3600;
    const pace = a.movingTimeSeconds / a.distanceMeters;
    const paceDiff = (medianPace - pace) / medianPace;
    
    // Intensity factor: easy = 1.0, moderate = 1.5, hard = 2.0+
    let intensityFactor = 1.0;
    if (paceDiff >= 0.08) {
      intensityFactor = 1.0; // Easy
    } else if (paceDiff >= -0.08) {
      intensityFactor = 1.5; // Moderate/threshold
    } else {
      intensityFactor = 2.0 + Math.abs(paceDiff) * 5; // Hard/VO2
    }
    
    totalLoad += durationHours * intensityFactor;
  });
  
  return totalLoad;
}

/**
 * Assess fatigue risk: volume spike or too many hard runs
 */
function assessFatigueRisk(
  activities: Activity[],
  weeklyMileage: Array<{ week: string; mileageKm: number }>
): boolean {
  // Check for volume spike (last week > 25% more than previous)
  if (weeklyMileage.length >= 2) {
    const last = weeklyMileage[weeklyMileage.length - 1].mileageKm;
    const prev = weeklyMileage[weeklyMileage.length - 2].mileageKm;
    if (last > prev * 1.25) {
      return true;
    }
  }
  
  // Check for 2+ hard runs in 4 days
  const now = new Date();
  const fourDaysAgo = new Date(now.getTime() - 4 * 24 * 60 * 60 * 1000);
  const recent = activities.filter((a) => new Date(a.startDate) >= fourDaysAgo);
  
  const medianPace = computeMedianPace(activities);
  const hardRuns = recent.filter((a) => {
    const pace = a.movingTimeSeconds / a.distanceMeters;
    const paceDiff = (medianPace - pace) / medianPace;
    return paceDiff <= -0.08; // 8%+ faster = hard
  });
  
  return hardRuns.length >= 2;
}
