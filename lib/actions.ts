"use server";

import { prisma } from "./prisma";
import { StravaClient, MockActivitiesAdapter, stravaActivityToActivity } from "./strava";
import { computeSignals, getLastRunSummary, TrainingSignals } from "./training";
import { buildCoachContext, generateCoachResponse, CoachContext } from "./coach";
import { PlanItem } from "@prisma/client";
import { revalidatePath } from "next/cache";

// Get or create user (simplified: single user for MVP)
async function getOrCreateUser() {
  let user = await prisma.user.findFirst();
  if (!user) {
    user = await prisma.user.create({ data: {} });
  }
  return user;
}

export async function getUser() {
  return getOrCreateUser();
}

export async function getUserDistanceUnit(): Promise<"km" | "mi"> {
  const user = await getOrCreateUser();
  return (user.distanceUnit as "km" | "mi") || "km";
}

export async function setUserDistanceUnit(unit: "km" | "mi") {
  const user = await getOrCreateUser();
  await prisma.user.update({
    where: { id: user.id },
    data: { distanceUnit: unit },
  });
  revalidatePath("/dashboard");
  revalidatePath("/settings");
}

export async function getUserGoal() {
  const user = await getOrCreateUser();
  return prisma.goal.findFirst({ where: { userId: user.id }, orderBy: { createdAt: "desc" } });
}

export async function setUserGoal(distance: number, targetTimeSeconds: number, raceDate: Date, distanceUnit?: "km" | "mi") {
  const user = await getOrCreateUser();
  // If distanceUnit is provided, convert distance to meters
  // Otherwise assume distance is already in meters
  let distanceMeters = distance;
  if (distanceUnit) {
    const { unitToMeters } = await import("./units");
    distanceMeters = unitToMeters(distance, distanceUnit);
  }
  
  await prisma.goal.create({
    data: {
      userId: user.id,
      distance: distanceMeters,
      targetTimeSeconds,
      raceDate,
    },
  });
  revalidatePath("/dashboard");
  revalidatePath("/settings");
}

export async function getActivities(lastDays: number = 30) {
  const user = await getOrCreateUser();
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - lastDays);
  return prisma.activity.findMany({
    where: { userId: user.id, startDate: { gte: cutoff } },
    orderBy: { startDate: "desc" },
  });
}

export async function getTrainingSignals(): Promise<TrainingSignals> {
  const activities = await getActivities(30);
  return computeSignals(activities);
}

export async function syncMockActivities() {
  const user = await getOrCreateUser();
  const adapter = new MockActivitiesAdapter();
  const mockActivities = await adapter.getActivities(user.id);

  for (const mock of mockActivities) {
    // Check if activity already exists by date + user
    const existing = await prisma.activity.findFirst({
      where: {
        userId: user.id,
        startDate: mock.startDate,
        source: "mock",
      },
    });

    if (existing) {
      await prisma.activity.update({
        where: { id: existing.id },
        data: {
          distanceMeters: mock.distanceMeters,
          movingTimeSeconds: mock.movingTimeSeconds,
          avgHeartRate: mock.avgHeartRate,
          elevationGainMeters: mock.elevationGainMeters,
          avgCadence: mock.avgCadence,
          perceivedEffort: mock.perceivedEffort,
        },
      });
    } else {
      await prisma.activity.create({
        data: {
          ...mock,
          userId: user.id,
        },
      });
    }
  }

  // Plan regeneration disabled - removed call to regeneratePlan()
  revalidatePath("/dashboard");
}

export async function syncStravaActivities() {
  const user = await getOrCreateUser();
  const token = await prisma.stravaToken.findUnique({ where: { userId: user.id } });
  if (!token) throw new Error("No Strava token found");

  const client = new StravaClient();
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 30);

  // Refresh token if expired
  let accessToken = token.accessToken;
  if (new Date(token.expiresAt) < new Date()) {
    const refreshed = await client.refreshToken(token.refreshToken);
    await prisma.stravaToken.update({
      where: { userId: user.id },
      data: {
        accessToken: refreshed.access_token,
        refreshToken: refreshed.refresh_token,
        expiresAt: new Date(refreshed.expires_at * 1000),
      },
    });
    accessToken = refreshed.access_token;
  }

  const stravaActivities = await client.getActivities(accessToken, cutoff);

  for (const sa of stravaActivities) {
    if (sa.type && sa.type !== "Run") continue;
    const activity = stravaActivityToActivity(user.id, sa);
    await prisma.activity.upsert({
      where: { stravaId: activity.stravaId!, userId: user.id },
      update: {
        distanceMeters: activity.distanceMeters,
        movingTimeSeconds: activity.movingTimeSeconds,
        avgHeartRate: activity.avgHeartRate,
        elevationGainMeters: activity.elevationGainMeters,
        avgCadence: activity.avgCadence,
        perceivedEffort: activity.perceivedEffort,
      },
      create: activity,
    });
  }

  // Plan regeneration disabled - removed call to regeneratePlan()
  revalidatePath("/dashboard");
}

