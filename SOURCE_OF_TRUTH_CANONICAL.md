# Canonical Source of Truth Map

## Plan Generation - SINGLE CANONICAL PATH

**ONLY ALLOWED PATH**:
```
lib/actions.ts::generateGoalBasedPlan()
  → lib/planEngine/getTrainingPlan()
    → lib/planEngine/computeRecentFitness()
    → lib/planEngine/computePaceRanges()
    → lib/planEngine/generate12WeekPlan()
    → lib/planEngine/validatePlan()
    → Save to DB (Plan + PlanItems with fingerprint)
```

**DISABLED PATHS** (all throw errors):
- ❌ `lib/plan-generator.ts::generateGoalBasedPlan()` - throws error
- ❌ `lib/training.ts::generateNext7DaysPlan()` - throws error
- ❌ `lib/plan/generatePlan.ts::generateMarathonPlan()` - throws error
- ❌ `lib/plan/planAdapter.ts::convertPlanToLegacyFormat()` - throws error
- ❌ `lib/plan/paceModel.ts::computePaceRanges()` - throws error
- ❌ `lib/plan/validatePlan.ts::validatePlan()` - throws error

## Data Flow

1. **UI Action**: User clicks "Generate Weekly Plan"
   - `app/dashboard/plan-manager.tsx` → `generateGoalBasedPlan()` server action

2. **Server Action**: `lib/actions.ts::generateGoalBasedPlan()`
   - Calls `lib/planEngine/getTrainingPlan()`
   - Converts canonical plan to DB format
   - Stores fingerprint in first item notes: `[ENGINE_V1_FINGERPRINT:...]`

3. **Plan Engine**: `lib/planEngine/getTrainingPlan()`
   - Computes fitness from activities
   - Computes pace ranges
   - Generates 12-week plan
   - Validates plan
   - Returns `TrainingPlan` with fingerprint

4. **Database**: Plan stored with fingerprint
   - `Plan` table: startDate, userId
   - `PlanItem` table: date, type, distanceMeters, targetPace, notes (with fingerprint)

5. **UI Display**: `app/dashboard/plan-viewer.tsx`
   - Reads plan from DB via `getCurrentPlan()`
   - Extracts fingerprint from first item notes
   - Shows fingerprint in debug mode (`?debug=1`)
   - Tripwire detects constant paces (9:30, 8:53)

## Fingerprint System

- **Format**: `ENGINE_V1_<random hex>`
- **Storage**: First `PlanItem.notes` contains `[ENGINE_V1_FINGERPRINT:...]`
- **Purpose**: Prove plan came from canonical engine
- **Verification**: `getCurrentPlan()` returns `null` if fingerprint missing (forces regeneration)

## Pace Computation

- **Source**: `lib/planEngine/computePaceRanges()`
- **Input**: `RecentFitness` + `Goal`
- **Output**: Pace ranges (sec/mile) for mp, easy, tempo, interval
- **Storage**: Midpoint of range stored as `targetPace` (sec/meter) in DB
- **Display**: `formatPace()` converts sec/meter to min:sec/unit

## Old Systems Status

### lib/plan-generator.ts
- ✅ **DISABLED** - throws error
- Old 7-day generator with bugs

### lib/training.ts::generateNext7DaysPlan()
- ✅ **DISABLED** - throws error
- Old 7-day generator

### lib/plan/ (entire directory)
- ✅ **DISABLED** - all exports throw errors
- Old plan engine system
- Replaced by `lib/planEngine/`

## Verification

To verify canonical path is used:

1. **Check fingerprint**: Visit `/dashboard?debug=1`
   - Should see: `Fingerprint: ENGINE_V1_<random>`
   - Should see: `Provenance: lib/planEngine/getTrainingPlan`

2. **Check console logs** (dev mode):
   - `[PLAN ENGINE] Generated plan with fingerprint: ...`
   - `[PLAN ENGINE] Generated at: ...`
   - `[PLAN ENGINE] Provenance: ...`

3. **Check old plans**: `getCurrentPlan()` returns `null` if no fingerprint
   - Forces regeneration with new engine

4. **Tripwire**: If constant paces appear, Error thrown in dev mode
   - Detects 9:30/mi, 8:53/mi, or repeated scalar paces

## Success Criteria

✅ Only `lib/planEngine/getTrainingPlan()` can create populated plans
✅ All old generators throw errors
✅ Fingerprint appears in debug mode
✅ Old plans without fingerprint are ignored
✅ Tripwire detects constant paces
