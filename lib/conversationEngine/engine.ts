/**
 * Canonical Conversation Engine
 * 
 * Single source of truth for chat interactions.
 * Uses OpenAI with persistent conversation IDs, tool calls, and memory.
 */

import OpenAI from "openai";
import { prisma } from "../prisma";
import { getUserGoal, getUserDistanceUnit } from "../actions";
import { computeSignals } from "../training";
import { getActivities } from "../actions";
import { DistanceUnit } from "../units";
import { classifyIntent, UserIntent } from "./intentClassifier";
import { getMemory, getRelevantMemory, updateMemory, ConversationMemory } from "./memory";
import { TOOLS, executeTool, ToolCall, ToolResult } from "./tools";
import { NATURAL_COACH_SYSTEM_PROMPT } from "./systemPrompt";
import { shapeOutput } from "./outputShaper";

export interface ConversationResponse {
  message: string;
  conversationId: string;
  intent: UserIntent;
  toolCalls?: Array<{ id: string; name: string; result: string }>;
}

/**
 * Get or create conversation for user
 */
async function getOrCreateConversation(userId: string): Promise<string> {
  // Get most recent active conversation (within last 24 hours)
  const yesterday = new Date();
  yesterday.setHours(yesterday.getHours() - 24);

  const recentConversation = await prisma.conversation.findFirst({
    where: {
      userId,
      updatedAt: { gte: yesterday },
    },
    orderBy: { updatedAt: "desc" },
  });

  if (recentConversation) {
    return recentConversation.id;
  }

  // Create new conversation
  const conversation = await prisma.conversation.create({
    data: { userId },
  });

  return conversation.id;
}

/**
 * Get conversation messages
 */
async function getConversationMessages(conversationId: string, limit: number = 20) {
  return prisma.conversationMessage.findMany({
    where: { conversationId },
    orderBy: { createdAt: "asc" },
    take: limit,
  });
}

/**
 * Save message to conversation
 */
async function saveMessage(
  conversationId: string,
  role: "user" | "assistant" | "system" | "tool",
  content: string,
  intent?: string,
  toolCalls?: string | null,
  toolResults?: string | null
) {
  return prisma.conversationMessage.create({
    data: {
      conversationId,
      role,
      content,
      intent: intent || null,
      toolCalls: toolCalls || null,
      toolResults: toolResults || null,
    },
  });
}

/**
 * Build OpenAI messages array from conversation history
 */
function buildMessages(
  systemPrompt: string,
  memoryContext: string,
  conversationHistory: Array<{ role: string; content: string; toolCalls?: any; toolResults?: any }>
): Array<OpenAI.Chat.ChatCompletionMessageParam> {
  const messages: Array<OpenAI.Chat.ChatCompletionMessageParam> = [
    {
      role: "system",
      content: `${systemPrompt}\n\n${memoryContext ? `Context: ${memoryContext}` : ""}`,
    },
  ];

  // Add conversation history
  for (const msg of conversationHistory) {
    if (msg.role === "user") {
      messages.push({ role: "user", content: msg.content });
    } else if (msg.role === "assistant") {
      messages.push({
        role: "assistant",
        content: msg.content,
        tool_calls: msg.toolCalls || undefined,
      } as any);
    } else if (msg.role === "tool" && msg.toolResults) {
      // Add tool results
      const toolResults = Array.isArray(msg.toolResults) ? msg.toolResults : [msg.toolResults];
      for (const result of toolResults) {
        messages.push({
          role: "tool",
          content: result.content,
          tool_call_id: result.tool_call_id,
        } as any);
      }
    }
  }

  return messages;
}

/**
 * Process conversation turn with agent loop
 */
