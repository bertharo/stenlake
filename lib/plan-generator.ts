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
  
  // Cap peak based on current fitness (don't increase more than 20% per week)
  // But also ensure we don't set an unrealistic peak if current fitness is very low
  const maxSafeIncrease = currentWeeklyMileage > 0 
    ? currentWeeklyMileage * 1.2 
    : peakWeeklyMileage * 0.5; // If no recent runs, start conservatively
  
  peakWeeklyMileage = Math.min(peakWeeklyMileage, maxSafeIncrease);
  
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
  
  const items: Array<{
    date: Date;
    type: "easy" | "long" | "tempo" | "interval" | "rest";
    distanceMeters: number | null;
    notes: string;
    targetPace: number | null;
  }> = [];
  
  const days: Date[] = [];
  for (let i = 0; i < 7; i++) {
    const day = new Date(startDate);
    day.setDate(day.getDate() + i);
    days.push(day);
  }
  
  // Place rest days
  const restDays = 7 - runsPerWeek;
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
  const easyPace = signals.medianPace * 1.08; // 8% slower than median
  // targetPaceKm is in seconds per km, convert to seconds per meter
  const targetPaceSecondsPerMeter = targetPaceKm / 1000;
  
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
  
  // Assign runs
  let runCount = 0;
  let longRunPlaced = false;
  let qualityPlaced = false;
  const hasQuality = !signals.fatigueRisk && weeksUntilRace > 2; // No quality in final 2 weeks
  
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
      if (!longRunPlaced && (i >= 5 || runCount === runsPerWeek)) {
        type = "long";
        // Long run: 25-30% of weekly mileage, with reasonable minimums
        if (goalDistanceKm >= 42) {
          // Marathon: long runs should be 25-30% of weekly, but scale with fitness
          // For slower goals or lower volume: 20-25km is fine
          // For faster goals or higher volume: 25-35km
          const longRunPercent = finalTargetMileage >= 80 ? 0.30 : 0.25;
          const baseLongRun = finalTargetMileage * 1000 * longRunPercent;
          
          // Minimum based on goal pace: slower goals need less
          const goalPaceMinPerKm = targetPaceKm / 60;
          const minLongRun = goalPaceMinPerKm <= 4.5 
            ? (distanceUnit === "mi" ? 20000 : 30000) // Fast: 20mi/30km min
            : (distanceUnit === "mi" ? 15000 : 24000); // Slower: 15mi/24km min
          
          distanceMeters = Math.max(baseLongRun, minLongRun);
          // Cap at 35km/22mi for safety
          const maxLongRun = distanceUnit === "mi" ? 35000 : 35000;
          distanceMeters = Math.min(distanceMeters, maxLongRun);
        } else {
          distanceMeters = Math.max(finalTargetMileage * 1000 * 0.28, 8000);
        }
        longRunPlaced = true;
        notes = `Long run - build endurance for ${formatDistance(goal.distance, distanceUnit)} race`;
        targetPace = easyPace;
      }
      // Quality session (tempo or intervals, once per week if allowed)
      // For marathon training, prefer tempo runs and longer intervals
      else if (hasQuality && !qualityPlaced && runCount > 1 && runCount < runsPerWeek) {
        const prevIsHard = i > 0 && !restIndices.has(i - 1) && items[items.length - 1].type !== "rest";
        if (!prevIsHard) {
          // For marathon training, prefer tempo runs, especially closer to race
          if (goalDistanceKm >= 42) {
            // Marathon: focus on tempo runs (marathon pace work)
            if (weeksUntilRace <= 6) {
              type = "tempo";
              // Tempo runs: 15-20% of weekly mileage, scale with volume
              const tempoPercent = finalTargetMileage >= 70 ? 0.20 : 0.15;
              distanceMeters = finalTargetMileage * 1000 * tempoPercent;
              notes = `Tempo run at marathon pace - ${formatPace(tempoPace, distanceUnit)} (20-30 min effort)`;
              targetPace = tempoPace;
            } else {
              // Earlier in training: mix tempo and intervals
              type = weeksUntilRace % 2 === 0 ? "tempo" : "interval";
              if (type === "tempo") {
                distanceMeters = finalTargetMileage * 1000 * 0.15;
                notes = `Tempo effort at ${formatPace(tempoPace, distanceUnit)} - build race pace fitness`;
                targetPace = tempoPace;
              } else {
                // Intervals: scale with weekly volume
                const intervalPercent = finalTargetMileage >= 70 ? 0.12 : 0.10;
                distanceMeters = finalTargetMileage * 1000 * intervalPercent;
                notes = `Interval session: 5-6x 1000m at ${formatPace(intervalPace, distanceUnit)} with 2min recovery`;
                targetPace = intervalPace;
              }
            }
          } else {
            // Shorter distances: original logic
            if (weeksUntilRace <= 4) {
              type = "tempo";
              distanceMeters = finalTargetMileage * 1000 * 0.15;
              notes = `Tempo run at goal pace - ${formatPace(tempoPace, distanceUnit)}`;
              targetPace = tempoPace;
            } else {
              type = Math.random() > 0.5 ? "tempo" : "interval";
              if (type === "tempo") {
                distanceMeters = finalTargetMileage * 1000 * 0.15;
                notes = `Tempo effort at ${formatPace(tempoPace, distanceUnit)} - build race pace fitness`;
                targetPace = tempoPace;
              } else {
                distanceMeters = finalTargetMileage * 1000 * 0.12;
                notes = `Interval session: 6-8x 400-800m at ${formatPace(intervalPace, distanceUnit)} with recovery`;
                targetPace = intervalPace;
              }
            }
          }
          qualityPlaced = true;
        } else {
          // Previous day was hard, make this easy
          distanceMeters = (finalTargetMileage * 1000 - (items.filter((it) => it.type !== "rest").reduce((sum, it) => sum + (it.distanceMeters || 0), 0) + (longRunPlaced ? 0 : finalTargetMileage * 1000 * 0.28))) / Math.max(1, runsPerWeek - runCount - (longRunPlaced ? 0 : 1) - (qualityPlaced ? 0 : 1));
          notes = "Easy recovery run";
          targetPace = easyPace;
        }
      } else {
        // Easy run
        const remainingDistance = finalTargetMileage * 1000 - items.filter((it) => it.type !== "rest").reduce((sum, it) => sum + (it.distanceMeters || 0), 0);
        const remainingRuns = runsPerWeek - runCount + (longRunPlaced ? 0 : 1) + (qualityPlaced ? 0 : 1);
        distanceMeters = remainingRuns > 0 ? remainingDistance / remainingRuns : finalTargetMileage * 1000 * 0.15;
        notes = "Easy recovery run - build aerobic base";
        targetPace = easyPace;
      }
      
      items.push({
        date: days[i],
        type,
        distanceMeters: Math.round(distanceMeters),
        notes,
        targetPace,
      });
    }
  }
  
  // Generate rationale
  const rationale = `Generated plan for ${formatDistance(goal.distance, distanceUnit)} race in ${weeksUntilRace} weeks. ` +
    `Target weekly mileage: ${metersToUnit(finalTargetMileage * 1000, distanceUnit).toFixed(1)}${distanceUnit === "mi" ? "mi" : "km"} ` +
    `(${runsPerWeek} runs/week). ` +
    `Based on your current fitness of ${metersToUnit(currentWeeklyMileage * 1000, distanceUnit).toFixed(1)}${distanceUnit === "mi" ? "mi" : "km"}/week, ` +
    `building toward peak of ${metersToUnit(peakWeeklyMileage * 1000, distanceUnit).toFixed(1)}${distanceUnit === "mi" ? "mi" : "km"}/week.`;
  
  return {
    startDate,
    items,
    weeklyMileage: finalTargetMileage,
    rationale,
  };
}
