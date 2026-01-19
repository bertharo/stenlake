import { Activity, Plan, PlanItem } from "@prisma/client";

export interface TrainingSignals {
  weeklyMileage: Array<{ week: string; mileageKm: number }>;
  mileageTrend: "up" | "down" | "stable";
  intensityDistribution: {
    easy: number;
    moderate: number;
    hard: number;
  };
  longRuns: Array<{ week: string; distanceMeters: number; date: Date }>;
  fatigueRisk: boolean;
  medianPace: number; // seconds per meter
  lastWeekStats?: {
    totalMileageKm: number;
    averageDistanceKm: number;
    runCount: number;
  };
}

export interface LastRunSummary {
  date: Date;
  distanceKm: number;
  timeMinutes: number;
  pace: string;
  intensity: "easy" | "moderate" | "hard";
  heartRate?: number;
}

/**
 * Compute training signals from last 30 days of activities
 */
export function computeSignals(activities: Activity[]): TrainingSignals {
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const recent = activities
    .filter((a) => new Date(a.startDate) >= thirtyDaysAgo)
    .sort((a, b) => new Date(b.startDate).getTime() - new Date(a.startDate).getTime());

  if (recent.length === 0) {
    return {
      weeklyMileage: [],
      mileageTrend: "stable",
      intensityDistribution: { easy: 0, moderate: 0, hard: 0 },
      longRuns: [],
      fatigueRisk: false,
      medianPace: 0.36, // Default ~5:00/km
    };
  }

  // Compute median pace (seconds per meter)
  // Filter out invalid paces (zero distance or zero time)
  const validPaces = recent
    .filter((a) => a.distanceMeters > 0 && a.movingTimeSeconds > 0)
    .map((a) => a.movingTimeSeconds / a.distanceMeters);
  
  if (validPaces.length === 0) {
    return {
      weeklyMileage: [],
      mileageTrend: "stable",
      intensityDistribution: { easy: 0, moderate: 0, hard: 0 },
      longRuns: [],
      fatigueRisk: false,
      medianPace: 0.36, // Default ~5:00/km
    };
  }
  
  validPaces.sort((a, b) => a - b);
  const medianPace = validPaces[Math.floor(validPaces.length / 2)];
  
  // Validate median pace is reasonable (between 0.2 and 1.0 seconds per meter = 3:20/km to 16:40/km)
  const validatedMedianPace = medianPace > 0.2 && medianPace < 1.0 
    ? medianPace 
    : 0.36; // Default to ~5:00/km if median pace is invalid

  // Weekly mileage by ISO week
  const weeklyMap = new Map<string, number>();
  const longRunMap = new Map<string, { distanceMeters: number; date: Date }>();

  recent.forEach((a) => {
    const date = new Date(a.startDate);
    const week = getISOWeek(date);

    // Accumulate mileage (convert meters to km)
    const km = a.distanceMeters / 1000;
    weeklyMap.set(week, (weeklyMap.get(week) || 0) + km);

    // Track longest run per week
    const current = longRunMap.get(week);
    if (!current || a.distanceMeters > current.distanceMeters) {
      longRunMap.set(week, { distanceMeters: a.distanceMeters, date });
    }
  });

  const weeklyMileage = Array.from(weeklyMap.entries())
    .map(([week, mileageKm]) => ({ week, mileageKm }))
    .sort((a, b) => a.week.localeCompare(b.week));

  // Trend: compare last week to previous
  let mileageTrend: "up" | "down" | "stable" = "stable";
  if (weeklyMileage.length >= 2) {
    const last = weeklyMileage[weeklyMileage.length - 1].mileageKm;
    const prev = weeklyMileage[weeklyMileage.length - 2].mileageKm;
    if (last > prev * 1.05) mileageTrend = "up";
    else if (last < prev * 0.95) mileageTrend = "down";
  }

  // Intensity distribution
  let easy = 0;
  let moderate = 0;
  let hard = 0;

  recent.forEach((a) => {
    if (a.distanceMeters > 0 && a.movingTimeSeconds > 0) {
      const pace = a.movingTimeSeconds / a.distanceMeters;
      const diffPct = (pace - validatedMedianPace) / validatedMedianPace;
      if (diffPct >= 0.08) easy++;
      else if (diffPct <= -0.08) hard++;
      else moderate++;
    }
  });

  // Fatigue heuristic
  const now = new Date();
  const last7Days = now;
  last7Days.setDate(last7Days.getDate() - 7);
  const prior7Days = new Date(last7Days);
  prior7Days.setDate(prior7Days.getDate() - 7);

  const last7 = recent.filter((a) => new Date(a.startDate) >= last7Days);
  const prior7 = recent.filter(
    (a) => new Date(a.startDate) >= prior7Days && new Date(a.startDate) < last7Days
  );

  const last7Mileage = last7.reduce((sum, a) => sum + a.distanceMeters, 0) / 1000;
  const prior7Mileage = prior7.reduce((sum, a) => sum + a.distanceMeters, 0) / 1000;

  const volumeSpike = last7Mileage > 0 && prior7Mileage > 0 && last7Mileage > prior7Mileage * 1.25;

  // Check for 2+ hard runs in 4 days
  const hardRuns = recent.filter((a) => {
    if (a.distanceMeters > 0 && a.movingTimeSeconds > 0) {
      const pace = a.movingTimeSeconds / a.distanceMeters;
      return (validatedMedianPace - pace) / validatedMedianPace >= 0.08;
    }
    return false;
  });

  let hardIn4Days = false;
  for (let i = 0; i < hardRuns.length; i++) {
    const run = new Date(hardRuns[i].startDate);
    const within4 = hardRuns.filter(
      (r) => Math.abs(new Date(r.startDate).getTime() - run.getTime()) <= 4 * 24 * 60 * 60 * 1000
    );
    if (within4.length >= 2) {
      hardIn4Days = true;
      break;
    }
  }

  const fatigueRisk = volumeSpike || hardIn4Days;

  const longRuns = Array.from(longRunMap.entries()).map(([week, data]) => ({
    week,
    ...data,
  }));

  // Calculate last week stats (last 7 days)
  const lastWeekStart = new Date();
  lastWeekStart.setDate(lastWeekStart.getDate() - 7);
  const lastWeekActivities = recent.filter((a) => new Date(a.startDate) >= lastWeekStart);
  const lastWeekTotalKm = lastWeekActivities.reduce((sum, a) => sum + a.distanceMeters, 0) / 1000;
  const lastWeekRunCount = lastWeekActivities.length;
  const lastWeekAverageKm = lastWeekRunCount > 0 ? lastWeekTotalKm / lastWeekRunCount : 0;

  return {
    weeklyMileage,
    mileageTrend,
    intensityDistribution: { easy, moderate, hard },
    longRuns,
    fatigueRisk,
    medianPace: validatedMedianPace,
    lastWeekStats: {
      totalMileageKm: lastWeekTotalKm,
      averageDistanceKm: lastWeekAverageKm,
      runCount: lastWeekRunCount,
    },
  };
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
 * DEPRECATED: This function is disabled. Use lib/planEngine::generate12WeekPlan() instead.
 * This old generator had bugs (identical distances, hardcoded paces).
 * 
 * @deprecated Use lib/planEngine::generate12WeekPlan() instead
 */
export async function generateNext7DaysPlan(
  userId: string,
  signals: TrainingSignals,
  existingPlan?: Plan & { items: PlanItem[] }
): Promise<{ startDate: Date; items: Omit<PlanItem, "id" | "planId" | "createdAt">[] }> {
  // HARD DISABLED: Redirect to canonical engine
  throw new Error(
    "generateNext7DaysPlan is deprecated and disabled. " +
    "Use lib/planEngine::generate12WeekPlan() instead. " +
    "This old generator had bugs (identical distances, hardcoded paces)."
  );
  const now = new Date();
  const monday = getMonday(now);
  const startDate = monday < now ? addDays(monday, 7) : monday;

  // Determine run frequency (4-6 runs/week)
  const recentFrequency = signals.weeklyMileage.length > 0
    ? Math.min(6, Math.max(4, Math.ceil(signals.weeklyMileage[signals.weeklyMileage.length - 1].mileageKm / 10)))
    : 4;

  const runsPerWeek = signals.fatigueRisk ? Math.max(3, recentFrequency - 1) : recentFrequency;

  // Last week mileage
  const lastWeekMileage = signals.weeklyMileage.length > 0
    ? signals.weeklyMileage[signals.weeklyMileage.length - 1].mileageKm
    : 20; // Default

  // Target weekly mileage (max +10% or reduced if fatigued)
  let targetMileage = lastWeekMileage * (signals.fatigueRisk ? 0.85 : 1.1);
  if (targetMileage > lastWeekMileage * 1.1) targetMileage = lastWeekMileage * 1.1;

  // If fatigued, no quality session
  const hasQuality = !signals.fatigueRisk;

  const items: Omit<PlanItem, "id" | "planId" | "createdAt">[] = [];
  const days: Date[] = [];
  for (let i = 0; i < 7; i++) {
    days.push(addDays(startDate, i));
  }

  // Place rest days first
  const restDays = 7 - runsPerWeek;
  const restIndices = new Set<number>();
  for (let i = 0; i < restDays; i++) {
    let idx;
    do {
      idx = Math.floor(Math.random() * 7);
    } while (restIndices.has(idx) || (i === 0 && idx === 0)); // Don't put rest on Monday
    restIndices.add(idx);
  }

  // Assign runs
  let runCount = 0;
  let longRunPlaced = false;
  let qualityPlaced = false;
  const paceKm = signals.medianPace * 1000; // seconds per km

  for (let i = 0; i < 7; i++) {
    if (restIndices.has(i)) {
      items.push({
        date: days[i],
        type: "rest",
        distanceMeters: null,
        notes: "Rest day",
        targetPace: null,
      });
    } else {
      runCount++;
      let type: "easy" | "long" | "tempo" | "interval" = "easy";
      let distanceMeters: number = 0; // Initialize to ensure always assigned
      let notes = "";
      let targetPace: number | null = null;

      // Long run (once, mid-weekend preferred)
      if (!longRunPlaced && (i >= 5 || runCount === runsPerWeek - 1)) {
        type = "long";
        distanceMeters = (targetMileage * 1000 * 0.25); // ~25% of weekly
        longRunPlaced = true;
        notes = "Long steady run";
        targetPace = paceKm * 1.08; // Easy pace
      }
      // Quality session (if allowed, not back-to-back with another quality or long)
      else if (hasQuality && !qualityPlaced && runCount > 1) {
        const prevIsHard = i > 0 && !restIndices.has(i - 1) && items[items.length - 1].type !== "rest";
        if (!prevIsHard) {
          type = Math.random() > 0.5 ? "tempo" : "interval";
          if (type === "tempo") {
            distanceMeters = targetMileage * 1000 * 0.12; // ~12% of weekly
            notes = "Tempo effort: 20-30 min at threshold";
            targetPace = paceKm * 0.92; // Faster than median
          } else {
            distanceMeters = targetMileage * 1000 * 0.10; // ~10% of weekly
            notes = "Interval session: 6-8x 400-800m with recovery";
            targetPace = paceKm * 0.85; // Much faster
          }
          qualityPlaced = true;
        } else {
          // prevIsHard is true, fall through to easy run
          distanceMeters = (targetMileage * 1000 - (items.filter((it) => it.type !== "rest").reduce((sum, it) => sum + (it.distanceMeters || 0), 0) + (longRunPlaced ? 0 : targetMileage * 1000 * 0.25))) / Math.max(1, runsPerWeek - runCount - (longRunPlaced ? 0 : 1) - (qualityPlaced ? 0 : 1));
          notes = "Easy recovery run";
          targetPace = paceKm * 1.08;
        }
      }

      // Easy run (default) - ensure distanceMeters is always assigned
      if (type === "easy" || distanceMeters === 0) {
        distanceMeters = (targetMileage * 1000 - (items.filter((it) => it.type !== "rest").reduce((sum, it) => sum + (it.distanceMeters || 0), 0) + (longRunPlaced ? 0 : targetMileage * 1000 * 0.25))) / Math.max(1, runsPerWeek - runCount - (longRunPlaced ? 0 : 1) - (qualityPlaced ? 0 : 1));
        if (type === "easy") {
          notes = "Easy recovery run";
        }
        targetPace = paceKm * 1.08;
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

  return { startDate, items };
}

function getMonday(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  return new Date(d.setDate(diff));
}

function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

/**
 * Get last run summary for chat context
 */
export function getLastRunSummary(activities: Activity[], medianPace: number): LastRunSummary | null {
  if (activities.length === 0) return null;

  const last = activities[0];
  const pace = last.movingTimeSeconds / last.distanceMeters;
  const diffPct = (pace - medianPace) / medianPace;

  let intensity: "easy" | "moderate" | "hard" = "moderate";
  if (diffPct >= 0.08) intensity = "easy";
  else if (diffPct <= -0.08) intensity = "hard";

  const paceMin = Math.floor(pace * 1000 / 60);
  const paceSec = Math.floor((pace * 1000) % 60);
  const paceStr = `${paceMin}:${String(paceSec).padStart(2, "0")}/km`;

  return {
    date: new Date(last.startDate),
    distanceKm: last.distanceMeters / 1000,
    timeMinutes: Math.round(last.movingTimeSeconds / 60),
    pace: paceStr,
    intensity,
    heartRate: last.avgHeartRate || undefined,
  };
}
