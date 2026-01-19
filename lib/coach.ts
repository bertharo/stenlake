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
  recentActivities: Activity[]; // Last 10-15 activities for context
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

const SYSTEM_PROMPT = `You are Stenlake, a running coach assistant. Your role is to provide calm, authoritative coaching guidance grounded in the runner's ACTUAL training data.

CRITICAL: You have access to the runner's real training history including:
- Their actual recent runs with dates, distances, paces, times, and heart rates
- Weekly mileage trends over the past 4 weeks
- Their current training plan with specific workouts
- Their race goal and target pace
- Intensity distribution of their runs

Guidelines:
- ALWAYS answer the user's specific question directly. If they ask about heart rate, tell them their heart rate. If they ask about their next run, tell them about their next scheduled run.
- ALWAYS reference specific runs, dates, distances, paces, and heart rates from their actual training data
- Use concrete numbers: "Your run on [date] was [distance] at [pace] with an average heart rate of [HR]bpm" not generic statements
- Compare their recent runs to identify patterns: "You've run [X] times in the last week, averaging [Y] distance"
- Ground recommendations in their actual training volume and patterns
- If they ask about a specific run, reference the exact details from their training log
- Be conversational, helpful, and supportive - like a trusted coach who knows their training intimately
- For pain/injury mentions, respond conservatively: recommend reducing load and considering professional care
- When appropriate, provide actionable recommendations that the user can accept or reject
- Recommendations should be specific and data-driven: "Based on your 25km last week, I recommend adding a rest day tomorrow" or "Your last 3 runs averaged 8km, so let's increase your long run to 12km this week"
- When the user asks for a "recommended run", "what should I run", "suggest a run", or similar, provide a SPECIFIC run recommendation with:
  * Run type (easy, tempo, interval, long)
  * Distance in the user's preferred unit (km or miles) - base this on their recent training volume
  * Target pace - base this on their actual recent paces
  * Brief notes/instructions
  * Include this as a recommendation with planAdjustments if appropriate
- Output structured JSON with: summary (brief 1-2 sentences directly answering their question), coachingNote (conversational 2-4 sentences with context), optional recommendation (with type, description, planAdjustments if changing plan, and reasoning), optional question

NEVER use generic or dummy data. Always reference their actual training history with specific dates, distances, paces, and heart rates. If the user asks a specific question, answer it directly using the data provided.`;

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
    recentActivities: activities.slice(0, 15), // Last 15 activities for detailed context
  };
}

/**
 * Generate coach response using OpenAI or stub
 */
