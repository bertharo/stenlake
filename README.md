# Stenlake

A modern running coach agent with a dashboard and contextual conversation. Set a race goal, connect your Strava (or use mock data), and get AI-powered coaching grounded in your training data.

## Features

- **Goal Setting**: Set your race distance, target time, and race date
- **Activity Sync**: Connect Strava OAuth or use mock data for testing
- **Training Signals**: Automatic computation of weekly mileage, intensity distribution, fatigue risk, and more
- **7-Day Plan Generation**: Intelligent weekly plan generation based on your training history
- **Contextual Chat**: Talk about your training with an AI coach that understands your runs, signals, and plan
- **Dark Premium UI**: Minimal, clean dashboard designed for focused training

## Tech Stack

- **Next.js 14** (App Router) + TypeScript
- **Tailwind CSS** for styling
- **Prisma** + SQLite for data persistence
- **Server Actions** for data mutations
- **OpenAI API** (optional) for AI coaching, with stub fallback
- **Strava API** (optional) for activity sync, with mock fallback

## Setup

### 1. Install Dependencies

```bash
npm install
```

### 2. Set Up Environment Variables

Create a `.env` file in the root directory:

```env
DATABASE_URL="file:./dev.db"

# Optional: Strava OAuth (leave empty to use mock data)
STRAVA_CLIENT_ID=
STRAVA_CLIENT_SECRET=
STRAVA_REDIRECT_URI="http://localhost:3000/api/auth/strava/callback"

# Optional: OpenAI API (leave empty to use stub responses)
OPENAI_API_KEY=
```

### 3. Set Up Database

```bash
# Generate Prisma Client
npm run db:generate

# Push schema to database
npm run db:push
```

### 4. Run Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## Usage

### Without Strava / OpenAI Keys

The app works fully with mock data and stub AI responses:

1. Go to **Settings** and sync mock data
2. Set your race goal (distance, target time, date)
3. View your **Dashboard** to see training signals and weekly plan
4. Use **"Talk about this run"** to chat with the coach

### With Strava Integration

1. Create a Strava app at [https://www.strava.com/settings/api](https://www.strava.com/settings/api)
2. Set `STRAVA_CLIENT_ID`, `STRAVA_CLIENT_SECRET`, and `STRAVA_REDIRECT_URI` in `.env`
3. Go to **Settings** and click **"Connect"** to authorize Strava
4. Activities will sync automatically and plans will regenerate

### With OpenAI Integration

1. Set `OPENAI_API_KEY` in `.env`
2. Chat responses will use GPT-4 Turbo for more sophisticated coaching

## Project Structure

```
/app
  /dashboard         # Main dashboard page with training signals
  /settings          # Goal and data source configuration
  /api/auth/strava   # Strava OAuth callback

/lib
  actions.ts         # Server actions for data operations
  training.ts        # Training signal computation + plan generation
  strava.ts          # Strava client + mock adapter
  coach.ts           # AI coach orchestration + context building
  prisma.ts          # Prisma client singleton

/prisma
  schema.prisma      # Database schema
```

## Data Model

- **User**: Single user (simplified for MVP)
- **Goal**: Race distance, target time, race date
- **Activity**: Running activities (from Strava or mock)
- **Plan**: Weekly training plans with 7 days of items
- **PlanItem**: Individual scheduled runs (easy/long/tempo/interval/rest)
- **CoachMessage**: Chat conversation history
- **StravaToken**: OAuth tokens for Strava integration

## Training Signals

Computed from last 30 days of activities:

- **Weekly Mileage**: Tracked by ISO week with trend (up/down/stable)
- **Intensity Distribution**: Easy/moderate/hard runs based on pace vs median pace
- **Long Run Detection**: Top distance run per week
- **Fatigue Risk**: Flagged if volume spike > 1.25x or 2+ hard runs in 4 days

## Plan Generation

Next 7 days plan logic:

- 4-6 runs/week based on recent frequency
- Maximum 10% weekly mileage increase
- No back-to-back hard days
- 1 long run, 1 quality session (tempo OR intervals), rest easy/recovery
- If fatigue risk: reduce volume by 15% and remove quality session

## Chat Behavior

The coach:

- Grounds responses in your latest activity, signals, and current plan
- Recognizes references to "last run" / "today's run" and summarizes context
- Adjusts plans when you mention fatigue, time constraints, or pain/injury
- Provides calm, authoritative guidance (no hype, no emojis)

## Assumptions & Limitations (MVP)

- Single user only (no multi-user support)
- SQLite for local dev (can migrate to Postgres for production)
- Strava tokens stored unencrypted (TODO: add encryption)
- No user authentication (single session)
- Plan regeneration replaces existing plan (no versioning)

## Development

```bash
# Run dev server
npm run dev

# Generate Prisma client after schema changes
npm run db:generate

# Push schema changes to DB
npm run db:push

# Open Prisma Studio to inspect DB
npm run db:studio
```

## License

MIT
