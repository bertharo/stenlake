import { Activity, Goal, Plan, PlanItem, CoachMessage } from "@prisma/client";
import { TrainingSignals, computeSignals } from "./training";
import { formatDistance, formatPace, metersToUnit, DistanceUnit } from "./units";

/**
 * Conversation State - tracks user preferences and constraints
 */
export interface ConversationState {
  goal: Goal | null;
  distanceUnit: DistanceUnit;
  weeklyAvailability?: number; // days per week
  injuryHistory?: string[];
  preferences?: {
    preferredWorkoutTypes?: string[];
    timeOfDay?: "morning" | "afternoon" | "evening";
  };
}

/**
 * Strava Run Summary - compact representation of a run
 */
export interface StravaRunSummary {
  id: string;
  date: Date;
  distanceKm: number;
  distanceFormatted: string;
  timeMinutes: number;
  paceSecondsPerMeter: number;
  paceFormatted: string;
  heartRate?: number;
  elevationGainMeters?: number;
  cadence?: number;
  perceivedEffort?: number;
  intensity: "easy" | "moderate" | "hard";
  daysAgo: number;
  dateLabel: string; // "Today", "Yesterday", "3 days ago"
}

/**
 * Prepared Context - optimized for token efficiency
 */
export interface PreparedContext {
  // Goal info
  goalSummary: string | null;
  daysUntilRace: number | null;
  
  // Aggregated stats (last 4 weeks)
  weeklyMileage: Array<{ week: string; mileageKm: number; mileageFormatted: string }>;
  mileageTrend: "up" | "down" | "stable";
  lastWeekStats: {
    totalMileageKm: number;
    totalMileageFormatted: string;
    runCount: number;
    averageDistanceKm: number;
    averageDistanceFormatted: string;
  } | null;
  
  // Selected runs (top 3 most relevant)
  selectedRuns: StravaRunSummary[];
  
  // Current plan summary
  planSummary: {
    hasPlan: boolean;
    nextRun?: {
      date: Date;
      type: string;
      distanceFormatted?: string;
      paceFormatted?: string;
    };
    weeklyTotalFormatted?: string;
  };
  
  // Intensity distribution
  intensityDistribution: {
    easy: number;
    moderate: number;
    hard: number;
  };
  
  // Fatigue signals
  fatigueRisk: boolean;
  
  // Conversation history (last 5 messages for continuity)
  recentConversation: Array<{
    role: "user" | "assistant";
    content: string;
  }>;
}

/**
 * Coach Response Format
 */
export interface CoachResponse {
  message: string; // Markdown-formatted assistant message
  suggestedActions?: Array<{
    label: string;
    action: string;
    type: "button" | "link";
  }>;
  confidence: number; // 0-1
  needsClarification: boolean;
  dataPointsCited: string[]; // Track which data points were referenced
  nextRunRecommendation?: {
    type: string;
    distanceFormatted: string;
    paceFormatted: string;
    notes: string;
  };
}

/**
 * Select top 3 most relevant runs for context
 * Priority: (1) most recent, (2) longest run, (3) hardest workout
 */
