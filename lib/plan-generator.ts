import { Goal, Activity } from "@prisma/client";
import { TrainingSignals } from "./training";
import { formatDistance, formatPace, metersToUnit, DistanceUnit } from "./units";

export interface PlanGenerationOptions {
  goal: Goal;
  signals: TrainingSignals;
  activities: Activity[];
  distanceUnit: DistanceUnit;
}

/**
 * Generate a goal-based weekly training plan
 * Takes into account:
 * - Race distance and target time
 * - Weeks until race
 * - Current fitness level (from recent runs)
 * - Progressive build-up
 */
export function generateGoalBasedPlan(options: PlanGenerationOptions): {
  startDate: Date;
  items: Array<{
    date: Date;
    type: "easy" | "long" | "tempo" | "interval" | "rest";
    distanceMeters: number | null;
    notes: string;
    targetPace: number | null;
  }>;
  weeklyMileage: number;
  weeklyMileageProgression: Array<{ week: number; mileageKm: number }>;
  rationale: string;
} {
  const { goal, signals, activities, distanceUnit } = options;
  
  // Calculate weeks until race
  const now = new Date();
  const weeksUntilRace = Math.max(1, Math.ceil((goal.raceDate.getTime() - now.getTime()) / (7 * 24 * 60 * 60 * 1000)));
  
  // Get current fitness baseline
  const currentWeeklyMileage = signals.weeklyMileage.length > 0
    ? signals.weeklyMileage[signals.weeklyMileage.length - 1].mileageKm
    : signals.lastWeekStats?.totalMileageKm || 0;
  
  // Calculate target weekly mileage based on race distance and weeks remaining
  const goalDistanceKm = goal.distance / 1000;
  const targetPaceSecondsPerMeter = goal.targetTimeSeconds / goal.distance;
  const targetPaceKm = targetPaceSecondsPerMeter * 1000;
  
  // Progressive build-up: start at current level, build to peak 2-3 weeks before race
  const peakWeek = Math.max(weeksUntilRace - 2, 1);
  const buildUpWeeks = peakWeek;
  
  // Target peak weekly mileage: scale based on race distance and goal pace
  // More realistic approach: base on race distance with pace-based adjustments
  let peakWeeklyMileage: number;
  if (goalDistanceKm >= 42) {
    // Marathon: base mileage on race distance, adjust for goal pace
    // Slower goals need less volume, faster goals need more
    const goalPaceMinPerKm = targetPaceKm / 60;
    const baseMileage = goalDistanceKm * 1.5; // Base: 1.5x race distance
    
    // Adjust based on pace: faster = more volume needed
    // For 5:00/km (4:20 marathon) or slower: 1.5x base
    // For 4:00/km (2:48 marathon): 2.0x base
    // Linear interpolation between these points
    let paceMultiplier = 1.5;
    if (goalPaceMinPerKm <= 4.0) {
      paceMultiplier = 2.0; // Very fast: need high volume
    } else if (goalPaceMinPerKm <= 5.0) {
      // Linear between 4:00/km and 5:00/km
      paceMultiplier = 1.5 + (5.0 - goalPaceMinPerKm) * 0.5; // 1.5 to 2.0
    }
    
    peakWeeklyMileage = Math.max(baseMileage * paceMultiplier, 50); // Minimum 50km
    peakWeeklyMileage = Math.min(peakWeeklyMileage, 120); // Cap at 120km for safety
  } else if (goalDistanceKm >= 21) {
    // Half marathon: peak at 40-60km/week
    peakWeeklyMileage = Math.max(goalDistanceKm * 2, 40);
  } else {
    // Shorter distances: peak at 30-50km/week
    peakWeeklyMileage = Math.max(goalDistanceKm * 2.5, 30);
  }
  
  // Cap peak based on current fitness, but allow more aggressive builds for ambitious goals
  // For very fast goals (sub-3:00 marathon), allow up to 30% increase per week if needed
  const goalPaceMinPerKm = targetPaceKm / 60;
  const isAmbitiousGoal = goalDistanceKm >= 42 && goalPaceMinPerKm < 4.5; // Sub-3:09 marathon
  
  // Calculate ideal peak first (before any capping)
  const idealPeak = goalDistanceKm >= 42 
    ? (goalPaceMinPerKm <= 4.0 ? goalDistanceKm * 2.2 : goalPaceMinPerKm <= 4.5 ? goalDistanceKm * 2.0 : goalDistanceKm * 1.5)
    : goalDistanceKm >= 21 ? goalDistanceKm * 2 : goalDistanceKm * 2.5;
  const idealPeakKm = Math.max(idealPeak, goalDistanceKm >= 42 ? 50 : 30);
  const idealPeakCapped = Math.min(idealPeakKm, 120);
  
  let maxSafeIncrease: number;
  if (currentWeeklyMileage > 0) {
    // Allow more aggressive builds for ambitious goals
    const weeklyIncreasePercent = isAmbitiousGoal ? 0.15 : 0.12; // 15% for ambitious, 12% for others
    const weeksToBuild = Math.min(buildUpWeeks, 12); // Allow up to 12 weeks to build
    maxSafeIncrease = currentWeeklyMileage * Math.pow(1 + weeklyIncreasePercent, weeksToBuild);
    
    // But don't let it go below a reasonable minimum based on goal (use ideal peak, not capped peak)
    const minRequiredForGoal = isAmbitiousGoal 
      ? idealPeakCapped * 0.7  // For ambitious goals, allow up to 70% of ideal peak
      : idealPeakCapped * 0.5;  // For others, 50% of ideal peak
    maxSafeIncrease = Math.max(maxSafeIncrease, minRequiredForGoal);
  } else {
    // If no recent runs, start conservatively but still respect goal requirements
    maxSafeIncrease = idealPeakCapped * (isAmbitiousGoal ? 0.6 : 0.5);
  }
  
  // Set peak to ideal, but cap if it's way beyond what's achievable
  peakWeeklyMileage = idealPeakCapped;
  
  // Only cap if the calculated peak is way beyond what's achievable
  // For ambitious goals, be more lenient
  if (peakWeeklyMileage > maxSafeIncrease * 1.5 && !isAmbitiousGoal) {
    peakWeeklyMileage = maxSafeIncrease;
  } else if (peakWeeklyMileage > maxSafeIncrease * 2.0) {
    // Even for ambitious goals, don't go more than 2x what's achievable
    peakWeeklyMileage = maxSafeIncrease;
  }
  
  // This week's target mileage (progressive build)
  // Build more gradually: 10-15% increase per week is safer
  const weeksIntoBuild = Math.min(buildUpWeeks, 6); // Allow up to 6 weeks of build
  const safeWeeklyIncreasePercent = 0.12; // 12% per week is safer than 20%
  const weeklyIncrease = Math.max(
    currentWeeklyMileage * safeWeeklyIncreasePercent,
    (peakWeeklyMileage - currentWeeklyMileage) / Math.max(weeksIntoBuild, 1)
  );
  
  const targetWeeklyMileage = Math.min(
    currentWeeklyMileage + (weeklyIncrease * Math.min(weeksIntoBuild, 4)), // Build over 4 weeks max
    peakWeeklyMileage
  );
  
  // Ensure minimum reasonable mileage
  const minWeeklyMileage = goalDistanceKm >= 42 ? 30 : 20;
  const finalTargetMileage = Math.max(targetWeeklyMileage, minWeeklyMileage);
  
  // Determine run frequency (4-7 runs/week based on mileage)
  // Scale with weekly mileage, but be realistic
  let runsPerWeek: number;
  if (finalTargetMileage < 30) {
    runsPerWeek = 4;
  } else if (finalTargetMileage < 50) {
    runsPerWeek = 5;
  } else if (finalTargetMileage < 70) {
    runsPerWeek = 6;
  } else {
    runsPerWeek = 7; // High volume marathon training
  }
  
  // Adjust for fatigue
  if (signals.fatigueRisk) {
    runsPerWeek = Math.max(3, runsPerWeek - 1);
  }
  
  // Get Monday of current week
  const getMonday = (date: Date): Date => {
    const d = new Date(date);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    return new Date(d.setDate(diff));
  };
  
  const monday = getMonday(now);
  const startDate = monday < now ? new Date(monday.getTime() + 7 * 24 * 60 * 60 * 1000) : monday;
  startDate.setHours(0, 0, 0, 0);
  
  // Generate plan for ALL weeks until race
  const items: Array<{
    date: Date;
    type: "easy" | "long" | "tempo" | "interval" | "rest";
    distanceMeters: number | null;
    notes: string;
    targetPace: number | null;
  }> = [];
  
  // Calculate weekly mileage progression for all weeks
  const weeklyMileageProgression: Array<{ week: number; mileageKm: number }> = [];
  
  // Generate plan for each week
  for (let weekNum = 0; weekNum < weeksUntilRace; weekNum++) {
    // Calculate target mileage for this week (progressive build)
    const weeksIntoBuild = Math.min(weekNum + 1, buildUpWeeks);
    const weeklyIncrease = (peakWeeklyMileage - currentWeeklyMileage) / Math.max(buildUpWeeks, 1);
    const weekTargetMileage = Math.min(
      currentWeeklyMileage + (weeklyIncrease * weeksIntoBuild),
      peakWeeklyMileage
    );
    const weekFinalMileage = Math.max(weekTargetMileage, minWeeklyMileage);
    
    // Taper in final 2 weeks
    let finalWeekMileage = weekFinalMileage;
    if (weekNum >= weeksUntilRace - 2) {
      // Taper: 70% of peak in week before race, 50% in race week
      if (weekNum === weeksUntilRace - 2) {
        finalWeekMileage = peakWeeklyMileage * 0.7;
      } else {
        finalWeekMileage = peakWeeklyMileage * 0.5;
      }
    }
    
    weeklyMileageProgression.push({
      week: weekNum + 1,
      mileageKm: finalWeekMileage,
    });
    
    // Determine run frequency for this week
    let weekRunsPerWeek: number;
    if (finalWeekMileage < 30) {
      weekRunsPerWeek = 4;
    } else if (finalWeekMileage < 50) {
      weekRunsPerWeek = 5;
    } else if (finalWeekMileage < 70) {
      weekRunsPerWeek = 6;
    } else {
      weekRunsPerWeek = 7;
    }
    
    // Adjust for fatigue in early weeks
    if (weekNum === 0 && signals.fatigueRisk) {
      weekRunsPerWeek = Math.max(3, weekRunsPerWeek - 1);
    }
    
    // Calculate week start date
    const weekStartDate = new Date(startDate);
    weekStartDate.setDate(weekStartDate.getDate() + (weekNum * 7));
    weekStartDate.setHours(0, 0, 0, 0);
    
    const days: Date[] = [];
    for (let i = 0; i < 7; i++) {
      const day = new Date(weekStartDate);
      day.setDate(day.getDate() + i);
      days.push(day);
    }
  
    // Place rest days for this week
    const restDays = 7 - weekRunsPerWeek;
    const restIndices = new Set<number>();
    for (let i = 0; i < restDays; i++) {
      let idx;
      do {
        idx = Math.floor(Math.random() * 7);
      } while (restIndices.has(idx) || (i === 0 && idx === 0)); // Don't put rest on Monday
      restIndices.add(idx);
    }
    
    // Calculate paces (all in seconds per meter for storage)
    // medianPace is already in seconds per meter
    // Validate median pace is reasonable (between 0.2 and 1.0 seconds per meter = 3:20/km to 16:40/km)
    const validatedMedianPace = signals.medianPace > 0 && signals.medianPace < 1.0 
      ? signals.medianPace 
      : 0.36; // Default to ~5:00/km if median pace is invalid
    const easyPace = validatedMedianPace * 1.08; // 8% slower than median
    
    // Tempo pace: for marathon training, tempo is at or slightly faster than goal pace
    // For shorter distances, tempo is faster (threshold pace)
    let tempoPace: number;
    if (goalDistanceKm >= 42) {
      // Marathon: tempo runs at goal pace to slightly faster (0-3% faster)
      tempoPace = targetPaceSecondsPerMeter * 0.98; // 2% faster than goal pace
    } else {
      // Shorter distances: tempo at threshold (5-10% faster than goal pace)
      tempoPace = targetPaceSecondsPerMeter * 0.92; // 8% faster
    }
    
    // Interval pace: much faster for speed work (15-20% faster than goal pace)
    const intervalPace = targetPaceSecondsPerMeter * 0.85;
    
    // Assign runs for this week
    let runCount = 0;
    let longRunPlaced = false;
    let qualityPlaced = false;
    const hasQuality = !signals.fatigueRisk && (weeksUntilRace - weekNum) > 2; // No quality in final 2 weeks
    
    // Track distances assigned in this week to prevent negative calculations
    let totalDistanceAssignedThisWeek = 0;
  
    for (let i = 0; i < 7; i++) {
      if (restIndices.has(i)) {
        items.push({
          date: days[i],
          type: "rest",
          distanceMeters: null,
          notes: "Rest day - recovery is important",
          targetPace: null,
        });
      } else {
        runCount++;
        let type: "easy" | "long" | "tempo" | "interval" = "easy";
        let distanceMeters: number = 0;
        let notes = "";
        let targetPace: number | null = null;
        
        // Long run (once per week, weekend preferred)
        if (!longRunPlaced && (i >= 5 || runCount === weekRunsPerWeek)) {
          type = "long";
          // Long run: 25-30% of weekly mileage, with reasonable minimums
          if (goalDistanceKm >= 42) {
            // Marathon: long runs should be 25-30% of weekly, but scale with fitness
            const longRunPercent = finalWeekMileage >= 80 ? 0.30 : 0.25;
            const baseLongRun = finalWeekMileage * 1000 * longRunPercent;
            
            // Minimum based on goal pace: slower goals need less
            const goalPaceMinPerKm = targetPaceKm / 60;
            // Convert to meters: 20mi = 32,187m, 15mi = 24,140m, 30km = 30,000m, 24km = 24,000m
            const minLongRun = goalPaceMinPerKm <= 4.5 
              ? (distanceUnit === "mi" ? 32187 : 30000) // Fast: 20mi/30km min
              : (distanceUnit === "mi" ? 24140 : 24000); // Slower: 15mi/24km min
            
            distanceMeters = Math.max(baseLongRun, minLongRun);
            // Cap at 35km/22mi for safety (22mi = 35,405m, 35km = 35,000m)
            const maxLongRun = distanceUnit === "mi" ? 35405 : 35000;
            distanceMeters = Math.min(distanceMeters, maxLongRun);
          } else {
            distanceMeters = Math.max(finalWeekMileage * 1000 * 0.28, 8000);
          }
          longRunPlaced = true;
          totalDistanceAssignedThisWeek += distanceMeters;
          notes = `Long run - build endurance for ${formatDistance(goal.distance, distanceUnit)} race`;
          targetPace = easyPace;
        }
        // Quality session (tempo or intervals, once per week if allowed)
        // For marathon training, prefer tempo runs and longer intervals
        // Place quality run if: hasQuality is true, not yet placed, and we have at least 2 runs left after this one
        else if (hasQuality && !qualityPlaced && runCount > 1 && (weekRunsPerWeek - runCount) >= 1) {
          const prevIsHard = i > 0 && !restIndices.has(i - 1) && items[items.length - 1].type !== "rest";
          if (!prevIsHard) {
            // For marathon training, prefer tempo runs, especially closer to race
            if (goalDistanceKm >= 42) {
              // Marathon: focus on tempo runs (marathon pace work)
              const weeksRemaining = weeksUntilRace - weekNum;
              if (weeksRemaining <= 6) {
                type = "tempo";
                // Tempo runs: 15-20% of weekly mileage, scale with volume
                const tempoPercent = finalWeekMileage >= 70 ? 0.20 : 0.15;
                distanceMeters = finalWeekMileage * 1000 * tempoPercent;
                totalDistanceAssignedThisWeek += distanceMeters;
                notes = `Tempo run at marathon pace - ${formatPace(tempoPace, distanceUnit)} (20-30 min effort)`;
                targetPace = tempoPace;
              } else {
                // Earlier in training: mix tempo and intervals
                type = weekNum % 2 === 0 ? "tempo" : "interval";
                if (type === "tempo") {
                  distanceMeters = finalWeekMileage * 1000 * 0.15;
                  totalDistanceAssignedThisWeek += distanceMeters;
                  notes = `Tempo effort at ${formatPace(tempoPace, distanceUnit)} - build race pace fitness`;
                  targetPace = tempoPace;
                } else {
                  // Intervals: scale with weekly volume
                  const intervalPercent = finalWeekMileage >= 70 ? 0.12 : 0.10;
                  distanceMeters = finalWeekMileage * 1000 * intervalPercent;
                  totalDistanceAssignedThisWeek += distanceMeters;
                  notes = `Interval session: 5-6x 1000m at ${formatPace(intervalPace, distanceUnit)} with 2min recovery`;
                  targetPace = intervalPace;
                }
              }
            } else {
              // Shorter distances: original logic
              const weeksRemaining = weeksUntilRace - weekNum;
              if (weeksRemaining <= 4) {
                type = "tempo";
                distanceMeters = finalWeekMileage * 1000 * 0.15;
                totalDistanceAssignedThisWeek += distanceMeters;
                notes = `Tempo run at goal pace - ${formatPace(tempoPace, distanceUnit)}`;
                targetPace = tempoPace;
              } else {
                type = weekNum % 2 === 0 ? "tempo" : "interval";
                if (type === "tempo") {
                  distanceMeters = finalWeekMileage * 1000 * 0.15;
                  totalDistanceAssignedThisWeek += distanceMeters;
                  notes = `Tempo effort at ${formatPace(tempoPace, distanceUnit)} - build race pace fitness`;
                  targetPace = tempoPace;
                } else {
                  distanceMeters = finalWeekMileage * 1000 * 0.12;
                  totalDistanceAssignedThisWeek += distanceMeters;
                  notes = `Interval session: 6-8x 400-800m at ${formatPace(intervalPace, distanceUnit)} with recovery`;
                  targetPace = intervalPace;
                }
              }
            }
            qualityPlaced = true;
          } else {
            // Previous day was hard, make this easy
            // Use tracked distance instead of recalculating
            const remainingDistance = Math.max(0, finalWeekMileage * 1000 - totalDistanceAssignedThisWeek);
            const remainingRuns = Math.max(1, weekRunsPerWeek - runCount - (longRunPlaced ? 0 : 1) - (qualityPlaced ? 0 : 1));
            distanceMeters = remainingRuns > 0 ? remainingDistance / remainingRuns : finalWeekMileage * 1000 * 0.15;
            totalDistanceAssignedThisWeek += distanceMeters;
            notes = "Easy recovery run";
            targetPace = easyPace;
          }
        } else {
          // Easy run
          // Use tracked distance instead of recalculating
          const remainingDistance = Math.max(0, finalWeekMileage * 1000 - totalDistanceAssignedThisWeek);
          const remainingRuns = Math.max(1, weekRunsPerWeek - runCount + (longRunPlaced ? 0 : 1) + (qualityPlaced ? 0 : 1));
          distanceMeters = remainingRuns > 0 ? remainingDistance / remainingRuns : finalWeekMileage * 1000 * 0.15;
          totalDistanceAssignedThisWeek += distanceMeters;
          notes = "Easy recovery run - build aerobic base";
          targetPace = easyPace;
        }
        
        // Ensure distance is never negative
        const finalDistanceMeters = Math.max(0, Math.round(distanceMeters));
        
        items.push({
          date: days[i],
          type,
          distanceMeters: finalDistanceMeters > 0 ? finalDistanceMeters : null,
          notes,
          targetPace,
        });
      }
    }
  }
  
  // Get first week's mileage for return value
  const firstWeekMileage = weeklyMileageProgression.length > 0 
    ? weeklyMileageProgression[0].mileageKm 
    : finalTargetMileage;
  
  // Check if peak was capped due to current fitness (use already-defined variables)
  const wasCapped = peakWeeklyMileage < idealPeakCapped * 0.9;
  
  // Generate rationale
  let rationale = `Generated ${weeksUntilRace}-week plan for ${formatDistance(goal.distance, distanceUnit)} race. ` +
    `Starting at ${metersToUnit(currentWeeklyMileage * 1000, distanceUnit).toFixed(1)}${distanceUnit === "mi" ? "mi" : "km"}/week, ` +
    `building to peak of ${metersToUnit(peakWeeklyMileage * 1000, distanceUnit).toFixed(1)}${distanceUnit === "mi" ? "mi" : "km"}/week ` +
    `with taper in final 2 weeks.`;
  
  if (wasCapped && isAmbitiousGoal) {
    const idealPeakFormatted = metersToUnit(idealPeakCapped * 1000, distanceUnit).toFixed(1);
    rationale += ` Note: Peak is capped based on your current fitness. For a ${formatDistance(goal.distance, distanceUnit)} at ${(goal.targetTimeSeconds / 60).toFixed(0)}min, ideal peak would be ${idealPeakFormatted}${distanceUnit === "mi" ? "mi" : "km"}/week. Consider building your base mileage first.`;
  }
  
  return {
    startDate,
    items,
    weeklyMileage: firstWeekMileage,
    weeklyMileageProgression,
    rationale,
  };
}
