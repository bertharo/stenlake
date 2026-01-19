import { Goal, Activity } from "@prisma/client";
import { RecentFitness, computeRecentFitness } from "../strava/computeRecentFitness";
import { PaceRanges, computePaceRanges, formatPaceRange, getTargetPace } from "./paceModel";
import { validatePlan, TrainingPlan, PlanWeek, PlanDay } from "./validatePlan";
import { DistanceUnit, metersToUnit, unitToMeters } from "../units";

export interface PlanGenerationOptions {
  goal: Goal;
  activities: Activity[];
  distanceUnit: DistanceUnit;
  aggressiveMode?: boolean; // Allow more aggressive volume increases
}

/**
 * DEPRECATED: This function is disabled. Use lib/planEngine/getTrainingPlan() instead.
 * 
 * @deprecated Use lib/planEngine/getTrainingPlan() instead
 */
export function generateMarathonPlan(options: PlanGenerationOptions): {
  plan: TrainingPlan;
  validationErrors: string[];
} {
  // HARD DISABLED: This old generator is deprecated
  throw new Error(
    "lib/plan/generatePlan.ts::generateMarathonPlan is deprecated and disabled. " +
    "Use lib/planEngine/getTrainingPlan() instead. " +
    "This old generator has been replaced by the canonical plan engine."
  );
  
  // OLD CODE (disabled - kept for reference):
  const { goal, activities, distanceUnit, aggressiveMode = false } = options as any;
  
  // Compute recent fitness (last 42 days = 6 weeks)
  const fitness = computeRecentFitness(activities, 42);
  
  // Compute pace ranges
  const paceRanges = computePaceRanges(fitness, goal, distanceUnit);
  
  // Calculate weeks until race
  const now = new Date();
  const weeksUntilRace = Math.max(1, Math.ceil((goal.raceDate.getTime() - now.getTime()) / (7 * 24 * 60 * 60 * 1000)));
  
  // Limit to 12 weeks max
  const planWeeks = Math.min(weeksUntilRace, 12);
  
  // Determine starting weekly mileage
  const last2Weeks = fitness.weeklyMileage.slice(-2);
  const avgLast2Weeks = last2Weeks.length > 0
    ? last2Weeks.reduce((sum, w) => sum + w.mileageKm, 0) / last2Weeks.length
    : fitness.averageWeeklyMileage;
  
  // Start week: clamp to within +/-10% of last 2-week avg
  let startWeeklyMileage = Math.max(
    avgLast2Weeks * 0.9,
    Math.min(avgLast2Weeks * 1.1, fitness.averageWeeklyMileage || 30)
  );
  
  // Ensure minimum reasonable mileage
  startWeeklyMileage = Math.max(startWeeklyMileage, 20); // At least 20km/week
  
  // Determine peak weekly mileage
  // Peak <= 1.25x user's highest week unless aggressive mode
  const peakMultiplier = aggressiveMode ? 1.5 : 1.25;
  let peakWeeklyMileage = Math.max(
    fitness.peakWeeklyMileage * peakMultiplier,
    startWeeklyMileage * 1.3 // At least 30% increase from start
  );
  
  // Cap peak based on goal distance
  const goalDistanceKm = goal.distance / 1000;
  if (goalDistanceKm >= 42) {
    // Marathon: peak at 50-120km/week depending on goal pace
    const goalPaceMinPerKm = (goal.targetTimeSeconds / goal.distance) * 1000 / 60;
    if (goalPaceMinPerKm <= 4.0) {
      peakWeeklyMileage = Math.min(peakWeeklyMileage, 120); // Fast: up to 120km
    } else if (goalPaceMinPerKm <= 5.0) {
      peakWeeklyMileage = Math.min(peakWeeklyMileage, 100); // Moderate: up to 100km
    } else {
      peakWeeklyMileage = Math.min(peakWeeklyMileage, 80); // Slower: up to 80km
    }
  } else {
    peakWeeklyMileage = Math.min(peakWeeklyMileage, 60); // Shorter distances
  }
  
  // Generate weekly mileage progression
  const weeklyMileageProgression = generateWeeklyProgression(
    startWeeklyMileage,
    peakWeeklyMileage,
    planWeeks
  );
  
  // Generate plan weeks
  const weeks: PlanWeek[] = [];
  const startDate = getNextMonday(now);
  
  for (let weekNum = 0; weekNum < planWeeks; weekNum++) {
    const weekStartDate = new Date(startDate);
    weekStartDate.setDate(weekStartDate.getDate() + weekNum * 7);
    
    const targetWeeklyMiles = metersToUnit(weeklyMileageProgression[weekNum] * 1000, distanceUnit);
    
    const week = generateWeek(
      weekNum + 1,
      weekStartDate,
      targetWeeklyMiles,
      fitness,
      paceRanges,
      distanceUnit,
      goalDistanceKm >= 42,
      weekNum >= planWeeks - 3 // Taper weeks
    );
    
    weeks.push(week);
  }
  
  // Build plan with provenance
  const plan: TrainingPlan = {
    meta: {
      goal: {
        distanceMeters: goal.distance,
        targetTimeSeconds: goal.targetTimeSeconds,
        raceDate: goal.raceDate,
      },
      startDate,
      assumptions: fitness.assumptions,
      fitnessSummary: {
        averageWeeklyMileage: fitness.averageWeeklyMileage,
        peakWeeklyMileage: fitness.peakWeeklyMileage,
        maxLongRunMeters: fitness.maxLongRunMeters,
      },
      provenance: {
        engine: "planEngine",
        version: "v1",
        inputsUsed: activities.length > 0 
          ? [`strava:last42days:${activities.length}runs`, `goal:${goal.distance / 1000}km:${Math.round(goal.targetTimeSeconds / 60)}min`]
          : [`noActivities`, `goal:${goal.distance / 1000}km:${Math.round(goal.targetTimeSeconds / 60)}min`],
        source: activities.length > 0 ? "strava" : "conservative",
      },
    },
    weeks,
  };
  
  // Validate plan
  const validation = validatePlan(plan, distanceUnit);
  
  // If invalid, try to fix (up to 3 attempts)
  let fixedPlan = plan;
  let attempts = 0;
  const maxAttempts = 3;
  
  while (!validation.isValid && attempts < maxAttempts) {
    attempts++;
    fixedPlan = fixPlan(fixedPlan, validation.errors, distanceUnit);
    const newValidation = validatePlan(fixedPlan, distanceUnit);
    
    if (newValidation.isValid) {
      return { plan: fixedPlan, validationErrors: [] };
    }
    
    // Update validation for next iteration
    validation.isValid = newValidation.isValid;
    validation.errors = newValidation.errors;
  }
  
  // If still invalid after attempts, return conservative plan
  if (!validation.isValid) {
    return {
      plan: generateConservativePlan(goal, fitness, distanceUnit, startDate, paceRanges),
      validationErrors: validation.errors.map((e) => e.message),
    };
  }
  
  return { plan, validationErrors: [] };
}