export function selectRelevantRuns(
  activities: Activity[],
  signals: TrainingSignals,
  distanceUnit: DistanceUnit
): StravaRunSummary[] {
  if (activities.length === 0) return [];

  const runs: StravaRunSummary[] = activities.map((activity) => {
    const date = new Date(activity.startDate);
    const distanceKm = activity.distanceMeters / 1000;
    const timeMinutes = activity.movingTimeSeconds / 60;
    const paceSecondsPerMeter = activity.movingTimeSeconds / activity.distanceMeters;
    const daysAgo = Math.floor((Date.now() - date.getTime()) / (1000 * 60 * 60 * 24));
    
    // Determine intensity
    let intensity: "easy" | "moderate" | "hard" = "moderate";
    if (signals.medianPace) {
      const paceDiff = (paceSecondsPerMeter - signals.medianPace) / signals.medianPace;
      if (paceDiff > 0.1) intensity = "easy";
      else if (paceDiff < -0.1) intensity = "hard";
    }

    return {
      id: activity.id,
      date,
      distanceKm,
      distanceFormatted: formatDistance(activity.distanceMeters, distanceUnit),
      timeMinutes: Math.round(timeMinutes),
      paceSecondsPerMeter,
      paceFormatted: formatPace(paceSecondsPerMeter, distanceUnit),
      heartRate: activity.avgHeartRate || undefined,
      elevationGainMeters: activity.elevationGainMeters || undefined,
      cadence: activity.avgCadence || undefined,
      perceivedEffort: activity.perceivedEffort || undefined,
      intensity,
      daysAgo,
      dateLabel: daysAgo === 0 ? "Today" : daysAgo === 1 ? "Yesterday" : `${daysAgo} days ago`,
    };
  });

  // Select: most recent, longest, hardest
  const selected = new Set<string>();
  const result: StravaRunSummary[] = [];

  // 1. Most recent
  if (runs.length > 0) {
    result.push(runs[0]);
    selected.add(runs[0].id);
  }

  // 2. Longest run (if not already selected)
  const longest = [...runs].sort((a, b) => b.distanceKm - a.distanceKm)[0];
  if (longest && !selected.has(longest.id)) {
    result.push(longest);
    selected.add(longest.id);
  }

  // 3. Hardest workout (fastest pace, if not already selected)
  const hardest = [...runs]
    .filter(r => r.intensity === "hard")
    .sort((a, b) => a.paceSecondsPerMeter - b.paceSecondsPerMeter)[0];
  if (hardest && !selected.has(hardest.id)) {
    result.push(hardest);
    selected.add(hardest.id);
  }

  // If we don't have 3 yet, fill with most recent
  for (const run of runs) {
    if (result.length >= 3) break;
    if (!selected.has(run.id)) {
      result.push(run);
      selected.add(run.id);
    }
  }

  return result.slice(0, 3);
}

/**
 * Prepare optimized context for coach prompt
 */
