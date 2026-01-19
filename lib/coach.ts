import { Activity, Goal, Plan, PlanItem, CoachMessage } from "@prisma/client";
import { TrainingSignals, getLastRunSummary } from "./training";
import OpenAI from "openai";
import { formatDistance, formatPace, metersToUnit, DistanceUnit } from "./units";

export interface CoachContext {
  goal: Goal | null;
  signals: TrainingSignals;
  lastRun: { date: Date; distanceKm: number; timeMinutes: number; pace: string; intensity: string; heartRate?: number } | null;
  currentPlan: (Plan & { items: PlanItem[] }) | null;
  recentMessages: CoachMessage[];
  distanceUnit: "km" | "mi";
}

export interface CoachResponse {
  summary: string;
  coachingNote: string;
  recommendation?: {
    type: "plan_adjustment" | "rest_day" | "intensity_change" | "volume_change";
    description: string;
    planAdjustments?: Omit<PlanItem, "id" | "planId" | "createdAt">[];
    reasoning: string;
  };
  question?: string;
}

const SYSTEM_PROMPT = `You are Stenlake, a running coach assistant. Your role is to provide calm, authoritative coaching guidance grounded in the runner's actual training data.

Guidelines:
- Be conversational, helpful, and supportive - like a trusted coach
- Ground all responses in the runner's recent activities, training signals, and current plan
- If the user references "my last run" or "today's run", summarize that run briefly before coaching
- For pain/injury mentions, respond conservatively: recommend reducing load and considering professional care
- When appropriate, provide actionable recommendations that the user can accept or reject
- Recommendations should be specific: "I recommend adding a rest day tomorrow" or "Let's increase your long run by 2km this week"
- Output structured JSON with: summary (brief 1-2 sentences), coachingNote (conversational 2-4 sentences), optional recommendation (with type, description, planAdjustments if changing plan, and reasoning), optional question

Keep responses professional, conversational, and focused on training science. Be encouraging but realistic.`;

/**
 * Build coach context from user data
 */
export function buildCoachContext(
  goal: Goal | null,
  activities: Activity[],
  signals: TrainingSignals,
  plan: (Plan & { items: PlanItem[] }) | null,
  recentMessages: CoachMessage[],
  distanceUnit: DistanceUnit = "km"
): CoachContext {
  const lastRun = getLastRunSummary(activities, signals.medianPace);

  return {
    goal,
    signals,
    lastRun: lastRun ? {
      date: lastRun.date,
      distanceKm: lastRun.distanceKm,
      timeMinutes: lastRun.timeMinutes,
      pace: lastRun.pace,
      intensity: lastRun.intensity,
      heartRate: lastRun.heartRate,
    } : null,
    currentPlan: plan,
    recentMessages: recentMessages.slice(-10), // Last 10 messages
    distanceUnit,
  };
}

/**
 * Generate coach response using OpenAI or stub
 */
export async function generateCoachResponse(
  userMessage: string,
  context: CoachContext
): Promise<CoachResponse> {
  const openaiKey = process.env.OPENAI_API_KEY;

  if (!openaiKey) {
    return generateStubResponse(userMessage, context);
  }

  const openai = new OpenAI({ apiKey: openaiKey });

  const contextStr = formatContext(context);
  const messagesStr = context.recentMessages
    .map((m) => `${m.role}: ${m.content}`)
    .join("\n");

  const prompt = `${contextStr}\n\nRecent conversation:\n${messagesStr}\n\nUser: ${userMessage}\n\nAssistant:`;

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4-turbo-preview",
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: prompt },
      ],
      temperature: 0.7,
      response_format: { type: "json_object" },
    });

    const content = completion.choices[0]?.message?.content;
    if (!content) {
      throw new Error("Empty response from OpenAI");
    }

    const parsed = JSON.parse(content) as CoachResponse;
    return parsed;
  } catch (error) {
    console.error("OpenAI error:", error);
    return generateStubResponse(userMessage, context);
  }
}

function formatContext(context: CoachContext): string {
  const parts: string[] = [];
  const unit = context.distanceUnit;

  if (context.goal) {
    const goalDistance = formatDistance(context.goal.distance, unit);
    const goalTimeMin = Math.floor(context.goal.targetTimeSeconds / 60);
    const goalPaceSecondsPerMeter = context.goal.targetTimeSeconds / context.goal.distance;
    const goalPaceStr = formatPace(goalPaceSecondsPerMeter, unit);
    parts.push(`Goal: ${goalDistance} race in ${goalTimeMin} minutes (target pace: ${goalPaceStr})`);
  }

  if (context.signals.weeklyMileage.length > 0) {
    const last = context.signals.weeklyMileage[context.signals.weeklyMileage.length - 1];
    const weeklyMileage = metersToUnit(last.mileageKm * 1000, unit);
    const unitLabel = unit === "mi" ? "mi" : "km";
    parts.push(`Current weekly mileage: ${weeklyMileage.toFixed(1)}${unitLabel} (trend: ${context.signals.mileageTrend})`);
  }

  parts.push(`Intensity distribution: ${context.signals.intensityDistribution.easy} easy, ${context.signals.intensityDistribution.moderate} moderate, ${context.signals.intensityDistribution.hard} hard runs`);
  
  if (context.signals.fatigueRisk) {
    parts.push("Fatigue risk: HIGH");
  }

  if (context.lastRun) {
    const lastRunDistance = formatDistance(context.lastRun.distanceKm * 1000, unit);
    const paceSecondsPerMeter = context.lastRun.distanceKm > 0 
      ? (context.lastRun.timeMinutes * 60) / (context.lastRun.distanceKm * 1000)
      : 0;
    const paceStr = formatPace(paceSecondsPerMeter, unit);
    parts.push(`Last run: ${lastRunDistance} in ${context.lastRun.timeMinutes}min at ${paceStr} (${context.lastRun.intensity} intensity)`);
  }

  if (context.currentPlan) {
    const items = context.currentPlan.items
      .map((i) => `${i.date.toISOString().split("T")[0]}: ${i.type}${i.distanceMeters ? ` (${formatDistance(i.distanceMeters, unit)})` : ""}`)
      .join(", ");
    parts.push(`Current plan: ${items}`);
  }

  return parts.join("\n");
}


