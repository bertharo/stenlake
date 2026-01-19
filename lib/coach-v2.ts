import { Activity, Goal, Plan, PlanItem, CoachMessage } from "@prisma/client";
import { TrainingSignals, computeSignals } from "./training";
import { DistanceUnit } from "./units";
import { prepareContext, formatContextString, PreparedContext, CoachResponse } from "./conversation";
import OpenAI from "openai";

/**
 * Grounded Coach System Prompt
 * - Concise, direct, curious
 * - Data-referenced (must cite at least one concrete data point)
 * - Proactive with 1-2 sharp questions when needed
 */
const GROUNDED_COACH_PROMPT = `You are Roger, a calm and intelligent running coach. Your voice is natural, conversational, and grounded - like ChatGPT but with deep knowledge of the runner's training.

CORE PRINCIPLES:
1. **Natural conversation**: Respond naturally to greetings and casual conversation. Don't force training data into every response. Be warm and friendly like ChatGPT.
2. **Data-referenced when relevant**: When discussing training, reference specific data points (pace, distance, HR, date, workout type). Use phrases like "I see your last long run was..." or "Your run on [date] was..."
3. **Conversational flow**: Match the user's tone. If they're casual, be casual. If they're asking technical questions, be technical.
4. **One clarification max**: Ask at most ONE question when needed, then make reasonable assumptions and proceed.
5. **Explain "why"**: When recommending workouts or adjustments, briefly explain the reasoning.
6. **Follow-ups**: Support natural follow-ups like "make week 4 lighter", "swap Tue/Thu", "I feel cooked today"

RESPONSE FORMAT (JSON):
{
  "message": "Markdown-formatted response. Use bullets, short paragraphs. Reference specific data points.",
  "suggestedActions": [
    {"label": "Button text", "action": "action_id", "type": "button"}
  ],
  "confidence": 0.0-1.0,
  "needsClarification": false,
  "dataPointsCited": ["pace from 3/15 run", "weekly mileage trend"],
  "nextRunRecommendation": {
    "type": "easy|tempo|interval|long",
    "distanceFormatted": "5km",
    "paceFormatted": "5:00/km",
    "notes": "Brief instructions"
  }
}

DATA CITATION RULES:
- "Your run on [date] was [distance] at [pace] with HR [X]bpm" ✅
- "You've been running [X]km/week" ✅
- "Your last 3 runs averaged [pace]" ✅
- "Based on your training pattern..." ❌ (too vague, cite specific data)

WHEN TO ASK QUESTIONS:
- Missing key info for safety (injury history, race date, availability)
- Ambiguous request needs clarification
- Ask at most 2 questions, then propose a default plan

WHEN TO ACT:
- Clear request with sufficient data → provide specific recommendation
- General greeting → friendly response + brief training status
- Training question → answer with data + actionable next step

EXAMPLES:

User: "hi"
Assistant: "Hey. I see you ran 8.5km yesterday at 5:12/km. How are you feeling? What can I help with?"

User: "what should my next run be?"
Assistant: "Based on your last week (32km total, 4 runs), I recommend a **5km easy run** at 5:30/km pace. You've had 2 hard sessions this week, so recovery is key. [Button: "Add to plan"]"

User: "how's my training going?"
Assistant: "**Trending up.** Weekly mileage: 28km → 32km → 35km (last 3 weeks). Intensity balanced (60% easy, 25% moderate, 15% hard). Long run last Sunday: 12km. **Next**: Focus on consistency. Marathon is 8 weeks away - on track. [Button: "View 7-day plan"]"

Remember: Short, precise, grounded. Cite data. Be direct but supportive.`;

/**
 * Generate grounded coach response with streaming support
 */
export async function generateGroundedCoachResponse(
  userMessage: string,
  context: PreparedContext,
  recentMessages: CoachMessage[],
  openai: OpenAI | null
): Promise<CoachResponse> {
  // If no OpenAI, use stub
  if (!openai) {
    return generateStubResponse(userMessage, context);
  }
  const contextStr = formatContextString(context);

  // Build conversation history
  const messages: Array<{ role: "system" | "user" | "assistant"; content: string }> = [
    { role: "system", content: GROUNDED_COACH_PROMPT },
    { role: "user", content: `Runner's training context:\n\n${contextStr}` },
  ];

  // Add recent conversation (last 5 messages, chronological)
  const conversationHistory = [...context.recentConversation].slice(-5);
  conversationHistory.forEach((msg) => {
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
      model: "gpt-4o",
      messages: messages,
      temperature: 0.7,
      response_format: { type: "json_object" },
    });

    const content = completion.choices[0]?.message?.content;
    if (!content) {
      throw new Error("Empty response from OpenAI");
    }

    const parsed = JSON.parse(content) as CoachResponse;
    
    // Validate required fields
    if (!parsed.message) {
      throw new Error("Invalid response format: missing 'message'");
    }

    // Ensure confidence is set
    if (parsed.confidence === undefined) {
      parsed.confidence = 0.8;
    }

    // Ensure dataPointsCited is an array
    if (!parsed.dataPointsCited) {
      parsed.dataPointsCited = [];
    }

    return parsed;
  } catch (error: any) {
    console.error("OpenAI error:", error);
    
    // Fallback to stub response
    return generateStubResponse(userMessage, context);
  }
}