export async function generateCoachResponse(
  userMessage: string,
  context: CoachContext
): Promise<CoachResponse> {
  const openaiKey = process.env.OPENAI_API_KEY?.trim();

  if (!openaiKey) {
    return generateStubResponse(userMessage, context);
  }

  const openai = new OpenAI({ apiKey: openaiKey });

  const contextStr = formatContext(context);

  // Build conversation history properly
  const messages: Array<{ role: "system" | "user" | "assistant"; content: string }> = [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: `Here is the runner's training context:\n\n${contextStr}` },
  ];

  // Add recent conversation history (last 10 messages, in chronological order)
  const recentMessages = [...context.recentMessages].reverse(); // Reverse to get chronological order
  recentMessages.forEach((msg) => {
    if (msg.role === "user" || msg.role === "assistant") {
      messages.push({
        role: msg.role,
        content: msg.content,
      });
    }
  });

  // Add current user message
  messages.push({ role: "user", content: userMessage });

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o", // Use gpt-4o instead of gpt-4-turbo-preview (more reliable)
      messages: messages,
      temperature: 0.7,
      response_format: { type: "json_object" },
    });

    const content = completion.choices[0]?.message?.content;
    if (!content) {
      throw new Error("Empty response from OpenAI");
    }

    const parsed = JSON.parse(content) as CoachResponse;
    
    // Validate response has required fields
    if (!parsed.summary || !parsed.coachingNote) {
      throw new Error("Invalid response format from OpenAI");
    }
    
    return parsed;
  } catch (error: any) {
    console.error("OpenAI error:", error);
    console.error("Error details:", {
      message: error.message,
      code: error.code,
      status: error.status,
      type: error.type,
    });
    
    // Only fall back to stub if it's a real error, not just a parsing issue
    if (error.code === "invalid_api_key" || error.status === 401) {
      console.error("OpenAI API key is invalid or missing");
    }
    
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
    parts.push(`Goal: ${goalDistance} race on ${context.goal.raceDate.toLocaleDateString()} in ${goalTimeMin} minutes (target pace: ${goalPaceStr})`);
  }

  // Weekly mileage history (last 4 weeks)
  if (context.signals.weeklyMileage.length > 0) {
    const recentWeeks = context.signals.weeklyMileage.slice(-4);
    const weeklyData = recentWeeks.map(w => {
      const mileage = metersToUnit(w.mileageKm * 1000, unit);
      return `${w.week}: ${mileage.toFixed(1)}${unit === "mi" ? "mi" : "km"}`;
    }).join(", ");
    parts.push(`Weekly mileage (last 4 weeks): ${weeklyData}`);
    parts.push(`Mileage trend: ${context.signals.mileageTrend}`);
  }

  // Last week stats
  if (context.signals.lastWeekStats) {
    const total = metersToUnit(context.signals.lastWeekStats.totalMileageKm * 1000, unit);
    const avg = metersToUnit(context.signals.lastWeekStats.averageDistanceKm * 1000, unit);
    parts.push(`Last week: ${total.toFixed(1)}${unit === "mi" ? "mi" : "km"} total, ${avg.toFixed(1)}${unit === "mi" ? "mi" : "km"} average per run (${context.signals.lastWeekStats.runCount} runs)`);
  }

  parts.push(`Intensity distribution (last 30 days): ${context.signals.intensityDistribution.easy} easy, ${context.signals.intensityDistribution.moderate} moderate, ${context.signals.intensityDistribution.hard} hard runs`);
  
  if (context.signals.fatigueRisk) {
    parts.push("⚠️ Fatigue risk: HIGH - recent training pattern suggests elevated fatigue");
  }

  // Recent activities (last 10 runs with details)
  if (context.recentActivities.length > 0) {
    parts.push(`\nRecent runs (last ${Math.min(10, context.recentActivities.length)}):`);
    context.recentActivities.slice(0, 10).forEach((activity, idx) => {
      const date = new Date(activity.startDate);
      const distance = formatDistance(activity.distanceMeters, unit);
      const paceSecondsPerMeter = activity.movingTimeSeconds / activity.distanceMeters;
      const paceStr = formatPace(paceSecondsPerMeter, unit);
      const timeMin = Math.round(activity.movingTimeSeconds / 60);
      const daysAgo = Math.floor((Date.now() - date.getTime()) / (1000 * 60 * 60 * 24));
      const dateLabel = daysAgo === 0 ? "Today" : daysAgo === 1 ? "Yesterday" : `${daysAgo} days ago`;
      
      parts.push(`  ${dateLabel} (${date.toLocaleDateString()}): ${distance} in ${timeMin}min at ${paceStr}${activity.avgHeartRate ? `, HR: ${activity.avgHeartRate}bpm` : ""}`);
    });
  }

  if (context.lastRun) {
    const lastRunDistance = formatDistance(context.lastRun.distanceKm * 1000, unit);
    const paceSecondsPerMeter = context.lastRun.distanceKm > 0 
      ? (context.lastRun.timeMinutes * 60) / (context.lastRun.distanceKm * 1000)
      : 0;
    const paceStr = formatPace(paceSecondsPerMeter, unit);
    const daysSince = Math.floor((Date.now() - context.lastRun.date.getTime()) / (1000 * 60 * 60 * 24));
    const hrInfo = context.lastRun.heartRate ? `, average heart rate: ${context.lastRun.heartRate}bpm` : "";
    parts.push(`\nMost recent run: ${lastRunDistance} in ${context.lastRun.timeMinutes}min at ${paceStr} (${context.lastRun.intensity} intensity)${hrInfo}${daysSince > 0 ? `, ${daysSince} day${daysSince > 1 ? "s" : ""} ago` : " today"}`);
  }

  if (context.currentPlan) {
    parts.push(`\nCurrent training plan (this week):`);
    context.currentPlan.items.forEach((item) => {
      const date = new Date(item.date);
      const dateStr = date.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
      const distance = item.distanceMeters ? formatDistance(item.distanceMeters, unit) : "rest";
      const pace = item.targetPace ? formatPace(item.targetPace, unit) : "";
      parts.push(`  ${dateStr}: ${item.type}${distance !== "rest" ? ` - ${distance}${pace ? ` at ${pace}` : ""}` : ""}${item.notes ? ` (${item.notes})` : ""}`);
    });
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

  // Handle plan-related questions
  if (lower.includes("plan") || lower.includes("week") || lower.includes("training plan") || lower.includes("schedule")) {
    if (context.goal && context.currentPlan) {
      const weeksUntilRace = Math.ceil(
        (context.goal.raceDate.getTime() - Date.now()) / (7 * 24 * 60 * 60 * 1000)
      );
      const goalDistance = formatDistance(context.goal.distance, unit);
      const goalTimeMin = Math.floor(context.goal.targetTimeSeconds / 60);
      
      // Summarize current plan
      const planSummary = context.currentPlan.items
        .filter(item => item.type !== "rest")
        .map(item => {
          const distance = item.distanceMeters ? formatDistance(item.distanceMeters, unit) : "";
          return `${item.type}${distance ? ` ${distance}` : ""}`;
        })
        .join(", ");
      
      const weeklyTotal = context.currentPlan.items
        .filter(item => item.distanceMeters)
        .reduce((sum, item) => sum + (item.distanceMeters || 0), 0);
      const weeklyTotalFormatted = formatDistance(weeklyTotal, unit);
      
      return {
        summary: `You have ${weeksUntilRace} weeks until your ${goalDistance} race (target: ${goalTimeMin} minutes).`,
        coachingNote: `Your current weekly plan includes ${planSummary}. Total weekly volume: ${weeklyTotalFormatted}. ${context.signals.fatigueRisk ? "Given your recent fatigue risk, consider reducing intensity this week." : "This plan aligns with your goal and current fitness level. Focus on consistency and recovery between runs."}`,
        question: "Would you like me to adjust your plan based on your recent runs?",
      };
    } else if (context.goal) {
      const weeksUntilRace = Math.ceil(
        (context.goal.raceDate.getTime() - Date.now()) / (7 * 24 * 60 * 60 * 1000)
      );
      const goalDistance = formatDistance(context.goal.distance, unit);
      const goalTimeMin = Math.floor(context.goal.targetTimeSeconds / 60);
      
      return {
        summary: `You have ${weeksUntilRace} weeks until your ${goalDistance} race (target: ${goalTimeMin} minutes).`,
        coachingNote: `You don't have a training plan yet. Based on your recent training, I can generate a ${weeksUntilRace}-week plan tailored to your goal. ${context.signals.lastWeekStats ? `Your last week was ${metersToUnit(context.signals.lastWeekStats.totalMileageKm * 1000, unit).toFixed(1)}${unit === "mi" ? "mi" : "km"} across ${context.signals.lastWeekStats.runCount} runs.` : ""} Would you like me to create a plan?`,
        question: "Generate a training plan for me",
      };
    }
  }

  // Handle run recommendation requests
  if (lower.includes("recommend") && (lower.includes("run") || lower.includes("workout") || lower.includes("training"))) {
    const unit = context.distanceUnit;
    const nextRun = context.currentPlan?.items.find((item) => {
      const itemDate = new Date(item.date);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      itemDate.setHours(0, 0, 0, 0);
      return itemDate >= today && item.type !== "rest";
    });

    if (nextRun && nextRun.distanceMeters) {
      const distance = formatDistance(nextRun.distanceMeters, unit);
      const paceSecondsPerMeter = context.signals.medianPace;
      const targetPace = nextRun.targetPace || paceSecondsPerMeter;
      const paceStr = formatPace(targetPace, unit);

      return {
        summary: `I recommend a ${nextRun.type} run of ${distance} at ${paceStr} pace.`,
        coachingNote: nextRun.notes || `Based on your current plan, this ${nextRun.type} run fits well with your training progression. ${context.signals.fatigueRisk ? "Given your recent fatigue risk, keep the effort controlled." : "Focus on maintaining consistent pace throughout."}`,
        recommendation: {
          type: "plan_adjustment" as const,
          description: `${nextRun.type.charAt(0).toUpperCase() + nextRun.type.slice(1)} run: ${distance} at ${paceStr}`,
          planAdjustments: [{
            date: nextRun.date,
            type: nextRun.type,
            distanceMeters: nextRun.distanceMeters,
            notes: nextRun.notes || `Recommended ${nextRun.type} run`,
            targetPace: nextRun.targetPace,
          }],
          reasoning: `This run aligns with your current training plan and helps maintain progression toward your goal.`,
        },
      };
    }

    // If no plan, suggest based on last run and signals
    if (context.lastRun) {
      const lastRunDistance = context.lastRun.distanceKm * 1000;
      const suggestedDistance = context.signals.fatigueRisk 
        ? lastRunDistance * 0.8 
        : lastRunDistance * 1.1;
      const suggestedType = context.signals.fatigueRisk ? "easy" : "moderate";
      const paceSecondsPerMeter = context.signals.medianPace;
      const targetPace = suggestedType === "easy" ? paceSecondsPerMeter * 1.08 : paceSecondsPerMeter;
      const paceStr = formatPace(targetPace, unit);
      const distance = formatDistance(suggestedDistance, unit);

      return {
        summary: `I recommend an ${suggestedType} run of ${distance} at ${paceStr} pace.`,
        coachingNote: context.signals.fatigueRisk
          ? "Given your recent fatigue risk, I'm suggesting a slightly shorter, easier run to aid recovery while maintaining fitness."
          : "This run builds on your recent training and helps maintain consistency. Keep the effort controlled and focus on form.",
        recommendation: {
          type: "plan_adjustment" as const,
          description: `${suggestedType.charAt(0).toUpperCase() + suggestedType.slice(1)} run: ${distance} at ${paceStr}`,
          planAdjustments: [{
            date: new Date(),
            type: suggestedType,
            distanceMeters: Math.round(suggestedDistance),
            notes: `Recommended ${suggestedType} run based on your training pattern`,
            targetPace: targetPace,
          }],
          reasoning: context.signals.fatigueRisk
            ? "A shorter, easier run helps manage fatigue while maintaining training consistency."
            : "This run builds on your recent training volume and helps maintain progression.",
        },
      };
    }
  }

  // Default response - make it more contextual
  if (context.lastRun) {
    const lastRunDistance = formatDistance(context.lastRun.distanceKm * 1000, unit);
    const daysSince = Math.floor((Date.now() - context.lastRun.date.getTime()) / (1000 * 60 * 60 * 24));
    
    return {
      summary: `Your last run was ${lastRunDistance} ${daysSince === 0 ? "today" : daysSince === 1 ? "yesterday" : `${daysSince} days ago`}.`,
      coachingNote: context.currentPlan
        ? `You have a training plan in place. ${context.signals.fatigueRisk ? "Monitor your recovery - your recent pattern suggests elevated fatigue. Consider a lighter week." : "Continue following your plan. Consistency is key for achieving your goal."}`
        : `You don't have a training plan yet. ${context.goal ? `Based on your goal of ${formatDistance(context.goal.distance, unit)}, I can help create a personalized plan.` : "Set a race goal in Settings to get a personalized training plan."}`,
      question: context.currentPlan ? undefined : "Would you like me to create a training plan?",
    };
  }
  
  // No recent runs
  return {
    summary: context.goal 
      ? `You have a goal set: ${formatDistance(context.goal.distance, unit)} race.`
      : "Welcome! I'm here to help with your running training.",
    coachingNote: context.goal
      ? "I don't see any recent runs in your log. Start logging runs to get personalized coaching advice. You can connect Strava or manually add activities."
      : "Set a race goal in Settings to get started. I'll help you create a training plan and provide coaching guidance based on your runs.",
    question: context.goal ? "Connect Strava or add a run" : "Set a race goal",
  };
}
