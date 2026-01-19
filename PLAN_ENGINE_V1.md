# Plan Engine v1 - Implementation Summary

## Overview

A clean, deterministic plan generation system has been built from scratch. The system computes training plans from Strava activities and goals without using LLMs to generate numbers.

## Architecture

### Single Canonical Engine
- **Location**: `lib/planEngine/`
- **Entry Point**: `getTrainingPlan()` - used by dashboard + chat
- **No LLM for numbers**: LLM only explains/recommends; all numbers come from deterministic computation

### Components

1. **Types** (`types.ts`)
   - `StravaActivity`, `RecentFitness`, `Goal`, `PlanDay`, `PlanWeek`, `TrainingPlan`
   - All types defined in one place

2. **Fitness Computation** (`computeRecentFitness.ts`)
   - Converts activities to miles
   - Computes weekly miles for last 6 weeks
   - Computes long run miles (max in last 6 weeks)
   - Derives easy pace range from easy runs (or uses goal pace + 60-120s heuristic)
   - Estimates threshold and VO2 paces from recent efforts

3. **Pace Ranges** (`computePaceRanges.ts`)
   - Computes pace ranges: mp, easy, tempo, interval
   - Ensures ordering: interval < tempo < mp < easy
   - Uses fitness data when available, falls back to goal-based estimates

4. **Plan Generation** (`generate12WeekPlan.ts`)
   - Week 1: Clamp(avg last 2 weeks, ±10%) or 25-35 mi based on daysPerWeek
   - Weekly progression: +0% to +8% max
   - Cutbacks: Every 3-4 weeks (-10% to -20%)
   - Peak week: ≤ 1.25 * maxWeeklyMiles (unless aggressive)
   - Long run: Starts near min(0.28-0.33 * weekly, max(10, longRunMiles * 0.9)), caps at 20-22 mi
   - Structure: 1 long, 1 quality (tempo/intervals alternating), 1 medium-long (optional), remaining easy/recovery, rest days
   - Taper: Last 2-3 weeks reduce 20-30% then 40-50%
   - **Varied distances**: No equal-split weeks (generatesVariedEasyDistances ensures variation)

5. **Validation** (`validatePlan.ts`)
   - No negative miles
   - Run days have miles ≥ 2.0
   - Weekly totals match sum(days) within 0.2 mi
   - Non-taper weeks have ≥1 long and ≥1 quality
   - **Guardrail**: If >2 run days share identical miles AND paceRange, INVALID
   - Regenerates up to 3 times if invalid, then falls back to conservative plan

6. **Main Function** (`getTrainingPlan.ts`)
   - Single entry point for dashboard + chat
   - Computes fitness → paces → plan → validates
   - Returns `TrainingPlan` with `status: "ready"` or `"not_configured"`

## Integration

### Dashboard (`lib/actions.ts`)
- `generateGoalBasedPlan()` - calls `getTrainingPlan()` and saves to DB
- `updatePlanFromRecentRuns()` - regenerates with latest activities
- `getCurrentPlan()` - retrieves plan from DB

### UI (`app/dashboard/`)
- `PlanManager` - buttons to generate/update plan
- `PlanViewer` - renders weeks table with varied distances and paces
- Empty state shown when `plan.status !== "ready"` or `weeks.length === 0`

## Data Flow

```
Strava Activities (Prisma)
  ↓
computeRecentFitness() → RecentFitness
  ↓
computePaceRanges() → PaceRanges
  ↓
generate12WeekPlan() → TrainingPlan
  ↓
validatePlan() → ValidationResult
  ↓
Save to DB (Plan + PlanItems)
  ↓
UI renders weeks table
```

## Features

✅ Deterministic plan generation (no random LLM numbers)
✅ Real computation from Strava data
✅ Varied distances (no equal splits)
✅ Proper progression with cutbacks
✅ Taper in last 2-3 weeks
✅ Validation with regeneration fallback
✅ Single code path for dashboard + chat
✅ Pace ranges computed from fitness data

## Remaining Work

- [ ] Tests (pace ordering, validator, weekly totals, taper, long run constraints)
- [ ] Chat integration (coachResponder using getTrainingPlan for plan changes)
- [ ] Debug mode (?debug=1 shows provenance + fitness summary)
- [ ] Store pace ranges in DB (currently only midpoint stored as targetPace)

## Usage

```typescript
import { getTrainingPlan } from './lib/planEngine';

const { plan, validation } = await getTrainingPlan(
  goal,        // Prisma Goal
  activities,  // Prisma Activity[]
  daysPerWeek, // 5 (default)
  mode         // "standard" | "conservative" | "aggressive"
);

if (plan.status === "ready") {
  // Render plan.weeks
} else {
  // Show empty state
}
```

## Provenance

All plans include `meta.provenance: "planEngine:v1"` and `meta.generatedAt` timestamp for tracking.