/**
 * Generate weekly mileage progression with cutback weeks
 */
function generateWeeklyProgression(
  startMileage: number,
  peakMileage: number,
  totalWeeks: number
): number[] {
  const progression: number[] = [];
  
  // Build-up weeks (excluding taper)
  const buildWeeks = totalWeeks - 3; // Last 3 weeks are taper
  const weeksToBuild = Math.max(1, buildWeeks);
  
  // Calculate base increase per week (max 8%)
  const totalIncrease = peakMileage - startMileage;
  const weeklyIncrease = totalIncrease / weeksToBuild;
  const weeklyIncreasePercent = weeklyIncrease / startMileage;
  
  // Cap at 8% per week
  const cappedWeeklyIncrease = Math.min(weeklyIncreasePercent, 0.08) * startMileage;
  
  let currentMileage = startMileage;
  let weeksSinceCutback = 0;
  
  for (let i = 0; i < buildWeeks; i++) {
    weeksSinceCutback++;
    
    // Cutback every 3-4 weeks
    if (weeksSinceCutback >= 3 && i < buildWeeks - 1) {
      // Cutback: reduce by 15%
      currentMileage *= 0.85;
      weeksSinceCutback = 0;
    } else {
      // Normal week: increase
      currentMileage += cappedWeeklyIncrease;
      currentMileage = Math.min(currentMileage, peakMileage);
    }
    
    progression.push(currentMileage);
  }
  
  // Taper weeks (last 3 weeks)
  if (buildWeeks > 0) {
    const peak = progression[progression.length - 1];
    progression.push(peak * 0.7); // Week before race: 70%
    progression.push(peak * 0.5); // Race week: 50%
    progression.push(peak * 0.3); // Post-race recovery: 30%
  }
  
  return progression;
}

/**
 * Generate a single week of the plan
 */
