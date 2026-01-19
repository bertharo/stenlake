import { DistanceUnit, metersToUnit } from "../units";

/**
 * Plan day structure
 */
export interface PlanDay {
  date: Date;
  type: "easy" | "long" | "tempo" | "interval" | "rest";
  miles: number; // Total miles for the day
  warmupMiles?: number;
  mainSet?: string; // e.g., "6x1000m @ 5:00/km"
  cooldownMiles?: number;
  paceRanges?: { min: number; max: number };
  notes?: string;
}

/**
 * Plan week structure
 */
export interface PlanWeek {
  weekNumber: number;
  totalMiles: number;
  days: PlanDay[];
}

/**
 * Full plan structure
 */
export interface PlanProvenance {
  engine: string;
  version: string;
  inputsUsed: string[];
  source: "strava" | "demo" | "conservative";
}

export interface TrainingPlan {
  meta: {
    goal: { distanceMeters: number; targetTimeSeconds: number; raceDate: Date };
    startDate: Date;
    assumptions: string[];
    fitnessSummary: {
      averageWeeklyMileage: number;
      peakWeeklyMileage: number;
      maxLongRunMeters: number;
    };
    provenance?: PlanProvenance; // Runtime tracing
  };
  weeks: PlanWeek[];
}

/**
 * Validation errors
 */
export interface ValidationError {
  type: string;
  message: string;
  week?: number;
  day?: number;
}

/**
 * DEPRECATED: This function is disabled. Use lib/planEngine/validatePlan() instead.
 * 
 * @deprecated Use lib/planEngine/validatePlan() instead
 */