/**
 * Get current plan from database
 * 
 * Returns the most recent plan that starts on or after this week's Monday.
 * 
 * IMPORTANT: Only returns plans with ENGINE_V1_FINGERPRINT in first item notes.
 * Old plans without fingerprint are ignored (they're from deprecated generators).
 */
export async function getCurrentPlan() {
  const user = await getOrCreateUser();
  const now = new Date();
  const monday = getMonday(now);
  monday.setHours(0, 0, 0, 0);
  
  const plan = await prisma.plan.findFirst({
    where: {
      userId: user.id,
      startDate: { gte: monday },
    },
    include: { items: { orderBy: { date: "asc" } } },
    orderBy: { startDate: "asc" },
  });
  
  // TRIPWIRE: Only return plans with ENGINE_V1_FINGERPRINT
  // Old plans without fingerprint are from deprecated generators
  if (plan && plan.items.length > 0) {
    const firstItemNotes = plan.items[0].notes || "";
    const hasFingerprint = firstItemNotes.includes("[ENGINE_V1_FINGERPRINT:");
    
    if (!hasFingerprint) {
      // Old plan detected - log and return null to force regeneration
      if (process.env.NODE_ENV === 'development') {
        console.warn(
          '[PLAN ENGINE] Old plan detected (no fingerprint) - plan ID:',
          plan.id,
          'createdAt:',
          plan.createdAt,
          'This plan was created by a deprecated generator and will be ignored.'
        );
      }
      return null;
    }
  }
  
  return plan;
}

/**
 * Regenerate plan using canonical plan engine
 */
export async function regeneratePlan() {
  const goal = await getUserGoal();
  if (!goal) {
    throw new Error("No goal set. Please set a race goal first.");
  }
  
  return generateGoalBasedPlan();
}

/**
 * Generate goal-based plan using canonical plan engine
 */
export async function generateGoalBasedPlan(
  daysPerWeek: number = 5,
  mode: "conservative" | "standard" | "aggressive" = "standard"
) {
  const user = await getOrCreateUser();
  const goal = await getUserGoal();
  const activities = await getActivities(42); // Get 42 days for fitness computation
  
  if (!goal) {
    throw new Error("No goal set. Please set a race goal first.");
  }
  
  // Use canonical plan engine
  const { getTrainingPlan } = await import("./planEngine");
  const { plan, validation } = await getTrainingPlan(goal, activities, daysPerWeek, mode);
  
  // Log validation errors if any
  if (!validation.isValid) {
    console.warn("Plan validation errors:", validation.errors);
  }
  if (validation.warnings.length > 0) {
    console.warn("Plan validation warnings:", validation.warnings);
  }
  
  // Convert canonical plan to database format
  if (plan.status !== "ready" || plan.weeks.length === 0) {
    throw new Error("Plan generation failed: " + (validation.errors[0] || "Unknown error"));
  }
  
  // Delete existing plan if regenerating
  const existingPlan = await getCurrentPlan();
  if (existingPlan) {
    await prisma.planItem.deleteMany({ where: { planId: existingPlan.id } });
    await prisma.plan.delete({ where: { id: existingPlan.id } });
  }
  
  // Create plan in database
  const planStart = new Date(plan.weeks[0].days[0].date);
  planStart.setHours(0, 0, 0, 0);
  
  // Flatten all days from all weeks
  const allDays = plan.weeks.flatMap((week) => week.days);
  
  // Store fingerprint in first item's notes (we'll check this in UI)
  const fingerprintNote = `[ENGINE_V1_FINGERPRINT:${plan.meta.fingerprint}]`;
  
  const dbPlan = await prisma.plan.create({
    data: {
      userId: user.id,
      startDate: planStart,
      items: {
        create: allDays.map((day, index) => {
          const dayDate = new Date(day.date);
          dayDate.setHours(0, 0, 0, 0);
          
          // Convert miles to meters
          const distanceMeters = day.miles * 1609.34;
          
          // Convert pace range (sec/mile) to target pace (sec/meter)
          // Store full range in notes as JSON, also store midpoint as targetPace for compatibility
          const paceSecPerMile = day.paceRange
            ? (day.paceRange[0] + day.paceRange[1]) / 2
            : null;
          const targetPace = paceSecPerMile ? paceSecPerMile / 1609.34 : null;
          
          // Store pace range in notes as JSON: [paceRangeMinSecPerMile, paceRangeMaxSecPerMile]
          // Store fingerprint in first item's notes
          let notes: string | null = index === 0 ? fingerprintNote : null;
          if (day.notes) {
            notes = notes ? `${notes} ${day.notes}`.trim() : day.notes;
          }
          if (day.paceRange) {
            const paceRangeJson = `[PACERANGE:${day.paceRange[0]},${day.paceRange[1]}]`;
            notes = notes ? `${notes} ${paceRangeJson}` : paceRangeJson;
          }
          // Ensure empty string becomes null
          if (notes) {
            notes = notes.trim();
            if (notes === "") {
              notes = null;
            }
          }
          
          return {
            date: dayDate,
            type: day.type,
            distanceMeters: day.type !== "rest" ? distanceMeters : null,
            notes,
            targetPace,
          };
        }),
      },
    },
    include: { items: true },
  });
  
  // Log fingerprint for debugging
  if (process.env.NODE_ENV === 'development') {
    console.log('[PLAN ENGINE] Generated plan with fingerprint:', plan.meta.fingerprint);
    console.log('[PLAN ENGINE] Generated at:', plan.meta.generatedAt);
    console.log('[PLAN ENGINE] Provenance:', plan.meta.provenance);
  }
  
  revalidatePath("/dashboard");
  revalidatePath("/settings");
  
  return {
    plan: dbPlan,
    rationale: `Generated ${plan.weeks.length}-week ${plan.meta.provenance} plan. ` +
      `Starting at ${plan.weeks[0].totalMiles.toFixed(1)} mi/week, ` +
      `peaking at ${Math.max(...plan.weeks.map((w) => w.totalMiles)).toFixed(1)} mi/week.`,
    weeklyMileage: plan.weeks[0].totalMiles,
    weeklyMileageProgression: plan.weeks.map((w) => ({
      week: w.weekNumber,
      mileageKm: w.totalMiles * 1.60934, // Convert to km for compatibility
    })),
  };
}

