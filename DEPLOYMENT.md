# Deployment Guide

## Vercel Deployment

This app requires a database. SQLite (file-based) does **not work** on Vercel's serverless functions. You must use a hosted database.

### Option 1: Vercel Postgres (Recommended)

1. **Create Vercel Postgres Database:**
   - Go to your Vercel project dashboard
   - Navigate to the "Storage" tab
   - Click "Create Database" → Select "Postgres"
   - Choose a region close to your users
   - Click "Create"

2. **Link Database to Project:**
   - Vercel will automatically set the `DATABASE_URL` environment variable
   - The connection string will look like: `postgres://user:password@host:5432/dbname?sslmode=require`

3. **Run Migrations:**
   ```bash
   # Generate Prisma Client for Postgres
   npx prisma generate

   # Push schema to database (creates tables)
   npx prisma db push

   # Or create a migration
   npx prisma migrate dev --name init
   ```

4. **Environment Variables in Vercel:**
   - `DATABASE_URL` - Automatically set by Vercel Postgres
   - `STRAVA_CLIENT_ID` - (Optional) Your Strava app client ID
   - `STRAVA_CLIENT_SECRET` - (Optional) Your Strava app secret
   - `STRAVA_REDIRECT_URI` - (Optional) `https://your-app.vercel.app/api/auth/strava/callback`
   - `OPENAI_API_KEY` - (Optional) Your OpenAI API key

### Option 2: Other Postgres Providers

You can use any Postgres provider (Supabase, Railway, Neon, etc.):

1. Create a Postgres database with your provider
2. Get the connection string
3. Set `DATABASE_URL` in Vercel environment variables
4. Run migrations as shown above

### Migration from SQLite to Postgres

The schema is already compatible. Just:

1. Update `prisma/schema.prisma` to use `provider = "postgresql"` (already done)
2. Set `DATABASE_URL` to your Postgres connection string
3. Run `npx prisma db push` or create migrations
4. Deploy

**Note:** Local development can still use SQLite. Just use different `.env` files or environment-specific `DATABASE_URL` values.
