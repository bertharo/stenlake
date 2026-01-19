/**
 * CANONICAL PLAN ENGINE TYPES
 * 
 * These types define the single source of truth for plan generation.
 * All plan generation must use these types.
 */

/**
 * Strava Activity (normalized from Prisma Activity)
 */
export interface StravaActivity {
  id: string;
  startDate: Date;
  distanceMeters: number;
  movingTimeSec: number;
  avgHr?: number;
  maxHr?: number;
  avgPaceSecPerMile?: number; // Computed: movingTimeSec / (distanceMeters / 1609.34)
  type?: string; // "Run", etc.
}

/**
 * Recent Fitness Profile
 * Computed from last 6 weeks of activities
 */
export interface RecentFitness {
  windowDays: number; // Typically 42 (6 weeks)
  weeklyMiles: number[]; // Last 6 weeks, most recent last
  avgWeeklyMiles: number;
  maxWeeklyMiles: number;
  longRunMiles: number; // Max single run in last 6 weeks
  easyPaceRangeSecPerMile: [number, number]; // [min, max] in seconds per mile
  thresholdPaceSecPerMile: number | null; // Tempo/threshold pace
  vo2PaceSecPerMile: number | null; // VO2/interval pace
  lastRunDate: string | null; // ISO date string
  assumptions: string[]; // What we assumed due to missing data
}

/**
 * Goal Configuration
 */
export interface Goal {
  race: "marathon" | "half" | "10k" | "5k";
  targetTimeSec: number; // Target finish time in seconds
  startDate: Date; // Plan start date (Monday)
  raceDate: Date; // Race date
  daysPerWeek: number; // Default 5
  mode: "conservative" | "standard" | "aggressive"; // Default "standard"
}

/**
 * Plan Day
 */
export interface PlanDay {
  date: Date;
  type: "easy" | "recovery" | "tempo" | "interval" | "long" | "rest";
  miles: number; // Distance in miles
  paceRange?: [number, number]; // [min, max] seconds per mile, optional for rest
  notes?: string;
}

/**
 * Plan Week
 */
export interface PlanWeek {
  weekNumber: number; // 1-12
  totalMiles: number; // Sum of all run days
  days: PlanDay[];
}

/**
 * Pace Ranges (all in seconds per mile)
 */
export interface PaceRanges {
  mp: [number, number]; // Marathon pace range
  easy: [number, number]; // Easy pace range
  tempo: [number, number]; // Tempo/threshold pace range
  interval: [number, number]; // Interval/VO2 pace range
}

/**
 * Training Plan
 */
export interface TrainingPlan {
  status: "ready" | "not_configured";
  meta: {
    provenance: string; // "lib/planEngine/getTrainingPlan"
    fingerprint: string; // "ENGINE_V1_<random>" - runtime proof this is engine output
    generatedAt: string; // ISO timestamp
    assumptions: string[];
    fitnessSummary: {
      avgWeeklyMiles: number;
      maxWeeklyMiles: number;
      longRunMiles: number;
      lastRunDate: string | null;
    };
  };
  weeks: PlanWeek[];
}
