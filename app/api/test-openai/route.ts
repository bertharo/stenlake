import { NextResponse } from "next/server";
import OpenAI from "openai";

export const dynamic = 'force-dynamic';

export async function GET() {
  const openaiKey = process.env.OPENAI_API_KEY;

  if (!openaiKey) {
    return NextResponse.json({
      status: "error",
      message: "OPENAI_API_KEY not found in environment variables",
      configured: false,
    }, { status: 200 });
  }

  // Test the API key with a simple request
  try {
    const openai = new OpenAI({ apiKey: openaiKey });
    
    const completion = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [
        { role: "user", content: "Say 'API key is working' if you can read this." }
      ],
      max_tokens: 20,
    });

    const response = completion.choices[0]?.message?.content;

    return NextResponse.json({
      status: "success",
      message: "OpenAI API key is working",
      configured: true,
      testResponse: response,
      model: "gpt-3.5-turbo",
    }, { status: 200 });
  } catch (error: any) {
    return NextResponse.json({
      status: "error",
      message: "OpenAI API key test failed",
      configured: true,
      error: error.message || String(error),
      errorCode: error.code || "unknown",
    }, { status: 200 });
  }
}
