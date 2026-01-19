# Quick Database Setup Guide

## Step 1: Create Vercel Postgres Database

1. Go to [Vercel Dashboard](https://vercel.com/dashboard)
2. Select your **stenlake** project
3. Click on the **Storage** tab
4. Click **Create Database**
5. Select **Postgres**
6. Choose a region (closest to your users)
7. Click **Create**

Vercel will automatically:
- Create the database
- Set the `DATABASE_URL` environment variable
- Link it to your project

## Step 2: Run Migrations

After the database is created, you need to create the tables. Run these commands locally:

```bash
# Install Vercel CLI if you haven't (one-time)
npm i -g vercel

# Link to your project (if not already linked)
vercel link

# Pull environment variables (includes DATABASE_URL)
vercel env pull .env.local

# Generate Prisma Client
npx prisma generate

# Create database tables
npx prisma db push
```

## Step 3: Verify

1. **Check health endpoint:**
   Visit: `https://your-app.vercel.app/api/health`
   Should return: `{"status":"ok","database":"connected","tables":"exist"}`

2. **Visit your app:**
   Your dashboard should now work without errors!

## Alternative: Manual DATABASE_URL Setup

If you're using a different Postgres provider (Supabase, Railway, Neon, etc.):

1. Get your Postgres connection string from your provider
2. In Vercel Dashboard → Settings → Environment Variables
3. Add new variable:
   - Name: `DATABASE_URL`
   - Value: `postgresql://user:password@host:5432/dbname?sslmode=require`
4. Run migrations as shown in Step 2

## Troubleshooting

**If you see "tables don't exist" error:**
- Make sure you ran `npx prisma db push` after setting DATABASE_URL

**If connection fails:**
- Verify DATABASE_URL is correct
- Check if your database allows connections from Vercel's IPs
- For some providers, you may need to whitelist Vercel's IP addresses
