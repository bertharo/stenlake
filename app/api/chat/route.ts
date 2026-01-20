import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { processConversationTurn } from "@/lib/conversationEngine";
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
 * Natural conversational coaching endpoint
 * 
 * Uses canonical conversation engine with:
 * - Persistent conversation IDs
 * - Structured memory (separate from chat history)
 * - Intent classification
 * - Tool-first data access (agent loop)
 * - Output shaping for natural responses
 */
export async function POST(request: NextRequest) {
  try {
    const { message, stream = false } = await request.json();

    if (!message || typeof message !== "string") {
      return Response.json({ error: "Message is required" }, { status: 400 });
    }

    const user = await getOrCreateUser();
    const openaiKey = process.env.OPENAI_API_KEY?.trim();

    if (!openaiKey) {
      if (process.env.NODE_ENV === "production") {
        console.error("[CHAT] No OpenAI API key in production");
        return Response.json(
          { error: "OpenAI API key not configured" },
          { status: 500 }
        );
      } else {
        console.warn("[CHAT] No OpenAI API key - using stub response");
        // Return stub response
        return Response.json({
          message: "I'd love to help, but I need an OpenAI API key configured. Check your environment variables.",
          conversationId: "stub",
          intent: "general_question",
        });
      }
    }

    const openai = new OpenAI({ apiKey: openaiKey });

    // Process conversation turn using canonical engine
    const response = await processConversationTurn(user.id, message, openai);

    revalidatePath("/dashboard");

    if (stream) {
      // For now, return non-streaming response
      // Streaming can be added later by modifying processConversationTurn
      return Response.json(response);
    } else {
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
