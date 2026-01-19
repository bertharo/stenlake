# Plan & Chat Consolidation Complete

## Summary

All plan generation and chat responses now flow through **single canonical engines** with runtime provenance tracking.

## Canonical Plan Engine

**Location**: `lib/planEngine/index.ts`

**Single Entry Point**: `getTrainingPlan()`

**All code paths now use this**:
- ✅ `lib/actions.ts::generateGoalBasedPlan()` → `planEngine::getTrainingPlan()`
- ✅ `lib/actions.ts::updatePlanFromRecentRuns()` → `planEngine::getTrainingPlan()`
- ✅ `lib/actions.ts::regeneratePlan()` → Redirects to `generateGoalBasedPlan()` → `planEngine::getTrainingPlan()`

**Disabled Old Generators**:
- ❌ `lib/training.ts::generateNext7DaysPlan()` - Throws error (hard disabled)
- ❌ `lib/plan-generator.ts::generateGoalBasedPlan()` - Throws error (hard disabled)
- ❌ `lib/plan/generatePlan.ts::generateMarathonPlan()` - Throws error (hard disabled)
- ❌ `lib/plan/planAdapter.ts::convertPlanToLegacyFormat()` - Throws error (hard disabled)
- ❌ `lib/plan/paceModel.ts::computePaceRanges()` - Throws error (hard disabled)
- ❌ `lib/plan/validatePlan.ts::validatePlan()` - Throws error (hard disabled)

## Canonical Chat Engine

**Location**: `lib/coach-v2.ts`

**Single Entry Point**: `generateGroundedCoachResponse()`

**All code paths now use this**:
- ✅ `app/api/chat/route.ts` → `coach-v2.ts::generateGroundedCoachResponse()`

**Disabled Old Responders**:
- ❌ `lib/coach.ts::generateCoachResponse()` - Throws error (hard disabled)

## Runtime Provenance Tracking

### Plan Provenance

Every plan includes `meta.provenance`:
```typescript
{
  engine: "planEngine",
  version: "v1",
  inputsUsed: ["strava:last42days:15runs", "goal:42km:160min"],
  source: "strava" | "demo" | "conservative"
}
```

**Display**:
- Dev mode: Console logs `[PLAN PROVENANCE]` with full details
- UI: Dev-only footer shows "PLAN SOURCE: planEngine:v1"
- Rationale: Includes provenance info in plan description

### Chat Provenance

Every chat response logs source:
- `CHAT SOURCE: llmRoute` (OpenAI API)
- `CHAT SOURCE: stub` (Fallback stub)

**Display**:
- Dev mode: Console logs `[CHAT DEBUG]` with `chatSource` field
- Production: Logs error if stub used in production

## Guardrails Added

### Plan Validation Guardrails

1. **Identical Runs Detection**:
   - Fails validation if all runs in a week have identical distance AND pace
   - Error: "All runs have identical distance AND pace - this is a bug"

2. **9:30 Pace Detection**:
   - Throws error if pace equals exactly 9:30/mi (0.354 s/m)
   - Detected in `paceModel.ts` and `formatPace()`

3. **Minimum Distance**:
   - All runs must be >= 2.0 miles (including warmup/cooldown)

4. **Weekly Total Match**:
   - Weekly total must equal sum of days (within 0.1 mile tolerance)

### Conservative Plan Fixed

- ✅ No more identical "Easy run - conservative plan" templates
- ✅ Varied distances: 15%, 25%, 30%, 30% of weekly
- ✅ Varied types: Easy, Tempo (every other week), Long run
- ✅ Includes pace ranges for all runs

## Testing

To verify consolidation:

1. **Check Plan Source**:
   ```bash
   # In browser console (dev mode)
   # Look for: [PLAN PROVENANCE] { engine: "planEngine", version: "v1", ... }
   ```

2. **Check Chat Source**:
   ```bash
   # In browser console (dev mode)
   # Look for: CHAT SOURCE: llmRoute or CHAT SOURCE: stub
   ```

3. **Verify No Old Generators**:
   - Try calling `generateNext7DaysPlan()` → Should throw error
   - Try calling old `generateGoalBasedPlan()` → Should throw error

4. **Check UI**:
   - Dev mode: Should see "PLAN SOURCE: planEngine:v1" footer
   - All plans should have varied distances and paces

## Files Modified

### Created:
- `lib/planEngine/index.ts` - Canonical plan engine

### Modified:
- `lib/actions.ts` - Redirects to canonical engine (`lib/planEngine/getTrainingPlan()`)
- `app/dashboard/plan-viewer.tsx` - Shows fingerprint in debug mode, tripwire for constant paces
- `app/api/chat/route.ts` - Logs chat source

### Disabled:
- `lib/training.ts::generateNext7DaysPlan()` - Throws error
- `lib/plan-generator.ts::generateGoalBasedPlan()` - Throws error
- `lib/plan/generatePlan.ts::generateMarathonPlan()` - Throws error
- `lib/plan/planAdapter.ts::convertPlanToLegacyFormat()` - Throws error
- `lib/plan/paceModel.ts::computePaceRanges()` - Throws error
- `lib/plan/validatePlan.ts::validatePlan()` - Throws error
- `lib/coach.ts::generateCoachResponse()` - Throws error

## Next Steps

1. **Regenerate your plan** - Will use canonical engine
2. **Check console** - Should see provenance logs
3. **Verify varied runs** - No identical distances/paces
4. **Test chat** - Should see "CHAT SOURCE: llmRoute" in console