export function prepareContext(
  goal: Goal | null,
  activities: Activity[],
  signals: TrainingSignals,
  plan: (Plan & { items: PlanItem[] }) | null,
  recentMessages: CoachMessage[],
  distanceUnit: DistanceUnit
): PreparedContext {
  const now = new Date();
  
  // Goal summary
  let goalSummary: string | null = null;
  let daysUntilRace: number | null = null;
  if (goal) {
    const goalDistance = formatDistance(goal.distance, distanceUnit);
    const goalTimeMin = Math.floor(goal.targetTimeSeconds / 60);
    daysUntilRace = Math.ceil((goal.raceDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    goalSummary = `${goalDistance} race on ${goal.raceDate.toLocaleDateString()} (target: ${goalTimeMin}min, ${daysUntilRace} days away)`;
  }

  // Weekly mileage (last 4 weeks)
  const weeklyMileage = signals.weeklyMileage.slice(-4).map((w) => ({
    week: w.week,
    mileageKm: w.mileageKm,
    mileageFormatted: `${metersToUnit(w.mileageKm * 1000, distanceUnit).toFixed(1)}${distanceUnit === "mi" ? "mi" : "km"}`,
  }));

  // Last week stats
  const lastWeekStats = signals.lastWeekStats ? {
    totalMileageKm: signals.lastWeekStats.totalMileageKm,
    totalMileageFormatted: `${metersToUnit(signals.lastWeekStats.totalMileageKm * 1000, distanceUnit).toFixed(1)}${distanceUnit === "mi" ? "mi" : "km"}`,
    runCount: signals.lastWeekStats.runCount,
    averageDistanceKm: signals.lastWeekStats.averageDistanceKm,
    averageDistanceFormatted: `${metersToUnit(signals.lastWeekStats.averageDistanceKm * 1000, distanceUnit).toFixed(1)}${distanceUnit === "mi" ? "mi" : "km"}`,
  } : null;

  // Selected runs
  const selectedRuns = selectRelevantRuns(activities.slice(0, 30), signals, distanceUnit);

  // Plan summary
  const planSummary: PreparedContext["planSummary"] = {
    hasPlan: !!plan,
  };
  if (plan) {
    const nextRun = plan.items.find((item) => {
      const itemDate = new Date(item.date);
      itemDate.setHours(0, 0, 0, 0);
      const today = new Date(now);
      today.setHours(0, 0, 0, 0);
      return itemDate >= today && item.type !== "rest";
    });
    
    if (nextRun) {
      planSummary.nextRun = {
        date: nextRun.date,
        type: nextRun.type,
        distanceFormatted: nextRun.distanceMeters ? formatDistance(nextRun.distanceMeters, distanceUnit) : undefined,
        paceFormatted: nextRun.targetPace ? formatPace(nextRun.targetPace, distanceUnit) : undefined,
      };
    }

    const weeklyTotal = plan.items
      .filter(item => item.distanceMeters)
      .reduce((sum, item) => sum + (item.distanceMeters || 0), 0);
    planSummary.weeklyTotalFormatted = formatDistance(weeklyTotal, distanceUnit);
  }

  // Recent conversation (last 5 messages)
  const recentConversation = recentMessages
    .slice(-5)
    .reverse()
    .map((msg) => ({
      role: msg.role as "user" | "assistant",
      content: msg.content,
    }));

  return {
    goalSummary,
    daysUntilRace,
    weeklyMileage,
    mileageTrend: signals.mileageTrend,
    lastWeekStats,
    selectedRuns,
    planSummary,
    intensityDistribution: signals.intensityDistribution,
    fatigueRisk: signals.fatigueRisk || false,
    recentConversation,
  };
}

/**
 * Format context as a compact string for the prompt
 */
export function formatContextString(context: PreparedContext): string {
  const parts: string[] = [];

  if (context.goalSummary) {
    parts.push(`Goal: ${context.goalSummary}`);
  }

  if (context.weeklyMileage.length > 0) {
    const weeklyData = context.weeklyMileage
      .map(w => `${w.week}: ${w.mileageFormatted}`)
      .join(", ");
    parts.push(`Weekly mileage (last 4 weeks): ${weeklyData}`);
    parts.push(`Trend: ${context.mileageTrend}`);
  }

  if (context.lastWeekStats) {
    parts.push(`Last week: ${context.lastWeekStats.totalMileageFormatted} total, ${context.lastWeekStats.averageDistanceFormatted} avg per run (${context.lastWeekStats.runCount} runs)`);
  }

  parts.push(`Intensity: ${context.intensityDistribution.easy} easy, ${context.intensityDistribution.moderate} moderate, ${context.intensityDistribution.hard} hard`);

  if (context.fatigueRisk) {
    parts.push("⚠️ Fatigue risk: HIGH");
  }

  if (context.selectedRuns.length > 0) {
    parts.push(`\nSelected runs (most relevant):`);
    context.selectedRuns.forEach((run) => {
      const details = [
        run.dateLabel,
        run.distanceFormatted,
        `${run.timeMinutes}min`,
        run.paceFormatted,
        run.intensity,
      ];
      if (run.heartRate) details.push(`HR: ${run.heartRate}bpm`);
      if (run.elevationGainMeters) {
        const elevation = metersToUnit(run.elevationGainMeters, "km" as DistanceUnit);
        details.push(`+${elevation.toFixed(0)}m`);
      }
      parts.push(`  ${details.join(" • ")}`);
    });
  }

  if (context.planSummary.hasPlan) {
    if (context.planSummary.nextRun) {
      const next = context.planSummary.nextRun;
      parts.push(`\nNext scheduled run: ${next.type}${next.distanceFormatted ? ` - ${next.distanceFormatted}` : ""}${next.paceFormatted ? ` at ${next.paceFormatted}` : ""}`);
    }
    if (context.planSummary.weeklyTotalFormatted) {
      parts.push(`Weekly plan total: ${context.planSummary.weeklyTotalFormatted}`);
    }
  } else {
    parts.push("\nNo training plan yet.");
  }

  return parts.join("\n");
}