function generateWeek(
  weekNumber: number,
  weekStartDate: Date,
  targetWeeklyMiles: number,
  fitness: RecentFitness,
  paceRanges: PaceRanges,
  distanceUnit: DistanceUnit,
  isMarathon: boolean,
  isTaper: boolean
): PlanWeek {
  const days: PlanDay[] = [];
  
  // Determine run frequency (4-7 runs/week based on mileage)
  let runsPerWeek: number;
  if (targetWeeklyMiles < 20) {
    runsPerWeek = 4;
  } else if (targetWeeklyMiles < 30) {
    runsPerWeek = 5;
  } else if (targetWeeklyMiles < 50) {
    runsPerWeek = 6;
  } else {
    runsPerWeek = 7;
  }
  
  // Adjust for fatigue
  if (fitness.fatigueRisk && weekNumber === 1) {
    runsPerWeek = Math.max(3, runsPerWeek - 1);
  }
  
  // Adjust for taper
  if (isTaper) {
    runsPerWeek = Math.max(3, runsPerWeek - 1);
  }
  
  const restDays = 7 - runsPerWeek;
  
  // Place rest days (avoid Monday)
  const restIndices = new Set<number>();
  for (let i = 0; i < restDays; i++) {
    let idx;
    do {
      idx = Math.floor(Math.random() * 7);
    } while (restIndices.has(idx) || (i === 0 && idx === 0));
    restIndices.add(idx);
  }
  
  // Calculate long run distance (25-30% of weekly, max 35%)
  const longRunMiles = Math.min(
    targetWeeklyMiles * 0.30,
    metersToUnit(fitness.maxLongRunMeters, distanceUnit) * 1.1 // Don't exceed recent max by more than 10%
  );
  const longRunMilesFinal = Math.max(longRunMiles, 8); // Minimum 8 miles
  
  // Quality workout distance (15-20% of weekly, minimum 3 miles including warmup/cooldown)
  const qualityMiles = Math.max(targetWeeklyMiles * 0.15, 3.0);
  
  // Remaining miles for easy runs
  const easyRunMiles = Math.max(0, targetWeeklyMiles - longRunMilesFinal - qualityMiles);
  const easyRunsCount = runsPerWeek - 2; // Long run + quality + easy runs
  let easyRunDistance = easyRunsCount > 0 ? easyRunMiles / easyRunsCount : 0;
  
  // Ensure minimum 2.0 miles per easy run
  if (easyRunDistance > 0 && easyRunDistance < 2.0) {
    // Redistribute to ensure minimums
    const minTotalForEasyRuns = 2.0 * easyRunsCount;
    if (minTotalForEasyRuns <= targetWeeklyMiles - longRunMilesFinal - qualityMiles) {
      easyRunDistance = 2.0;
    } else {
      // Can't afford minimums - reduce quality or long run slightly
      easyRunDistance = Math.max(easyRunDistance, 2.0);
    }
  }
  
  // Generate days
  let longRunPlaced = false;
  let qualityPlaced = false;
  let runCount = 0;
  
  for (let i = 0; i < 7; i++) {
    const date = new Date(weekStartDate);
    date.setDate(date.getDate() + i);
    
    if (restIndices.has(i)) {
      days.push({
        date,
        type: "rest",
        miles: 0,
        notes: "Rest day - recovery is important",
      });
    } else {
      runCount++;
      let day: PlanDay;
      
      // Long run (once per week, weekend preferred)
      if (!longRunPlaced && (i >= 5 || runCount === runsPerWeek)) {
        day = {
          date,
          type: "long",
          miles: longRunMilesFinal,
          paceRanges: paceRanges.easy,
          notes: `Long run - build endurance. Target pace: ${formatPaceRange(paceRanges.easy, distanceUnit)}`,
        };
        longRunPlaced = true;
      }
      // Quality workout (tempo or interval, once per week if not taper)
      else if (!qualityPlaced && !isTaper && runCount >= 2 && runCount <= 4) {
        const isTempoWeek = weekNumber % 2 === 0;
        if (isTempoWeek || isMarathon) {
          day = {
            date,
            type: "tempo",
            miles: qualityMiles,
            warmupMiles: 1.5,
            mainSet: `20-30 min at tempo pace`,
            cooldownMiles: 1.5,
            paceRanges: paceRanges.tempo,
            notes: `Tempo run at threshold pace: ${formatPaceRange(paceRanges.tempo, distanceUnit)}`,
          };
        } else {
          day = {
            date,
            type: "interval",
            miles: qualityMiles,
            warmupMiles: 1.5,
            mainSet: `6-8x 800-1000m at interval pace with 2min recovery`,
            cooldownMiles: 1.5,
            paceRanges: paceRanges.interval,
            notes: `Interval session: ${formatPaceRange(paceRanges.interval, distanceUnit)}`,
          };
        }
        qualityPlaced = true;
      }
      // Easy run
      else {
        const easyMiles = Math.max(easyRunDistance, 2.0); // Minimum 2.0 miles
        day = {
          date,
          type: "easy",
          miles: easyMiles,
          paceRanges: paceRanges.easy,
          notes: `Easy recovery run. Target pace: ${formatPaceRange(paceRanges.easy, distanceUnit)}`,
        };
      }
      
      days.push(day);
    }
  }
  
  // Calculate actual total
  const totalMiles = days.reduce((sum, d) => sum + d.miles, 0);
  
  return {
    weekNumber,
    totalMiles,
    days,
  };
}

