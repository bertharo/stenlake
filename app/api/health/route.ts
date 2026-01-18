import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    // Check if database is accessible
    await prisma.$queryRaw`SELECT 1`;
    
    // Try to query User table to check if schema exists
    const userCount = await prisma.user.count();
    
    return NextResponse.json({
      status: "ok",
      database: "connected",
      tables: "exist",
      userCount,
    });
  } catch (error: any) {
    const errorMessage = error?.message || "Unknown error";
    
    // Check if it's a schema error
    if (errorMessage.includes("does not exist") || errorMessage.includes("relation") || errorMessage.includes("table")) {
      return NextResponse.json({
        status: "error",
        database: "connected",
        tables: "missing",
        error: "Database tables do not exist. Run: npx prisma db push",
        details: errorMessage,
      }, { status: 500 });
    }
    
    // Check if it's a connection error
    if (errorMessage.includes("DATABASE_URL") || errorMessage.includes("connection")) {
      return NextResponse.json({
        status: "error",
        database: "not_configured",
        error: "DATABASE_URL environment variable is not set or invalid",
        details: errorMessage,
      }, { status: 500 });
    }
    
    return NextResponse.json({
      status: "error",
      error: errorMessage,
    }, { status: 500 });
  }
}