/**
 * Update plan from recent runs using canonical plan engine
 */
export async function updatePlanFromRecentRuns() {
  // Same as generateGoalBasedPlan - regenerates with latest activities
  return generateGoalBasedPlan();
}

function getMonday(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  const result = new Date(d);
  result.setDate(diff);
  result.setHours(0, 0, 0, 0);
  return result;
}

export async function getCoachMessages(limit: number = 20) {
  const user = await getOrCreateUser();
  return prisma.coachMessage.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
}

export async function sendCoachMessage(content: string, relatedActivityId?: string) {
  const user = await getOrCreateUser();
  
  // Create user message
  await prisma.coachMessage.create({
    data: {
      userId: user.id,
      role: "user",
      content,
      relatedActivityId,
    },
  });

  // Get context
  const goal = await getUserGoal();
  const activities = await getActivities(30);
  const signals = await getTrainingSignals();
  const plan = await getCurrentPlan();
  const recentMessages = await getCoachMessages(10);
  const distanceUnit = await getUserDistanceUnit();

  const context = buildCoachContext(goal, activities, signals, plan, recentMessages, distanceUnit);

  // Generate response
  const response = await generateCoachResponse(content, context);

  // Create assistant message with full response including recommendation
  let messageContent = `${response.summary}\n\n${response.coachingNote}`;
  if (response.recommendation) {
    messageContent += `\n\n💡 Recommendation: ${response.recommendation.description}`;
    if (response.recommendation.reasoning) {
      messageContent += `\n\nReasoning: ${response.recommendation.reasoning}`;
    }
  }
  if (response.question) {
    messageContent += `\n\n${response.question}`;
  }

  const message = await prisma.coachMessage.create({
    data: {
      userId: user.id,
      role: "assistant",
      content: messageContent,
    },
  });

  revalidatePath("/dashboard");
  return { 
    response, 
    messageId: message.id,
    hasRecommendation: !!response.recommendation,
    recommendation: response.recommendation 
  };
}

/**
 * PLAN GENERATOR REMOVED
 * 
 * This function is disabled. Plan generation will be rebuilt.
 */
export async function acceptRecommendation(messageId: string, recommendation: any) {
  throw new Error("Training plan generation is temporarily disabled while we rebuild it. Please check back soon.");
  
  // OLD CODE (disabled):
  // ... (entire plan creation logic removed)
}

export async function rejectRecommendation(messageId: string) {
  const user = await getOrCreateUser();
  
  // Add acknowledgment message
  await prisma.coachMessage.create({
    data: {
      userId: user.id,
      role: "assistant",
      content: "Understood. Your current plan remains unchanged. Feel free to ask if you'd like to discuss alternatives.",
    },
  });

  revalidatePath("/dashboard");
}

export async function getStravaAuthUrl(state?: string) {
  const client = new StravaClient();
  if (!client.isConfigured()) {
    throw new Error("Strava not configured");
  }
  return client.getAuthorizationUrl(state);
}

export async function handleStravaCallback(code: string) {
  const user = await getOrCreateUser();
  const client = new StravaClient();
  const tokens = await client.exchangeCode(code);

  await prisma.stravaToken.upsert({
    where: { userId: user.id },
    update: {
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiresAt: new Date(tokens.expires_at * 1000),
    },
    create: {
      userId: user.id,
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiresAt: new Date(tokens.expires_at * 1000),
    },
  });

  await syncStravaActivities();
  revalidatePath("/settings");
}

export async function isStravaConnected() {
  const user = await getOrCreateUser();
  const token = await prisma.stravaToken.findUnique({ where: { userId: user.id } });
  return !!token;
}
