/**
 * Validate training plan
 * 
 * Checks:
 * - No negative miles
 * - Run days have miles >= 2.0
 * - Weekly totals match sum of days (within 0.2 mi)
 * - Non-taper weeks have >=1 long and >=1 quality
 * - No >2 run days with identical miles AND paceRange
 */

import { TrainingPlan, PlanDay } from "./types";

export interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Check if two pace ranges are identical (within tolerance)
 */
function paceRangesEqual(
  a: [number, number] | undefined,
  b: [number, number] | undefined
): boolean {
  if (!a || !b) return false;
  const tolerance = 5; // 5 seconds
  return Math.abs(a[0] - b[0]) < tolerance && Math.abs(a[1] - b[1]) < tolerance;
}

/**
 * Validate a single plan day
 */
function validateDay(day: PlanDay, dayIndex: number): string[] {
  const errors: string[] = [];
  
  if (day.miles < 0) {
    errors.push(`Day ${dayIndex + 1} (${day.date.toISOString().split('T')[0]}): Negative miles (${day.miles})`);
  }
  
  if (day.type !== "rest" && day.miles < 2.0) {
    errors.push(`Day ${dayIndex + 1} (${day.date.toISOString().split('T')[0]}): Run day has miles < 2.0 (${day.miles})`);
  }
  
  if (day.type === "rest" && day.miles > 0) {
    errors.push(`Day ${dayIndex + 1} (${day.date.toISOString().split('T')[0]}): Rest day has miles > 0 (${day.miles})`);
  }
  
  return errors;
}

/**
 * Validate a single week
 */
function validateWeek(
  week: { weekNumber: number; totalMiles: number; days: PlanDay[] },
  isTaper: boolean
): string[] {
  const errors: string[] = [];
  const warnings: string[] = [];
  
  // Check each day
  week.days.forEach((day, idx) => {
    errors.push(...validateDay(day, idx));
  });
  
  // Check weekly total matches sum of days
  const runDays = week.days.filter((d) => d.type !== "rest");
  const actualTotal = runDays.reduce((sum, d) => sum + d.miles, 0);
  const diff = Math.abs(week.totalMiles - actualTotal);
  
  if (diff > 0.2) {
    errors.push(
      `Week ${week.weekNumber}: Total miles (${week.totalMiles}) doesn't match sum of days (${actualTotal.toFixed(1)}, diff: ${diff.toFixed(1)} mi)`
    );
  }
  
  // Non-taper weeks must have >=1 long and >=1 quality
  if (!isTaper) {
    const hasLong = runDays.some((d) => d.type === "long");
    const hasQuality = runDays.some((d) => d.type === "tempo" || d.type === "interval");
    
    if (!hasLong) {
      errors.push(`Week ${week.weekNumber}: Missing long run (non-taper week)`);
    }
    
    if (!hasQuality) {
      errors.push(`Week ${week.weekNumber}: Missing quality session (tempo/interval)`);
    }
  }
  
  // Guardrail: Check for >2 run days with identical miles AND paceRange
  const runDayGroups = new Map<string, PlanDay[]>();
  
  runDays.forEach((day) => {
    const key = `${day.miles.toFixed(1)}_${day.paceRange ? `${day.paceRange[0]}-${day.paceRange[1]}` : 'none'}`;
    if (!runDayGroups.has(key)) {
      runDayGroups.set(key, []);
    }
    runDayGroups.get(key)!.push(day);
  });
  
  runDayGroups.forEach((days, key) => {
    if (days.length > 2) {
      // Check if they have identical pace ranges
      const firstPace = days[0].paceRange;
      const allSamePace = days.every((d) => paceRangesEqual(d.paceRange, firstPace));
      
      if (allSamePace) {
        errors.push(
          `Week ${week.weekNumber}: ${days.length} run days have identical miles (${days[0].miles} mi) and pace range - INVALID (must vary)`
        );
      }
    }
  });
  
  return errors;
}

/**
 * Validate entire training plan
 */
export function validatePlan(plan: TrainingPlan): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  
  if (plan.status !== "ready") {
    return {
      isValid: false,
      errors: ["Plan status is not 'ready'"],
      warnings: [],
    };
  }
  
  if (plan.weeks.length === 0) {
    return {
      isValid: false,
      errors: ["Plan has no weeks"],
      warnings: [],
    };
  }
  
  // Validate each week
  plan.weeks.forEach((week) => {
    const isTaper = week.weekNumber >= 10; // Last 3 weeks are taper
    errors.push(...validateWeek(week, isTaper));
  });
  
  // Check for overall issues
  if (plan.weeks.length < 12) {
    warnings.push(`Plan has only ${plan.weeks.length} weeks (expected 12)`);
  }
  
  return {
    isValid: errors.length === 0,
    errors,
    warnings,
  };
}
