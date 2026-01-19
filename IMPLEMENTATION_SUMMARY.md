# Implementation Summary: 12-Week Marathon Plan Generator & Conversational Chat

## Overview

This implementation completely rewrites the training plan generation system with strict validation and realistic pace calculations, and improves the chat experience to be more natural and conversational.

## What Was Implemented

### A) Data Model & Ingestion (`lib/strava/computeRecentFitness.ts`)

**RecentFitness Object** - Computed from last 42 days (6 weeks) of Strava runs:
- ✅ Rolling weekly mileage (last 6 weeks)
- ✅ Long run distance (max in last 6 weeks)
- ✅ Recent tempo/threshold estimate (from sustained efforts)
- ✅ Recent VO2-ish pace estimate (from best 5K/10K efforts)
- ✅ Easy pace range inferred from easy runs (uses HR if available, otherwise pace)
- ✅ Fatigue/load proxy (TRIMP-like: sum(duration * intensityFactor))
- ✅ Graceful degradation with assumptions when data is missing

### B) Plan Generation Algorithm (`lib/plan/generatePlan.ts`)

**12-Week Marathon Plan Generator** with strict constraints:
- ✅ NEVER negative miles
- ✅ Minimum 2.0 miles per run (unless strides-only with warmup/cooldown)
- ✅ Weekly mileage coherence:
  - Start week clamped to +/-10% of last 2-week average
  - Max 8% increase per week (except cutback weeks)
  - Cutback every 3-4 weeks (10-20% reduction)
  - Peak week <= 1.25x user's highest week (unless aggressive mode)
  - Long run <= 35% of weekly mileage
- ✅ Workout distribution:
  - 1 long run per week (25-30% of weekly)
  - 1 quality workout (tempo or intervals, 15-20% of weekly)
  - Remaining easy/recovery runs
  - Rest days (2-3 per week)
- ✅ Taper: Final 2-3 weeks reduce volume (70% → 50% → 30%)

**Pace Calculation** (`lib/plan/paceModel.ts`):
- ✅ Paces derived from RecentFitness and goal time
- ✅ Output as ranges (e.g., "Easy 8:10-8:50/mi"), not single constants
- ✅ Easy pace: 15-25% slower than marathon pace (or from easy runs)
- ✅ Tempo pace: Threshold effort (5-10% faster than marathon, or detected)
- ✅ Interval pace: VO2 effort (15-20% faster than marathon, or from 5K/10K)
- ✅ Marathon pace: Goal pace ± 2%
- ✅ **Never hardcodes 9:30/mi** - all paces are computed from actual data

### C) Validation Layer (`lib/plan/validatePlan.ts`)

**Comprehensive Validation**:
- ✅ No negative miles
- ✅ Weekly totals match sum of days
- ✅ Monotonic progression rules (max 8% increase)
- ✅ Cutback pattern (every 3-4 weeks)
- ✅ Pace ranges are sane (easy slower than marathon, interval faster than tempo)
- ✅ Taper weeks decreasing
- ✅ Long run <= 35% of weekly mileage

**Fallback Behavior**:
- ✅ Attempts to fix automatically (up to 3 attempts)
- ✅ Falls back to conservative plan if fixes fail
- ✅ Explains assumptions in plan metadata

### D) Plan Output Schema (`lib/plan/generatePlan.ts`)

**Structured JSON Output**:
```typescript
{
  meta: {
    goal: { distanceMeters, targetTimeSeconds, raceDate },
    startDate: Date,
    assumptions: string[],
    fitnessSummary: {
      averageWeeklyMileage,
      peakWeeklyMileage,
      maxLongRunMeters
    }
  },
  weeks: [{
    weekNumber: number,
    totalMiles: number,
    days: [{
      date: Date,
      type: "easy" | "long" | "tempo" | "interval" | "rest",
      miles: number,
      warmupMiles?: number,
      mainSet?: string,
      cooldownMiles?: number,
      paceRanges?: { min: number, max: number },
      notes?: string
    }]
  }]
}
```

- ✅ Weekly totalMiles matches sum of days
- ✅ Plan adapter converts to legacy database format for backward compatibility

### E) Conversational Experience (`lib/coach-v2.ts`)

**ChatGPT-like Natural Conversation**:
- ✅ Natural responses to greetings (no forced training data)
- ✅ References recent runs when relevant ("I see your last long run was...")
- ✅ Asks at most ONE clarification question, then makes assumptions
- ✅ Explains "why" behind workouts and adjustments
- ✅ Supports follow-ups ("make week 4 lighter", "swap Tue/Thu", "I feel cooked today")
- ✅ Conversation state tracking (goals, constraints, preferences)
- ✅ Coach reasoning transparency (brief bullet list of signals used)

## Files Created/Modified

### New Files:
1. `lib/strava/computeRecentFitness.ts` - RecentFitness computation
2. `lib/plan/paceModel.ts` - Pace range calculations
3. `lib/plan/generatePlan.ts` - 12-week plan generator
4. `lib/plan/validatePlan.ts` - Plan validation
5. `lib/plan/planAdapter.ts` - Convert to legacy format
6. `lib/plan/README.md` - Documentation

### Modified Files:
1. `lib/actions.ts` - Updated to use new plan generator
2. `lib/coach-v2.ts` - Improved conversational prompt and stub responses

## Key Improvements

### Plan Generation:
- ✅ **No more negative miles** - Strict validation prevents this
- ✅ **No more 0.5 mile runs** - Minimum 2.0 miles enforced
- ✅ **Realistic paces** - Computed from actual data, not hardcoded
- ✅ **Coherent weekly progression** - Follows training principles
- ✅ **Proper cutback weeks** - Prevents overtraining

### Chat Experience:
- ✅ **Natural conversation** - Responds like ChatGPT, not a rigid chatbot
- ✅ **Context-aware** - References recent runs when relevant
- ✅ **Supportive** - Explains reasoning and provides actionable advice

## Testing Recommendations

1. **Unit Tests** (to be added):
   - `validatePlan` - Test all validation rules
   - `computeRecentFitness` - Test fitness computation
   - `computePaceRanges` - Test pace calculations
   - `generateMarathonPlan` - Test plan generation

2. **Integration Tests**:
   - Generate plan with various fitness levels
   - Test validation error handling
   - Test fallback to conservative plan

3. **Manual Testing**:
   - Generate plan and verify no negative miles
   - Verify paces are realistic and varied
   - Test chat with various queries
   - Verify follow-up requests work

## Next Steps

1. Add unit tests for validation and pace model
2. Add integration tests for plan generation
3. Test with real Strava data
4. Monitor validation errors in production
5. Iterate on chat experience based on user feedback

## Notes

- The old `plan-generator.ts` is kept for backward compatibility but is no longer used
- The new system uses `RecentFitness` instead of `TrainingSignals` for more comprehensive fitness assessment
- Pace ranges are used instead of single values to account for day-to-day variance
- All plans are validated before being saved to the database
