# Deployment Guide

## Database Setup

This app uses **SQLite for local development** and **PostgreSQL for production**.

### Local Development (SQLite)

For local development, SQLite is already configured. Just set:

```env
DATABASE_URL="file:./prisma/dev.db"
```

Run `npx prisma db push` to create the database file.

### Production (PostgreSQL)

**SQLite does NOT work in production** (Vercel/serverless). You must use PostgreSQL.

#### Option 1: Vercel Postgres (Recommended)

1. Go to your Vercel project dashboard
2. Navigate to **Storage** → **Create Database** → **Postgres**
3. Vercel will automatically set `DATABASE_URL` for you
4. After deployment, run: `npx prisma db push` to push your schema

#### Option 2: Supabase (Free PostgreSQL)

1. Create a free account at [supabase.com](https://supabase.com)
2. Create a new project
3. Go to **Settings** → **Database** → Copy the connection string
4. Set `DATABASE_URL` in Vercel environment variables:
   ```
   DATABASE_URL="postgresql://postgres:[YOUR-PASSWORD]@db.[YOUR-PROJECT].supabase.co:5432/postgres"
   ```

#### Option 3: Neon (Free PostgreSQL)

1. Create a free account at [neon.tech](https://neon.tech)
2. Create a new project
3. Copy the connection string from the dashboard
4. Set `DATABASE_URL` in Vercel environment variables

### Switching from SQLite to PostgreSQL

The Prisma schema uses SQLite by default for development. To use PostgreSQL in production:

**Option A: Use environment-specific schemas (recommended)**

The schema automatically works with both SQLite (development) and PostgreSQL (production) since Prisma supports both for the same schema. Just ensure your `DATABASE_URL` points to the correct database type.

**Option B: Update schema.prisma**

If you want to explicitly use PostgreSQL everywhere, update `prisma/schema.prisma`:

```prisma
datasource db {
  provider = "postgresql"  // Changed from "sqlite"
  url      = env("DATABASE_URL")
}
```

Then run `npx prisma db push` after setting your PostgreSQL `DATABASE_URL`.

### Environment Variables for Production

Set these in your Vercel project settings:

```env
DATABASE_URL="postgresql://..."  # Required: PostgreSQL connection string
OPENAI_API_KEY="sk-..."          # Optional: For AI coaching
STRAVA_CLIENT_ID="..."           # Optional: For Strava sync
STRAVA_CLIENT_SECRET="..."       # Optional: For Strava sync
STRAVA_REDIRECT_URI="https://your-domain.vercel.app/api/auth/strava/callback"
```

### Migration Steps

1. Set up PostgreSQL database (Vercel Postgres, Supabase, or Neon)
2. Add `DATABASE_URL` environment variable in Vercel
3. Deploy to Vercel
4. After first deployment, run migrations:
   ```bash
   npx prisma db push
   ```
   Or if using migrations:
   ```bash
   npx prisma migrate deploy
   ```

### Troubleshooting

**Error: "the URL must start with the protocol `file:`"**
- You're using SQLite in production. Switch to PostgreSQL.

**Error: "DATABASE_URL environment variable is not set"**
- Add `DATABASE_URL` to your Vercel environment variables.

**Error: "Invalid DATABASE_URL format"**
- Ensure your PostgreSQL connection string starts with `postgresql://` or `postgres://`