export async function processConversationTurn(
  userId: string,
  userMessage: string,
  openai: OpenAI | null
): Promise<ConversationResponse> {
  // Get or create conversation
  const conversationId = await getOrCreateConversation(userId);

  // Classify intent
  const intentClassification = classifyIntent(userMessage);
  const intent = intentClassification.intent;

  // Get memory
  let memory = await getMemory(userId);
  const distanceUnit = (await getUserDistanceUnit()) as DistanceUnit;

  // Initialize memory if needed
  if (!memory) {
    const goal = await getUserGoal();
    const activities = await getActivities(30);
    const signals = computeSignals(activities);

    // Initialize memory with current state
    memory = await updateMemory(userId, {
      profile: {
        goal_race: goal
          ? `${(goal.distance / 1000).toFixed(1)}${distanceUnit === "mi" ? "mi" : "km"}`
          : null,
        goal_time: goal
          ? `${Math.floor(goal.targetTimeSeconds / 3600)}:${String(Math.floor((goal.targetTimeSeconds % 3600) / 60)).padStart(2, "0")}`
          : null,
        preferred_feedback_style: "direct",
      },
      context: {
        current_week: 1,
        fatigue_flag: signals.fatigueRisk || false,
        last_key_workout: activities.length > 0 ? activities[0].startDate.toLocaleDateString() : null,
        weekly_mileage_trend: signals.weeklyMileage.length >= 2
          ? signals.weeklyMileage[signals.weeklyMileage.length - 1].mileageKm >
            signals.weeklyMileage[signals.weeklyMileage.length - 2].mileageKm
            ? "up"
            : signals.weeklyMileage[signals.weeklyMileage.length - 1].mileageKm <
              signals.weeklyMileage[signals.weeklyMileage.length - 2].mileageKm
            ? "down"
            : "stable"
          : "stable",
      },
      baselines: {
        easy_pace_range: "N/A",
        threshold_pace: "N/A",
        weekly_mileage_avg: signals.weeklyMileage.length > 0
          ? signals.weeklyMileage.reduce((sum, w) => sum + w.mileageKm, 0) / signals.weeklyMileage.length
          : 0,
      },
    });
  }

  // Get relevant memory for this intent
  const memoryContext = getRelevantMemory(memory, intent);

  // Save user message
  await saveMessage(conversationId, "user", userMessage, intent);

  // Get conversation history
  const history = await getConversationMessages(conversationId, 20);
  const historyMessages = history.map((msg) => ({
    role: msg.role,
    content: msg.content,
    toolCalls: msg.toolCalls ? JSON.parse(msg.toolCalls) : undefined,
    toolResults: msg.toolResults ? JSON.parse(msg.toolResults) : undefined,
  }));

  // Build messages array
  let messages = buildMessages(NATURAL_COACH_SYSTEM_PROMPT, memoryContext, historyMessages);
  messages.push({ role: "user", content: userMessage });

  // Agent loop: handle tool calls
  let finalResponse = "";
  const toolCallsMade: Array<{ id: string; name: string; result: string }> = [];
  let maxIterations = 3;
  let iteration = 0;

  if (!openai) {
    // Stub response
    return {
      message: "I'd love to help, but I need an OpenAI API key configured. Check your environment variables.",
      conversationId,
      intent,
    };
  }

  while (iteration < maxIterations) {
    iteration++;

    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: messages as any,
      tools: TOOLS.map((tool) => ({
        type: "function",
        function: {
          name: tool.name,
          description: tool.description,
          parameters: tool.parameters,
        },
      })),
      tool_choice: "auto",
      temperature: 0.7,
    });

    const choice = response.choices[0];
    const message = choice.message;

    // Add assistant message to conversation
    messages.push(message as any);

    // Handle tool calls
    if (message.tool_calls && message.tool_calls.length > 0) {
      const toolResults: ToolResult[] = [];

      for (const toolCall of message.tool_calls) {
        const result = await executeTool(
          {
            id: toolCall.id,
            name: toolCall.function.name,
            arguments: JSON.parse(toolCall.function.arguments),
          },
          userId,
          distanceUnit,
          memory
        );

        toolResults.push(result);
        toolCallsMade.push({
          id: toolCall.id,
          name: toolCall.function.name,
          result: result.content,
        });

        // Add tool result to messages
        messages.push({
          role: "tool",
          content: result.content,
          tool_call_id: toolCall.id,
        } as any);
      }

      // Save tool calls and results (as JSON strings for SQLite)
      await saveMessage(
        conversationId,
        "assistant",
        "",
        intent,
        message.tool_calls ? JSON.stringify(message.tool_calls) : null,
        toolResults.length > 0 ? JSON.stringify(toolResults) : null
      );

      // Continue loop to get final response
      continue;
    }

    // Final response
    finalResponse = message.content || "";
    break;
  }

  // Shape output
  const shapedResponse = shapeOutput(finalResponse, intent);

  // Save assistant message
  await saveMessage(conversationId, "assistant", shapedResponse, intent);

  // Update conversation timestamp
  await prisma.conversation.update({
    where: { id: conversationId },
    data: { updatedAt: new Date() },
  });

  return {
    message: shapedResponse,
    conversationId,
    intent,
    toolCalls: toolCallsMade.length > 0 ? toolCallsMade : undefined,
  };
}
