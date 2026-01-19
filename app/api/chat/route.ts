import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { computeSignals } from "@/lib/training";
import { getActivities, getUserGoal, getCurrentPlan, getUserDistanceUnit } from "@/lib/actions";
import { prepareContext, formatContextString, PreparedContext } from "@/lib/conversation";
import { generateGroundedCoachResponse } from "@/lib/coach-v2";
import OpenAI from "openai";
import { revalidatePath } from "next/cache";

// Get or create user (simplified: single user for MVP)
async function getOrCreateUser() {
  let user = await prisma.user.findFirst();
  if (!user) {
    user = await prisma.user.create({ data: {} });
  }
  return user;
}

/**
 * POST /api/chat
 * Streaming chat endpoint with grounded coaching
 */
export async function POST(request: NextRequest) {
  try {
    const { message, stream = false } = await request.json();

    if (!message || typeof message !== "string") {
      return Response.json({ error: "Message is required" }, { status: 400 });
    }

    const user = await getOrCreateUser();

    // Create user message in DB
    const userMessage = await prisma.coachMessage.create({
      data: {
        userId: user.id,
        role: "user",
        content: message,
      },
    });

    // Load context
    const goal = await getUserGoal();
    const activities = await getActivities(30);
    const plan = await getCurrentPlan();
    const distanceUnit = await getUserDistanceUnit();
    const recentMessages = await prisma.coachMessage.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      take: 10,
    });

    // Compute signals from activities
    const computedSignals = computeSignals(activities);

    // Prepare optimized context
    const preparedContext = prepareContext(
      goal,
      activities,
      computedSignals,
      plan,
      recentMessages,
      distanceUnit
    );

    const openaiKey = process.env.OPENAI_API_KEY?.trim();
    if (!openaiKey) {
      // Fallback to non-streaming stub
      const response = await generateGroundedCoachResponse(
        message,
        preparedContext,
        recentMessages,
        null as any // Will use stub
      );

      // Save assistant message
      await prisma.coachMessage.create({
        data: {
          userId: user.id,
          role: "assistant",
          content: response.message,
        },
      });

      revalidatePath("/dashboard");
      return Response.json(response);
    }

    const openai = new OpenAI({ apiKey: openaiKey });

    if (stream) {
      // Streaming response
      return streamResponse(message, preparedContext, recentMessages, openai, user.id);
    } else {
      // Non-streaming response
      const response = await generateGroundedCoachResponse(
        message,
        preparedContext,
        recentMessages,
        openai
      );

      // Save assistant message
      await prisma.coachMessage.create({
        data: {
          userId: user.id,
          role: "assistant",
          content: response.message,
        },
      });

      revalidatePath("/dashboard");
      return Response.json(response);
    }
  } catch (error: any) {
    console.error("Chat API error:", error);
    return Response.json(
      { error: "Failed to process message", details: error.message },
      { status: 500 }
    );
  }
}

/**
 * Stream response using OpenAI streaming
 */
async function streamResponse(
  message: string,
  context: PreparedContext,
  recentMessages: any[],
  openai: OpenAI,
  userId: string
) {
  const contextStr = formatContextString(context);

  // Build conversation history
  const messages: Array<{ role: "system" | "user" | "assistant"; content: string }> = [
    { role: "system", content: `You are Roger, a calm and intelligent running coach. Your voice is: short, precise, and grounded. You're direct but supportive - like a trusted coach who knows your training intimately.

CORE PRINCIPLES:
1. **Data-first**: Every response MUST reference at least ONE concrete data point from the runner's actual training when available.
2. **Concise & scannable**: Use bullets, short paragraphs, clear structure. Mobile-first.
3. **Proactive**: Ask 1-2 sharp follow-up questions when helpful, otherwise act.
4. **Continuity**: Reference previous conversation turns naturally.
5. **Coach voice**: Direct but supportive.

Respond in natural, conversational markdown. Reference specific data points from the context.` },
    { role: "user", content: `Runner's training context:\n\n${contextStr}` },
  ];

  // Add recent conversation
  const conversationHistory = context.recentConversation.slice(-5);
  conversationHistory.forEach((msg) => {
    if (msg.role === "user" || msg.role === "assistant") {
      messages.push({
        role: msg.role,
        content: msg.content,
      });
    }
  });

  messages.push({ role: "user", content: message });

  const stream = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: messages,
    temperature: 0.7,
    stream: true,
  });

  // Create a readable stream
  const encoder = new TextEncoder();
  const readable = new ReadableStream({
    async start(controller) {
      let fullContent = "";
      
      try {
        for await (const chunk of stream) {
          const content = chunk.choices[0]?.delta?.content || "";
          if (content) {
            fullContent += content;
            controller.enqueue(encoder.encode(`data: ${JSON.stringify({ content })}\n\n`));
          }
        }

        // Save complete message to DB
        await prisma.coachMessage.create({
          data: {
            userId: userId,
            role: "assistant",
            content: fullContent,
          },
        });

        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ done: true })}\n\n`));
        controller.close();
      } catch (error) {
        controller.error(error);
      }
    },
  });

  revalidatePath("/dashboard");

  return new Response(readable, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
    },
  });
}
