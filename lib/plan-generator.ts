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
  
  // Target peak weekly mileage: race distance * 1.5-2x for marathon, 2-3x for shorter
  let peakWeeklyMileage: number;
  if (goalDistanceKm >= 42) {
    // Marathon: peak at 60-80km/week
    peakWeeklyMileage = Math.max(goalDistanceKm * 1.5, 60);
  } else if (goalDistanceKm >= 21) {
    // Half marathon: peak at 40-60km/week
    peakWeeklyMileage = Math.max(goalDistanceKm * 2, 40);
  } else {
    // Shorter distances: peak at 30-50km/week
    peakWeeklyMileage = Math.max(goalDistanceKm * 2.5, 30);
  }
  
  // Cap peak based on current fitness (don't increase more than 20% per week)
  const maxSafeIncrease = currentWeeklyMileage * 1.2;
  peakWeeklyMileage = Math.min(peakWeeklyMileage, maxSafeIncrease);
  
  // This week's target mileage (progressive build)
  const weeksIntoBuild = Math.min(buildUpWeeks, 4); // Cap at 4 weeks of build
  const weeklyIncrease = (peakWeeklyMileage - currentWeeklyMileage) / Math.max(weeksIntoBuild, 1);
  const targetWeeklyMileage = Math.min(
    currentWeeklyMileage + (weeklyIncrease * weeksIntoBuild),
    peakWeeklyMileage
  );
  
  // Determine run frequency (4-6 runs/week based on mileage)
  let runsPerWeek: number;
  if (targetWeeklyMileage < 30) {
    runsPerWeek = 4;
  } else if (targetWeeklyMileage < 50) {
    runsPerWeek = 5;
  } else {
    runsPerWeek = 6;
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
  
  // Calculate paces
  const medianPaceKm = signals.medianPace * 1000; // seconds per km
  const easyPace = medianPaceKm * 1.08;
  const tempoPace = targetPaceKm * 1.05; // Slightly faster than goal pace
  const intervalPace = targetPaceKm * 0.90; // Much faster than goal pace
  
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
        // Long run: 25-30% of weekly mileage, but at least 8km
        distanceMeters = Math.max(targetWeeklyMileage * 1000 * 0.28, 8000);
        longRunPlaced = true;
        notes = `Long run - build endurance for ${formatDistance(goal.distance, distanceUnit)} race`;
        targetPace = easyPace;
      }
      // Quality session (tempo or intervals, once per week if allowed)
      else if (hasQuality && !qualityPlaced && runCount > 1 && runCount < runsPerWeek) {
        const prevIsHard = i > 0 && !restIndices.has(i - 1) && items[items.length - 1].type !== "rest";
        if (!prevIsHard) {
          // Alternate between tempo and intervals, prefer tempo closer to race
          if (weeksUntilRace <= 4) {
            type = "tempo";
            distanceMeters = targetWeeklyMileage * 1000 * 0.15; // 15% of weekly
            notes = `Tempo run at goal pace - ${formatPace(tempoPace, distanceUnit)}`;
            targetPace = tempoPace;
          } else {
            type = Math.random() > 0.5 ? "tempo" : "interval";
            if (type === "tempo") {
              distanceMeters = targetWeeklyMileage * 1000 * 0.15;
              notes = `Tempo effort at ${formatPace(tempoPace, distanceUnit)} - build race pace fitness`;
              targetPace = tempoPace;
            } else {
              distanceMeters = targetWeeklyMileage * 1000 * 0.12;
              notes = `Interval session: 6-8x 400-800m at ${formatPace(intervalPace, distanceUnit)} with recovery`;
              targetPace = intervalPace;
            }
          }
          qualityPlaced = true;
        } else {
          // Previous day was hard, make this easy
          distanceMeters = (targetWeeklyMileage * 1000 - (items.filter((it) => it.type !== "rest").reduce((sum, it) => sum + (it.distanceMeters || 0), 0) + (longRunPlaced ? 0 : targetWeeklyMileage * 1000 * 0.28))) / Math.max(1, runsPerWeek - runCount - (longRunPlaced ? 0 : 1) - (qualityPlaced ? 0 : 1));
          notes = "Easy recovery run";
          targetPace = easyPace;
        }
      } else {
        // Easy run
        const remainingDistance = targetWeeklyMileage * 1000 - items.filter((it) => it.type !== "rest").reduce((sum, it) => sum + (it.distanceMeters || 0), 0);
        const remainingRuns = runsPerWeek - runCount + (longRunPlaced ? 0 : 1) + (qualityPlaced ? 0 : 1);
        distanceMeters = remainingRuns > 0 ? remainingDistance / remainingRuns : targetWeeklyMileage * 1000 * 0.15;
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
    `Target weekly mileage: ${metersToUnit(targetWeeklyMileage * 1000, distanceUnit).toFixed(1)}${distanceUnit === "mi" ? "mi" : "km"} ` +
    `(${runsPerWeek} runs/week). ` +
    `Based on your current fitness of ${metersToUnit(currentWeeklyMileage * 1000, distanceUnit).toFixed(1)}${distanceUnit === "mi" ? "mi" : "km"}/week, ` +
    `building toward peak of ${metersToUnit(peakWeeklyMileage * 1000, distanceUnit).toFixed(1)}${distanceUnit === "mi" ? "mi" : "km"}/week.`;
  
  return {
    startDate,
    items,
    weeklyMileage: targetWeeklyMileage,
    rationale,
  };
}
