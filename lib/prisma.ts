import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

// Validate DATABASE_URL before creating Prisma client
function validateDatabaseUrl() {
  const dbUrl = process.env.DATABASE_URL;
  
  if (!dbUrl) {
    if (process.env.NODE_ENV === "production") {
      throw new Error(
        "DATABASE_URL environment variable is not set. " +
        "For production (Vercel), you must use PostgreSQL. " +
        "Set DATABASE_URL to your PostgreSQL connection string (e.g., postgresql://user:pass@host:5432/db). " +
        "Consider using Vercel Postgres or services like Supabase/Neon."
      );
    } else {
      throw new Error(
        "DATABASE_URL environment variable is not set. " +
        "For local development, set DATABASE_URL=file:./prisma/dev.db in your .env file."
      );
    }
  }

  // Check if SQLite URL is valid (starts with file:)
  if (dbUrl.startsWith("file:")) {
    if (process.env.NODE_ENV === "production") {
      throw new Error(
        "SQLite is not supported in production (Vercel). " +
        "Please use PostgreSQL instead. " +
        "Set DATABASE_URL to a PostgreSQL connection string. " +
        "You can use Vercel Postgres or services like Supabase/Neon for free PostgreSQL hosting."
      );
    }
    // SQLite is fine for development
    return;
  }

  // Check if PostgreSQL URL is valid (starts with postgresql:// or postgres://)
  if (!dbUrl.startsWith("postgresql://") && !dbUrl.startsWith("postgres://")) {
    throw new Error(
      `Invalid DATABASE_URL format: "${dbUrl}". ` +
      "It must start with 'file:' for SQLite (development only) or 'postgresql://' / 'postgres://' for PostgreSQL."
    );
  }
}

// Validate on import
try {
  validateDatabaseUrl();
} catch (error: any) {
  console.error("[PRISMA] Database configuration error:", error.message);
  // In production, we want to fail fast with a clear error
  if (process.env.NODE_ENV === "production") {
    throw error;
  }
  // In development, log but don't throw (allows the app to start, error will show when DB is accessed)
}

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["query", "error", "warn"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
