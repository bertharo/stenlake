"use server";

import { prisma } from "./prisma";
import { StravaClient, MockActivitiesAdapter, stravaActivityToActivity } from "./strava";
import { computeSignals, generateNext7DaysPlan, getLastRunSummary, TrainingSignals } from "./training";
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

  // Regenerate plan after sync
  await regeneratePlan();
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

  await regeneratePlan();
  revalidatePath("/dashboard");
}

export async function getCurrentPlan() {
  const user = await getOrCreateUser();
  const now = new Date();
  const monday = getMonday(now);
  
  return prisma.plan.findFirst({
    where: {
      userId: user.id,
      startDate: { gte: monday },
    },
    include: { items: { orderBy: { date: "asc" } } },
    orderBy: { startDate: "asc" },
  });
}

export async function regeneratePlan() {
  const user = await getOrCreateUser();
  const signals = await getTrainingSignals();
  const existingPlan = await getCurrentPlan();

  const { startDate, items } = await generateNext7DaysPlan(user.id, signals, existingPlan || undefined);

  // Delete existing plan if regenerating
  if (existingPlan) {
    await prisma.planItem.deleteMany({ where: { planId: existingPlan.id } });
    await prisma.plan.delete({ where: { id: existingPlan.id } });
  }

  const plan = await prisma.plan.create({
    data: {
      userId: user.id,
      startDate,
      items: {
        create: items,
      },
    },
    include: { items: true },
  });

  return plan;
}

export async function generateGoalBasedPlan() {
  const user = await getOrCreateUser();
  const goal = await getUserGoal();
  const signals = await getTrainingSignals();
  const activities = await getActivities(30);
  const distanceUnit = await getUserDistanceUnit();

  if (!goal) {
    throw new Error("No goal set. Please set a race goal first.");
  }

  const { generateGoalBasedPlan } = await import("./plan-generator");
  const planData = generateGoalBasedPlan({
    goal,
    signals,
    activities,
    distanceUnit,
  });

  // Delete existing plan if regenerating
  const existingPlan = await getCurrentPlan();
  if (existingPlan) {
    await prisma.planItem.deleteMany({ where: { planId: existingPlan.id } });
    await prisma.plan.delete({ where: { id: existingPlan.id } });
  }

  const plan = await prisma.plan.create({
    data: {
      userId: user.id,
      startDate: planData.startDate,
      items: {
        create: planData.items.map((item) => ({
          date: item.date,
          type: item.type,
          distanceMeters: item.distanceMeters,
          notes: item.notes,
          targetPace: item.targetPace,
        })),
      },
    },
    include: { items: true },
  });

  revalidatePath("/dashboard");
  revalidatePath("/settings");
  
  return { plan, rationale: planData.rationale, weeklyMileage: planData.weeklyMileage };
}

export async function updatePlanFromRecentRuns() {
  const user = await getOrCreateUser();
  const goal = await getUserGoal();
  const signals = await getTrainingSignals();
  const activities = await getActivities(30);
  const distanceUnit = await getUserDistanceUnit();
  const existingPlan = await getCurrentPlan();

  if (!goal) {
    throw new Error("No goal set. Please set a race goal first.");
  }

  // Regenerate plan based on updated signals from recent runs
  const { generateGoalBasedPlan } = await import("./plan-generator");
  const planData = generateGoalBasedPlan({
    goal,
    signals,
    activities,
    distanceUnit,
  });

  // Update existing plan
  if (existingPlan) {
    await prisma.planItem.deleteMany({ where: { planId: existingPlan.id } });
    await prisma.plan.update({
      where: { id: existingPlan.id },
      data: {
        startDate: planData.startDate,
        items: {
          create: planData.items.map((item) => ({
            date: item.date,
            type: item.type,
            distanceMeters: item.distanceMeters,
            notes: item.notes,
            targetPace: item.targetPace,
          })),
        },
      },
    });
  } else {
    // Create new plan if none exists
    await prisma.plan.create({
      data: {
        userId: user.id,
        startDate: planData.startDate,
        items: {
          create: planData.items.map((item) => ({
            date: item.date,
            type: item.type,
            distanceMeters: item.distanceMeters,
            notes: item.notes,
            targetPace: item.targetPace,
          })),
        },
      },
    });
  }

  revalidatePath("/dashboard");
  revalidatePath("/settings");
  
  return { rationale: planData.rationale, weeklyMileage: planData.weeklyMileage };
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

export async function acceptRecommendation(messageId: string, recommendation: any) {
  const user = await getOrCreateUser();
  let plan = await getCurrentPlan();
  
  if (!recommendation?.planAdjustments || recommendation.planAdjustments.length === 0) {
    throw new Error("No recommendation adjustments found");
  }

  // If no plan exists, create one
  if (!plan) {
    const getMonday = (date: Date): Date => {
      const d = new Date(date);
      const day = d.getDay();
      const diff = d.getDate() - day + (day === 0 ? -6 : 1);
      return new Date(d.setDate(diff));
    };
    
    const monday = getMonday(new Date());
    monday.setHours(0, 0, 0, 0);
    
    plan = await prisma.plan.create({
      data: {
        userId: user.id,
        startDate: monday,
        items: {
          create: recommendation.planAdjustments.map((item: any) => ({
            date: new Date(item.date),
            type: item.type,
            distanceMeters: item.distanceMeters,
            notes: item.notes || null,
            targetPace: item.targetPace || null,
          })),
        },
      },
      include: { items: true },
    });
  } else {
    // Update existing plan
    if (!plan) {
      throw new Error("Plan not found");
    }
    await prisma.planItem.deleteMany({ where: { planId: plan.id } });
    await prisma.planItem.createMany({
      data: recommendation.planAdjustments.map((item: any) => ({
        planId: plan.id,
        date: new Date(item.date),
        type: item.type,
        distanceMeters: item.distanceMeters || null,
        notes: item.notes || null,
        targetPace: item.targetPace || null,
      })),
    });
  }

  // Mark the recommendation message as accepted (store in a system message)
  await prisma.coachMessage.create({
    data: {
      userId: user.id,
      role: "system",
      content: `Recommendation accepted: ${recommendation.description || "Plan updated"}`,
    },
  });

  revalidatePath("/dashboard");
  return { success: true, plan };
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