/**
 * Fix plan based on validation errors (simplified - would be more sophisticated in production)
 */
function fixPlan(plan: TrainingPlan, errors: any[], distanceUnit: DistanceUnit): TrainingPlan {
  // Simple fixes: ensure no negative miles, minimum distances
  const fixedWeeks = plan.weeks.map((week) => ({
    ...week,
    days: week.days.map((day) => {
      if (day.type !== "rest" && day.miles < 2.0) {
        return { ...day, miles: 2.0 };
      }
      if (day.miles < 0) {
        return { ...day, miles: 0, type: "rest" as const };
      }
      return day;
    }),
  }));
  
  // Recalculate totals
  const fixedWeeksWithTotals = fixedWeeks.map((week) => ({
    ...week,
    totalMiles: week.days.reduce((sum, d) => sum + d.miles, 0),
  }));
  
  return {
    ...plan,
    weeks: fixedWeeksWithTotals,
  };
}

/**
 * Generate conservative fallback plan
 * FIXED: Now produces varied runs, not identical templates
 */
function generateConservativePlan(
  goal: Goal,
  fitness: RecentFitness,
  distanceUnit: DistanceUnit,
  startDate: Date,
  paceRanges: PaceRanges
): TrainingPlan {
  const startMileage = Math.max(fitness.averageWeeklyMileage || 30, 20);
  const weeks: PlanWeek[] = [];
  const goalDistanceKm = goal.distance / 1000;
  
  for (let i = 0; i < 12; i++) {
    const weekStart = new Date(startDate);
    weekStart.setDate(weekStart.getDate() + i * 7);
    
    const days: PlanDay[] = [];
    
    // Vary run distribution: 4 runs per week with different distances
    const runDistances = [
      startMileage * 0.15, // Short easy
      startMileage * 0.25, // Medium easy  
      startMileage * 0.30, // Long run
      startMileage * 0.30, // Another medium
    ];
    
    let runIdx = 0;
    for (let j = 0; j < 7; j++) {
      const date = new Date(weekStart);
      date.setDate(date.getDate() + j);
      
      if (j === 0 || j === 3 || j === 6) {
        // Rest days
        days.push({ date, type: "rest", miles: 0 });
      } else {
        // Vary run types and distances
        let type: "easy" | "long" | "tempo" | "interval" = "easy";
        let notes = "";
        
        if (runIdx === 2) {
          // Long run
          type = "long";
          notes = `Long run - build endurance for ${goalDistanceKm}km race`;
        } else if (runIdx === 1 && i % 2 === 0) {
          // Tempo run every other week
          type = "tempo";
          notes = `Tempo run at threshold pace`;
        } else {
          type = "easy";
          notes = `Easy recovery run`;
        }
        
        days.push({
          date,
          type,
          miles: Math.max(runDistances[runIdx], 2.0), // Minimum 2 miles
          paceRanges: type === "easy" || type === "long" 
            ? paceRanges.easy 
            : type === "tempo" 
            ? paceRanges.tempo 
            : paceRanges.interval,
          notes,
        });
        runIdx++;
      }
    }
    
    const totalMiles = days.reduce((sum, d) => sum + d.miles, 0);
    
    weeks.push({
      weekNumber: i + 1,
      totalMiles,
      days,
    });
  }
  
  return {
    meta: {
      goal: {
        distanceMeters: goal.distance,
        targetTimeSeconds: goal.targetTimeSeconds,
        raceDate: goal.raceDate,
      },
      startDate,
      assumptions: [...fitness.assumptions, "Using conservative fallback plan due to validation errors"],
      fitnessSummary: {
        averageWeeklyMileage: fitness.averageWeeklyMileage,
        peakWeeklyMileage: fitness.peakWeeklyMileage,
        maxLongRunMeters: fitness.maxLongRunMeters,
      },
      provenance: {
        engine: "planEngine",
        version: "v1",
        inputsUsed: ["conservativeFallback"],
        source: "conservative",
      },
    },
    weeks,
  };
}

/**
 * Get next Monday
 */
function getNextMonday(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  return new Date(d.setDate(diff));
}
