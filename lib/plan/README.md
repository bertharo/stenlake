# Training Plan Generation

This module implements a robust 12-week marathon training plan generator with strict validation and realistic pace calculations.

## Architecture

### Core Modules

1. **`computeRecentFitness.ts`** - Computes fitness profile from Strava runs (last 42 days)
   - Rolling weekly mileage (last 6 weeks)
   - Long run distances
   - Pace estimates (easy, tempo, VO2)
   - Fatigue/load metrics

2. **`paceModel.ts`** - Computes pace ranges for different workout types
   - Easy pace: 15-25% slower than marathon pace
   - Marathon pace: Goal pace ± 2%
   - Tempo pace: Threshold effort (5-10% faster than marathon)
   - Interval pace: VO2 effort (15-20% faster than marathon)

3. **`generatePlan.ts`** - Generates 12-week training plan
   - Adapts to user's recent fitness
   - Progressive build-up with cutback weeks
   - Taper in final 2-3 weeks
   - Includes long runs, quality workouts, easy runs

4. **`validatePlan.ts`** - Validates plan against constraints
   - No negative miles
   - Minimum distances (2 miles per run)
   - Weekly totals match sum of days
   - Monotonic progression (max 8% increase per week)
   - Cutback pattern (every 3-4 weeks)
   - Pace ranges are sane
   - Taper weeks decrease volume
   - Long run <= 35% of weekly mileage

5. **`planAdapter.ts`** - Converts new plan format to legacy database format

## Plan Rules

### Weekly Mileage Progression

- **Start week**: Clamped to within +/-10% of last 2-week average
- **Increase rule**: Maximum 8% increase per week (except cutback weeks)
- **Cutback weeks**: Every 3-4 weeks, reduce volume by 10-20%
- **Peak week**: <= 1.25x user's highest week in last 6 weeks (unless aggressive mode)
- **Taper**: Final 2-3 weeks reduce volume (70% → 50% → 30%)

### Workout Distribution

- **Long run**: 25-30% of weekly mileage, max 35%
- **Quality workout**: 15-20% of weekly mileage (tempo or intervals)
- **Easy runs**: Remaining mileage distributed evenly
- **Rest days**: 2-3 per week depending on weekly mileage

### Pace Calculation

Paces are computed from:
1. User's recent easy runs (if available)
2. Detected tempo/threshold efforts
3. Best 5K/10K efforts (for VO2 pace)
4. Goal marathon pace (fallback)

Paces are output as **ranges** (e.g., "8:10-8:50/mi") to account for day-to-day variance.

### Validation

The plan is validated against all constraints. If invalid:
1. Attempts to fix automatically (up to 3 attempts)
2. Falls back to conservative plan if fixes fail
3. Logs validation errors for debugging

## Fallback Behavior

If validation fails or insufficient data:
- Uses conservative defaults based on goal distance/pace
- Assumes minimum reasonable fitness levels
- Explains assumptions in plan metadata

## Usage

```typescript
import { generateMarathonPlan } from "./plan/generatePlan";
import { validatePlan } from "./plan/validatePlan";

const { plan, validationErrors } = generateMarathonPlan({
  goal,
  activities,
  distanceUnit,
  aggressiveMode: false,
});

const validation = validatePlan(plan, distanceUnit);
if (!validation.isValid) {
  console.error("Validation errors:", validation.errors);
}
```