export function validatePlan(plan: TrainingPlan, distanceUnit: DistanceUnit): {
  isValid: boolean;
  errors: ValidationError[];
} {
  // HARD DISABLED: This old validator is deprecated
  throw new Error(
    "lib/plan/validatePlan.ts::validatePlan is deprecated and disabled. " +
    "Use lib/planEngine/validatePlan() instead. " +
    "This old validator has been replaced by the canonical plan engine."
  );
  
  // OLD CODE (disabled - kept for reference):
  const _plan = plan as any;
  const _distanceUnit = distanceUnit as any;
  const errors: ValidationError[] = [];
  
  // Check each week
  plan.weeks.forEach((week, weekIdx) => {
    // 1. Check for negative miles
    week.days.forEach((day, dayIdx) => {
      if (day.type !== "rest" && day.miles < 0) {
        errors.push({
          type: "negative_miles",
          message: `Week ${week.weekNumber}, Day ${dayIdx + 1}: Negative miles (${day.miles})`,
          week: weekIdx,
          day: dayIdx,
        });
      }
      
      // 2. Check minimum distance for runs
      if (day.type !== "rest" && day.miles > 0 && day.miles < 2.0) {
        // Allow strides-only workouts (they should have warmup/cooldown totaling >= 2)
        const totalMiles = day.miles + (day.warmupMiles || 0) + (day.cooldownMiles || 0);
        if (totalMiles < 2.0) {
          errors.push({
            type: "too_short",
            message: `Week ${week.weekNumber}, Day ${dayIdx + 1}: Run too short (${day.miles.toFixed(2)} miles). Minimum is 2.0 miles.`,
            week: weekIdx,
            day: dayIdx,
          });
        }
      }
    });
    
    // 3. Check weekly total matches sum of days
    const sumOfDays = week.days.reduce((sum, day) => sum + day.miles, 0);
    const tolerance = 0.1; // Allow 0.1 mile tolerance for rounding
    if (Math.abs(week.totalMiles - sumOfDays) > tolerance) {
      errors.push({
        type: "weekly_total_mismatch",
        message: `Week ${week.weekNumber}: Total (${week.totalMiles.toFixed(2)}) doesn't match sum of days (${sumOfDays.toFixed(2)})`,
        week: weekIdx,
      });
    }
  });
  
  // 4. Check weekly progression (monotonic + cutback pattern)
  for (let i = 1; i < plan.weeks.length; i++) {
    const prevWeek = plan.weeks[i - 1];
    const currWeek = plan.weeks[i];
    
    // Check for excessive increase (> 8% per week, except cutback weeks)
    const increasePercent = (currWeek.totalMiles - prevWeek.totalMiles) / prevWeek.totalMiles;
    if (increasePercent > 0.08) {
      // Check if this is a cutback week (should be decreasing)
      if (currWeek.totalMiles >= prevWeek.totalMiles) {
        errors.push({
          type: "excessive_increase",
          message: `Week ${currWeek.weekNumber}: Increase of ${(increasePercent * 100).toFixed(1)}% exceeds 8% limit`,
          week: i,
        });
      }
    }
  }
  
  // 5. Check cutback pattern (every 3-4 weeks)
  let weeksSinceCutback = 0;
  for (let i = 1; i < plan.weeks.length; i++) {
    const prevWeek = plan.weeks[i - 1];
    const currWeek = plan.weeks[i];
    
    weeksSinceCutback++;
    
    // Cutback: 10-20% reduction
    const reductionPercent = (prevWeek.totalMiles - currWeek.totalMiles) / prevWeek.totalMiles;
    const isCutback = reductionPercent >= 0.10 && reductionPercent <= 0.20;
    
    if (isCutback) {
      weeksSinceCutback = 0;
    } else if (weeksSinceCutback >= 4) {
      // Should have had a cutback by now
      errors.push({
        type: "missing_cutback",
        message: `Week ${currWeek.weekNumber}: No cutback week in last ${weeksSinceCutback} weeks (should have cutback every 3-4 weeks)`,
        week: i,
      });
    }
  }
  
  // 6. Check pace ranges are sane
  plan.weeks.forEach((week, weekIdx) => {
    week.days.forEach((day, dayIdx) => {
      if (day.paceRanges && day.type !== "rest") {
        const { min, max } = day.paceRanges;
        
        // Check pace range is valid
        if (min <= 0 || max <= 0 || min > max) {
          errors.push({
            type: "invalid_pace_range",
            message: `Week ${week.weekNumber}, Day ${dayIdx + 1}: Invalid pace range (${min.toFixed(3)} - ${max.toFixed(3)} s/m)`,
            week: weekIdx,
            day: dayIdx,
          });
        }
        
        // Check pace is reasonable (0.2 to 1.0 seconds per meter = 3:20/km to 16:40/km)
        if (min < 0.2 || max > 1.0) {
          errors.push({
            type: "unreasonable_pace",
            message: `Week ${week.weekNumber}, Day ${dayIdx + 1}: Pace out of reasonable range`,
            week: weekIdx,
            day: dayIdx,
          });
        }
      }
    });
  });
  
  // 7. Check taper weeks (final 2-3 weeks should decrease)
  const taperStart = Math.max(0, plan.weeks.length - 3);
  for (let i = taperStart + 1; i < plan.weeks.length; i++) {
    const prevWeek = plan.weeks[i - 1];
    const currWeek = plan.weeks[i];
    
    if (currWeek.totalMiles > prevWeek.totalMiles * 1.05) {
      errors.push({
        type: "taper_violation",
        message: `Week ${currWeek.weekNumber}: Taper week should decrease volume, but increased`,
        week: i,
      });
    }
  }
  
  // 8. Check long run <= 35% of weekly mileage
  plan.weeks.forEach((week, weekIdx) => {
    const longRun = week.days.find((d) => d.type === "long");
    if (longRun && week.totalMiles > 0) {
      const longRunPercent = longRun.miles / week.totalMiles;
      if (longRunPercent > 0.35) {
        errors.push({
          type: "long_run_too_large",
          message: `Week ${week.weekNumber}: Long run (${longRun.miles.toFixed(2)} miles) is ${(longRunPercent * 100).toFixed(1)}% of weekly total (should be <= 35%)`,
          week: weekIdx,
        });
      }
    }
  });
  
  return {
    isValid: errors.length === 0,
    errors,
  };
}
