/**
 * Structured Memory Management
 * 
 * Maintains separate memory objects for user profile, running context,
 * and derived baselines - independent from chat history.
 */

import { prisma } from "../prisma";

/**
 * User Profile Memory
 */
export interface UserProfile {
  goal_race: string | null;
  goal_time: string | null;
  preferred_feedback_style: "direct" | "supportive" | "analytical";
  injury_notes?: string;
}

export interface RunningContext {
  current_week: number;
  fatigue_flag: boolean;
  last_key_workout: string | null;
  weekly_mileage_trend: "up" | "down" | "stable";
}

export interface DerivedBaselines {
  easy_pace_range: string;
  threshold_pace: string;
  marathon_pace?: string;
  weekly_mileage_avg: number;
}

export interface ConversationMemory {
  profile: UserProfile;
  context: RunningContext;
  baselines: DerivedBaselines;
}

/**
 * Get conversation memory for user
 */
export async function getMemory(userId: string): Promise<ConversationMemory | null> {
  const memory = await prisma.conversationMemory.findUnique({
    where: { userId },
  });

  if (!memory) {
    return null;
  }

  return {
    profile: memory.profile as unknown as UserProfile,
    context: memory.context as unknown as RunningContext,
    baselines: memory.baselines as unknown as DerivedBaselines,
  };
}

/**
 * Update memory field
 */
export async function updateMemory(
  userId: string,
  updates: Partial<{
    profile: Partial<UserProfile>;
    context: Partial<RunningContext>;
    baselines: Partial<DerivedBaselines>;
  }>
): Promise<ConversationMemory> {
  const existing = await getMemory(userId);

  const profile: UserProfile = {
    goal_race: null,
    goal_time: null,
    preferred_feedback_style: "direct",
    ...existing?.profile,
    ...updates.profile,
  };

  const context: RunningContext = {
    current_week: 1,
    fatigue_flag: false,
    last_key_workout: null,
    weekly_mileage_trend: "stable",
    ...existing?.context,
    ...updates.context,
  };

  const baselines: DerivedBaselines = {
    easy_pace_range: "",
    threshold_pace: "",
    weekly_mileage_avg: 0,
    ...existing?.baselines,
    ...updates.baselines,
  };

  const memory = await prisma.conversationMemory.upsert({
    where: { userId },
    update: {
      profile: profile as any,
      context: context as any,
      baselines: baselines as any,
    },
    create: {
      userId,
      profile: profile as any,
      context: context as any,
      baselines: baselines as any,
    },
  });

  return {
    profile: memory.profile as unknown as UserProfile,
    context: memory.context as unknown as RunningContext,
    baselines: memory.baselines as unknown as DerivedBaselines,
  };
}

/**
 * Get relevant memory slices based on intent
 */
export function getRelevantMemory(memory: ConversationMemory, intent: string): string {
  const slices: string[] = [];

  // Always include goal if set
  if (memory.profile.goal_race && memory.profile.goal_time) {
    slices.push(`Goal: ${memory.profile.goal_race} in ${memory.profile.goal_time}`);
  }

  // Include context based on intent
  if (intent === "training_plan" || intent === "workout_request") {
    slices.push(`Current week: ${memory.context.current_week}`);
    if (memory.context.last_key_workout) {
      slices.push(`Last key workout: ${memory.context.last_key_workout}`);
    }
    if (memory.baselines.easy_pace_range) {
      slices.push(`Easy pace: ${memory.baselines.easy_pace_range}`);
    }
    if (memory.baselines.threshold_pace) {
      slices.push(`Threshold pace: ${memory.baselines.threshold_pace}`);
    }
  }

  if (intent === "injury_or_constraint" && memory.profile.injury_notes) {
    slices.push(`Injury notes: ${memory.profile.injury_notes}`);
  }

  if (intent === "performance_analysis") {
    if (memory.baselines.weekly_mileage_avg > 0) {
      slices.push(`Weekly mileage avg: ${memory.baselines.weekly_mileage_avg.toFixed(1)}`);
    }
    if (memory.context.weekly_mileage_trend !== "stable") {
      slices.push(`Trend: ${memory.context.weekly_mileage_trend}`);
    }
  }

  if (memory.context.fatigue_flag) {
    slices.push("Fatigue flag: true");
  }

  return slices.join(". ");
}
