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
 * PLAN GENERATOR REMOVED
 * 
 * Training plan generation has been removed and will be rebuilt.
 * This function now returns null to show empty state in the UI.
 * 
 * Call chain:
 * - app/dashboard/page.tsx → getCurrentPlan() → returns null
 * - dashboard-client.tsx receives plan=null → shows empty state
 * - PlanViewer is not rendered when plan is null
 */
export async function getCurrentPlan() {
  // Return null to show empty state - plan generation is disabled
  return null;
  
  // OLD CODE (disabled):
  // const user = await getOrCreateUser();
  // const now = new Date();
  // const monday = getMonday(now);
  // monday.setHours(0, 0, 0, 0);
  // 
  // return prisma.plan.findFirst({
  //   where: {
  //     userId: user.id,
  //     startDate: { gte: monday },
  //   },
  //   include: { items: { orderBy: { date: "asc" } } },
  //   orderBy: { startDate: "asc" },
  // });
}

/**
 * PLAN GENERATOR REMOVED
 * 
 * This function is disabled. Plan generation will be rebuilt.
 */
export async function regeneratePlan() {
  throw new Error("Training plan generation is temporarily disabled while we rebuild it. Please check back soon.");
}

/**
 * PLAN GENERATOR REMOVED
 * 
 * This function is disabled. Plan generation will be rebuilt.
 */
export async function generateGoalBasedPlan() {
  throw new Error("Training plan generation is temporarily disabled while we rebuild it. Please check back soon.");
  
  // OLD CODE (disabled - kept for reference):
  // const user = await getOrCreateUser();
  // const goal = await getUserGoal();
  // const activities = await getActivities(42);
  // const distanceUnit = await getUserDistanceUnit();
  // ... (entire generation logic removed)
}

/**
 * PLAN GENERATOR REMOVED
 * 
 * This function is disabled. Plan generation will be rebuilt.
 */
export async function updatePlanFromRecentRuns() {
  throw new Error("Training plan generation is temporarily disabled while we rebuild it. Please check back soon.");
  
  // OLD CODE (disabled - kept for reference):
  // ... (entire generation logic removed)
}

function getMonday(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  return new Date(d.setDate(diff));
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