function generateStubResponse(userMessage: string, context: CoachContext): CoachResponse {
  const lower = userMessage.toLowerCase();
  const unit = context.distanceUnit;

  if (lower.includes("last run") || lower.includes("today's run") || lower.includes("yesterday")) {
    if (context.lastRun) {
      const lastRunDistance = formatDistance(context.lastRun.distanceKm * 1000, unit);
      const paceSecondsPerMeter = context.lastRun.distanceKm > 0 
        ? (context.lastRun.timeMinutes * 60) / (context.lastRun.distanceKm * 1000)
        : 0;
      const paceStr = formatPace(paceSecondsPerMeter, unit);
      return {
        summary: `Your last run was ${lastRunDistance} in ${context.lastRun.timeMinutes} minutes at ${paceStr}.`,
        coachingNote: `This was a ${context.lastRun.intensity} effort. ${context.signals.fatigueRisk ? "Given your recent training load, consider taking a recovery day." : "Maintain consistency with your plan."}`,
      };
    }
  }

  if (lower.includes("fatigue") || lower.includes("tired")) {
    const planAdjustments = context.currentPlan?.items.map((item) => {
      if (item.type === "rest") return item;
      return {
        ...item,
        distanceMeters: item.distanceMeters ? Math.round(item.distanceMeters * 0.85) : null,
        notes: item.notes ? `${item.notes} (reduced due to fatigue)` : "Reduced due to fatigue",
      };
    });

    return {
      summary: "Fatigue management is important for long-term progress.",
      coachingNote: context.signals.fatigueRisk
        ? "Your recent training pattern suggests elevated fatigue risk. I recommend reducing this week's volume by 15% and removing quality sessions until you feel recovered."
        : "Monitor your recovery. Ensure adequate sleep and nutrition. If fatigue persists, consider a rest day.",
      recommendation: planAdjustments ? {
        type: "volume_change" as const,
        description: "Reduce this week's training volume by 15% to manage fatigue",
        planAdjustments,
        reasoning: "Your training pattern indicates elevated fatigue risk. Reducing volume will help recovery while maintaining fitness.",
      } : undefined,
    };
  }

  if (lower.includes("knee") || lower.includes("pain") || lower.includes("injury") || lower.includes("hurt")) {
    const planAdjustments = context.currentPlan?.items.map((item) => ({
      ...item,
      type: "rest" as const,
      distanceMeters: null,
      notes: "Rest due to pain/injury concern",
      targetPace: null,
    }));

    return {
      summary: "Pain requires careful management to prevent injury.",
      coachingNote: "I recommend reducing training load immediately. Avoid high-impact activities. If pain persists beyond 2-3 days of rest, consult a healthcare professional or physical therapist. Prioritize recovery over training goals.",
      recommendation: planAdjustments ? {
        type: "rest_day" as const,
        description: "Replace upcoming runs with rest days until pain subsides",
        planAdjustments,
        reasoning: "Pain requires immediate rest to prevent further injury. Consult a healthcare professional if pain persists.",
      } : undefined,
    };
  }

  if (lower.includes("push") || lower.includes("more") || lower.includes("increase")) {
    return {
      summary: "Progressive overload should be gradual to avoid injury.",
      coachingNote: context.signals.fatigueRisk
        ? "Given your current fatigue risk, increasing load now is not advisable. Focus on consistency first."
        : "You can gradually increase weekly mileage by 5-10% or add one quality session per week. Monitor recovery closely.",
    };
  }

  if (lower.includes("time") || lower.includes("short") || lower.includes("busy")) {
    const planAdjustments = context.currentPlan?.items.map((item) => {
      if (item.type === "easy" && item.distanceMeters) {
        return {
          ...item,
          distanceMeters: Math.round(item.distanceMeters * 0.7),
          notes: "Shortened due to time constraints",
        };
      }
      return item;
    });

    return {
      summary: "Time-constrained training can still be effective.",
      coachingNote: "Focus on quality over quantity. Shorter tempo runs or interval sessions can maintain fitness. Consider reducing easy run distance while keeping quality sessions intact.",
      recommendation: planAdjustments ? {
        type: "volume_change" as const,
        description: "Shorten easy runs by 30% to fit your schedule while maintaining quality sessions",
        planAdjustments,
        reasoning: "Reducing easy run distance preserves time for quality work, which is more time-efficient for maintaining fitness.",
      } : undefined,
    };
  }

  // Default response
  return {
    summary: "Your training is progressing.",
    coachingNote: context.signals.fatigueRisk
      ? "Monitor your recovery. Your recent pattern suggests elevated fatigue. Consider a lighter week."
      : "Continue following your plan. Consistency is key for achieving your goal.",
  };
}
