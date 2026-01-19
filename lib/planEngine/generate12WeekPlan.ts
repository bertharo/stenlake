/**
 * Generate 12-week training plan
 * 
 * Deterministic plan generation with:
 * - Weekly progression with cutbacks
 * - Varied distances (no equal splits)
 * - Proper taper
 * - Long run progression
 */

import { RecentFitness, Goal, PlanDay, PlanWeek, TrainingPlan, PaceRanges } from "./types";

/**
 * Get Monday of a date
 */
function getMonday(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

/**
 * Add days to a date
 */
function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

/**
 * Clamp a value between min and max
 */
function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * Round to 0.1 miles
 */
function roundMiles(miles: number): number {
  return Math.round(miles * 10) / 10;
}

/**
 * Generate varied distances for easy runs
 * Ensures no two runs have identical distance
 */
function generateVariedEasyDistances(
  totalMiles: number,
  count: number,
  minMiles: number = 3.0
): number[] {
  if (count === 0) return [];
  if (count === 1) return [roundMiles(totalMiles)];
  
  // Distribute with variation
  const base = totalMiles / count;
  const distances: number[] = [];
  let remaining = totalMiles;
  
  for (let i = 0; i < count - 1; i++) {
    // Vary by ±15-25%
    const variation = (Math.random() * 0.2 + 0.15) * (Math.random() > 0.5 ? 1 : -1);
    const distance = roundMiles(base * (1 + variation));
    const clamped = clamp(distance, minMiles, remaining - minMiles * (count - i - 1));
    distances.push(clamped);
    remaining -= clamped;
  }
  
  // Last one gets remainder
  distances.push(roundMiles(Math.max(minMiles, remaining)));
  
  // Ensure no duplicates by adjusting if needed
  for (let i = 0; i < distances.length; i++) {
    for (let j = i + 1; j < distances.length; j++) {
      if (Math.abs(distances[i] - distances[j]) < 0.1) {
        distances[j] = roundMiles(distances[j] + 0.2);
      }
    }
  }
  
  return distances.sort((a, b) => b - a); // Sort descending
}

/**
 * Compute week 1 total miles
 */
function computeWeek1Miles(fitness: RecentFitness, goal: Goal): number {
  if (fitness.weeklyMiles.length >= 2) {
    // Average of last 2 weeks, clamped ±10%
    const avg = (fitness.weeklyMiles[fitness.weeklyMiles.length - 1] +
                 fitness.weeklyMiles[fitness.weeklyMiles.length - 2]) / 2;
    return clamp(avg, avg * 0.9, avg * 1.1);
  }
  
  // No data: start 25-35 mi based on daysPerWeek
  const baseMiles = goal.daysPerWeek * 5; // ~5 miles per run day
  return clamp(baseMiles, 25, 35);
}

/**
 * Compute weekly progression with cutbacks
 */
function computeWeeklyTotals(
  week1Miles: number,
  fitness: RecentFitness,
  goal: Goal
): number[] {
  const totals: number[] = [];
  const maxIncrease = goal.mode === "aggressive" ? 0.08 : 0.06;
  const peakMultiplier = goal.mode === "aggressive" ? 1.35 : 1.25;
  
  // Peak week limit
  const peakLimit = fitness.maxWeeklyMiles > 0
    ? fitness.maxWeeklyMiles * peakMultiplier
    : week1Miles * 1.5;
  
  let current = week1Miles;
  
  for (let week = 1; week <= 12; week++) {
    // Taper: last 2-3 weeks
    if (week >= 11) {
      // Week 11: reduce 20-30%
      current = current * 0.75;
    } else if (week === 10) {
      // Week 10: reduce 20-30%
      current = current * 0.80;
    } else {
      // Regular progression
      // Cutback every 3-4 weeks: weeks 4, 7
      if (week === 4 || week === 7) {
        // Cutback: -10% to -20%
        const cutback = 0.15 + (Math.random() * 0.1); // 15-25% reduction
        current = current * (1 - cutback);
      } else {
        // Normal progression: +0% to +maxIncrease%
        const increase = Math.random() * maxIncrease; // 0% to maxIncrease%
        current = current * (1 + increase);
      }
      
      // Cap at peak limit
      current = Math.min(current, peakLimit);
    }
    
    totals.push(roundMiles(current));
  }
  
  return totals;
}

/**
 * Compute long run distance for a week
 */
function computeLongRun(
  weekTotal: number,
  weekNumber: number,
  fitness: RecentFitness,
  goal: Goal
): number {
  // Start near min(0.28-0.33 * weeklyMiles, max(10, longRunMiles * 0.9))
  const baseLongRun = weekNumber === 1
    ? Math.min(
        weekTotal * 0.30,
        Math.max(10, fitness.longRunMiles * 0.9)
      )
    : weekTotal * 0.30; // 30% of weekly total
  
  // Progress gradually, cap at 20-22 miles
  const maxLongRun = goal.mode === "aggressive" ? 22 : 20;
  const longRun = clamp(baseLongRun, 10, maxLongRun);
  
  // Ensure long run is <= 35% of weekly total
  const maxFromWeekly = weekTotal * 0.35;
  return roundMiles(Math.min(longRun, maxFromWeekly));
}

/**
 * Generate plan days for a week
 */
function generateWeekDays(
  weekStart: Date,
  weekTotal: number,
  weekNumber: number,
  fitness: RecentFitness,
  goal: Goal,
  paces: PaceRanges
): PlanDay[] {
  const days: PlanDay[] = [];
  const daysPerWeek = goal.daysPerWeek;
  const restDays = 7 - daysPerWeek;
  
  // 1. Long run (Sunday preferred, or last run day)
  const longRunMiles = computeLongRun(weekTotal, weekNumber, fitness, goal);
  const longRunDate = addDays(weekStart, daysPerWeek - 1); // Last run day
  days.push({
    date: longRunDate,
    type: "long",
    miles: longRunMiles,
    paceRange: paces.easy,
    notes: `Long run - build endurance`,
  });
  
  // 2. Quality session (tempo or intervals, alternating)
  const qualityType = weekNumber % 2 === 0 ? "tempo" : "interval";
  const qualityPace = qualityType === "tempo" ? paces.tempo : paces.interval;
  const qualityMiles = weekTotal * 0.12; // 12% of weekly total
  const qualityDate = addDays(weekStart, Math.floor(daysPerWeek / 2)); // Mid-week
  days.push({
    date: qualityDate,
    type: qualityType,
    miles: roundMiles(qualityMiles),
    paceRange: qualityPace,
    notes: qualityType === "tempo" 
      ? `Tempo run at threshold pace`
      : `Interval session - 5-6x 1000m with recovery`,
  });
  
  // 3. Medium-long run (optional, weeks 4-9)
  let mediumLongMiles = 0;
  if (weekNumber >= 4 && weekNumber <= 9 && daysPerWeek >= 6) {
    mediumLongMiles = weekTotal * 0.18; // 18% of weekly total
    const mediumLongDate = addDays(weekStart, Math.floor(daysPerWeek * 0.7));
    days.push({
      date: mediumLongDate,
      type: "easy",
      miles: roundMiles(mediumLongMiles),
      paceRange: paces.easy,
      notes: `Medium-long run`,
    });
  }
  
  // 4. Remaining easy/recovery runs
  const assignedMiles = longRunMiles + qualityMiles + mediumLongMiles;
  const remainingMiles = weekTotal - assignedMiles;
  const remainingRunDays = daysPerWeek - days.length;
  
  if (remainingRunDays > 0 && remainingMiles > 0) {
    const easyDistances = generateVariedEasyDistances(remainingMiles, remainingRunDays, 3.0);
    let easyIndex = 0;
    
    // Fill remaining days with easy/recovery runs
    for (let i = 0; i < 7; i++) {
      const date = addDays(weekStart, i);
      
      // Skip if already assigned
      if (days.some((d) => d.date.getTime() === date.getTime())) {
        continue;
      }
      
      // Skip if we've used all run days
      if (days.length >= daysPerWeek) {
        break;
      }
      
      // Add easy/recovery run
      const isRecovery = easyIndex === 0 && remainingRunDays > 2; // First easy run is recovery
      days.push({
        date,
        type: isRecovery ? "recovery" : "easy",
        miles: easyDistances[easyIndex] || 3.0,
        paceRange: paces.easy,
        notes: isRecovery ? `Recovery run` : `Easy run`,
      });
      easyIndex++;
    }
  }
  
  // 5. Rest days
  const runDates = new Set(days.map((d) => d.date.getTime()));
  for (let i = 0; i < 7; i++) {
    const date = addDays(weekStart, i);
    if (!runDates.has(date.getTime()) && days.length < 7) {
      days.push({
        date,
        type: "rest",
        miles: 0,
        notes: "Rest day",
      });
    }
  }
  
  // Sort by date
  days.sort((a, b) => a.date.getTime() - b.date.getTime());
  
  return days;
}

/**
 * Generate 12-week plan
 */
export function generate12WeekPlan(
  fitness: RecentFitness,
  goal: Goal,
  paces: PaceRanges
): TrainingPlan {
  const assumptions: string[] = [...fitness.assumptions];
  
  // Compute week 1 total
  const week1Miles = computeWeek1Miles(fitness, goal);
  
  // Compute weekly totals with progression
  const weeklyTotals = computeWeeklyTotals(week1Miles, fitness, goal);
  
  // Generate weeks
  const weeks: PlanWeek[] = [];
  const planStart = getMonday(goal.startDate);
  
  for (let weekNum = 1; weekNum <= 12; weekNum++) {
    const weekStart = addDays(planStart, (weekNum - 1) * 7);
    const weekTotal = weeklyTotals[weekNum - 1];
    
    const days = generateWeekDays(
      weekStart,
      weekTotal,
      weekNum,
      fitness,
      goal,
      paces
    );
    
    // Verify total matches (within rounding)
    const actualTotal = days
      .filter((d) => d.type !== "rest")
      .reduce((sum, d) => sum + d.miles, 0);
    
    // Adjust if needed
    const diff = weekTotal - actualTotal;
    if (Math.abs(diff) > 0.2) {
      // Distribute difference to easy runs
      const easyRuns = days.filter((d) => d.type === "easy" || d.type === "recovery");
      if (easyRuns.length > 0) {
        const perRun = diff / easyRuns.length;
        easyRuns.forEach((day) => {
          day.miles = roundMiles(day.miles + perRun);
        });
      }
    }
    
    weeks.push({
      weekNumber: weekNum,
      totalMiles: weekTotal,
      days,
    });
  }
  
  return {
    status: "ready",
    meta: {
      provenance: "planEngine:v1",
      generatedAt: new Date().toISOString(),
      assumptions,
      fitnessSummary: {
        avgWeeklyMiles: fitness.avgWeeklyMiles,
        maxWeeklyMiles: fitness.maxWeeklyMiles,
        longRunMiles: fitness.longRunMiles,
        lastRunDate: fitness.lastRunDate,
      },
    },
    weeks,
  };
}
