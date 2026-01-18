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

3. **Run Migrations (REQUIRED):**
   
   After creating the database, you **must** run migrations to create the tables. Choose one method:

   **Method A: Using Vercel CLI (Recommended)**
   ```bash
   # Install Vercel CLI if you haven't
   npm i -g vercel
   
   # Link your project
   vercel link
   
   # Pull environment variables (includes DATABASE_URL)
   vercel env pull .env.local
   
   # Set DATABASE_URL in your local .env.local
   # Then run migrations
   npx prisma db push
   ```
   
   **Method B: Using local .env**
   ```bash
   # Copy DATABASE_URL from Vercel dashboard → Settings → Environment Variables
   # Add it to a .env.local file in your project root
   DATABASE_URL="postgresql://..."
   
   # Run migrations
   npx prisma db push
   ```

   **Method C: After first deployment**
   - Deploy your app first
   - Check `/api/health` endpoint to diagnose database issues
   - Run `npx prisma db push` locally with DATABASE_URL from Vercel

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

## Troubleshooting

### "Application error: a server-side exception has occurred"

This usually means:
1. **DATABASE_URL not set**: Check Vercel dashboard → Settings → Environment Variables
2. **Tables don't exist**: Run `npx prisma db push` with your DATABASE_URL
3. **Database connection failed**: Verify your Postgres database is running and accessible

Check your database status: Visit `https://your-app.vercel.app/api/health` to see detailed error information.