/**
 * Stub response generator (when OpenAI is unavailable)
 */
function generateStubResponse(
  userMessage: string,
  context: PreparedContext
): CoachResponse {
  const lower = userMessage.toLowerCase();

  // Greeting - be natural and conversational
  if (lower.match(/^(hi|hello|hey|howdy)\s*[!.]*$/i) || lower.includes("how are you")) {
    if (context.selectedRuns.length > 0) {
      const lastRun = context.selectedRuns[0];
      return {
        message: `Hey! How are you? I see you ran ${lastRun.distanceFormatted} ${lastRun.dateLabel} at ${lastRun.paceFormatted} - nice work! What can I help with today?`,
        suggestedActions: [
          { label: "What's my next run?", action: "next_run", type: "button" },
          { label: "How's my training?", action: "training_status", type: "button" },
        ],
        confidence: 0.9,
        needsClarification: false,
        dataPointsCited: [`${lastRun.dateLabel} run: ${lastRun.distanceFormatted} at ${lastRun.paceFormatted}`],
      };
    }
    return {
      message: "Hey! I'm Roger, your running coach. How can I help you today?",
      suggestedActions: [
        { label: "Set a goal", action: "set_goal", type: "button" },
        { label: "Connect Strava", action: "connect_strava", type: "button" },
      ],
      confidence: 0.8,
      needsClarification: false,
      dataPointsCited: [],
    };
  }

  // Next run question - be conversational
  if (lower.includes("next run") || lower.includes("what should i run") || lower.includes("recommend")) {
    if (context.planSummary.nextRun) {
      const next = context.planSummary.nextRun;
      return {
        message: `Looking at your plan, your next run is a ${next.type} run${next.distanceFormatted ? ` - ${next.distanceFormatted}` : ""}${next.paceFormatted ? ` at around ${next.paceFormatted}` : ""}. Want to see your full plan?`,
        suggestedActions: [
          { label: "View full plan", action: "view_plan", type: "button" },
        ],
        confidence: 0.9,
        needsClarification: false,
        dataPointsCited: ["scheduled plan"],
        nextRunRecommendation: next.distanceFormatted ? {
          type: next.type,
          distanceFormatted: next.distanceFormatted,
          paceFormatted: next.paceFormatted || "",
          notes: `Scheduled ${next.type} run`,
        } : undefined,
      };
    }

    if (context.selectedRuns.length > 0 && context.lastWeekStats) {
      const lastRun = context.selectedRuns[0];
      
      return {
        message: `Based on your last week (${context.lastWeekStats.totalMileageFormatted} total across ${context.lastWeekStats.runCount} runs), I'd suggest an easy ${lastRun.distanceFormatted || "5km"} run at around ${lastRun.paceFormatted} pace. You've been consistent - keep building that base!`,
        suggestedActions: [
          { label: "Add to plan", action: "add_run", type: "button" },
        ],
        confidence: 0.8,
        needsClarification: false,
        dataPointsCited: [
          `Last week: ${context.lastWeekStats.totalMileageFormatted}`,
          `Last run pace: ${lastRun.paceFormatted}`,
        ],
        nextRunRecommendation: {
          type: "easy",
          distanceFormatted: lastRun.distanceFormatted || "5km",
          paceFormatted: lastRun.paceFormatted,
          notes: "Easy recovery run based on your recent training",
        },
      };
    }
  }

  // Training status - conversational
  if (lower.includes("how") && (lower.includes("training") || lower.includes("going"))) {
    if (context.weeklyMileage.length >= 3) {
      const recent = context.weeklyMileage.slice(-3);
      const trend = context.mileageTrend === "up" ? "trending up nicely" : context.mileageTrend === "down" ? "trending down a bit" : "pretty stable";
      
      return {
        message: `You're ${trend}! Your weekly mileage over the last 3 weeks: ${recent.map(w => w.mileageFormatted).join(" → ")}. Your intensity looks balanced - mostly easy runs with some quality work. ${context.fatigueRisk ? "I'm noticing some fatigue risk though - maybe consider a lighter week?" : "Keep up the consistency!"}`,
        suggestedActions: [
          { label: "View 7-day plan", action: "view_plan", type: "button" },
        ],
        confidence: 0.9,
        needsClarification: false,
        dataPointsCited: [
          `Weekly mileage: ${recent.map(w => w.mileageFormatted).join(" → ")}`,
          `Intensity distribution`,
        ],
      };
    }
  }

  // Default
  if (context.selectedRuns.length > 0) {
    const lastRun = context.selectedRuns[0];
    return {
      message: `I see you ran **${lastRun.distanceFormatted}** ${lastRun.dateLabel} at ${lastRun.paceFormatted}. What would you like to know about your training?`,
      suggestedActions: [
        { label: "What's my next run?", action: "next_run", type: "button" },
        { label: "How's my training?", action: "training_status", type: "button" },
      ],
      confidence: 0.8,
      needsClarification: false,
      dataPointsCited: [`${lastRun.dateLabel} run`],
    };
  }

  return {
    message: "I'm here to help with your running training. Connect Strava or add some runs to get personalized coaching!",
    suggestedActions: [
      { label: "Connect Strava", action: "connect_strava", type: "button" },
      { label: "Set a goal", action: "set_goal", type: "button" },
    ],
    confidence: 0.7,
    needsClarification: false,
    dataPointsCited: [],
  };
}
