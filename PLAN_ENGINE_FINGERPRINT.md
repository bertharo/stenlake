# Plan Engine Fingerprint System

## Problem
UI was showing old constant paces (9:30/mi, 8:53/mi) which could only happen if the UI was reading from a different code path (old generator, fixture, cache, etc.) instead of the new canonical engine.

## Solution Implemented

### 1. Runtime Fingerprint
- **Location**: `lib/planEngine/getTrainingPlan.ts` and `lib/planEngine/generate12WeekPlan.ts`
- **Format**: `ENGINE_V1_<random hex>` (e.g., `ENGINE_V1_a3f2b1c4`)
- **Storage**: Stored in first `PlanItem.notes` as `[ENGINE_V1_FINGERPRINT:...]`
- **Purpose**: Undeniable proof that plan came from canonical engine

### 2. Debug Display
- **Location**: `app/dashboard/plan-viewer.tsx`
- **Trigger**: Add `?debug=1` to dashboard URL
- **Shows**:
  - Fingerprint (if present)
  - Provenance: `lib/planEngine/getTrainingPlan`
  - Warning if fingerprint missing (old plan detected)

### 3. Old Plan Detection
- **Location**: `lib/actions.ts::getCurrentPlan()`
- **Behavior**: Returns `null` if plan doesn't have `[ENGINE_V1_FINGERPRINT:]` in first item notes
- **Effect**: Forces regeneration with new engine (old plans are ignored)

### 4. Tripwire System
- **Location**: `app/dashboard/plan-viewer.tsx` (useEffect)
- **Detects**:
  - Exact match to 9:30/mi (570s/mile = 0.354 s/m)
  - Exact match to 8:53/mi (533s/mile = 0.331 s/m)
  - >2 run days with identical pace (within 0.001s/m tolerance)
- **Action**: Throws Error in dev mode with full stack trace
- **Prevents**: Silent regression to constant paces

### 5. Data Flow Tracing
- **Console logs** (dev mode only):
  - `[PLAN ENGINE] Generated plan with fingerprint: ...` in `lib/actions.ts`
  - `[PLAN VIEWER] Plan data: ...` in `plan-viewer.tsx` when `?debug=1`
- **Shows**: planId, itemsCount, fingerprint, sample paces

## Verification Steps

1. **Check if fingerprint appears**:
   - Go to `/dashboard?debug=1`
   - Look for fingerprint display under "Week X Training Plan" header
   - Should show: `Fingerprint: ENGINE_V1_<random>`

2. **If fingerprint missing**:
   - Plan is from old generator (pre-v1)
   - `getCurrentPlan()` will return `null`
   - UI shows empty state
   - User must click "Generate Weekly Plan" to create new plan

3. **If constant paces appear**:
   - Tripwire will throw Error in dev mode
   - Check console for stack trace
   - Verify fingerprint is present
   - If fingerprint present but constants appear, check `computePaceRanges()` output

## Data Sources Eliminated

✅ **Old generators disabled**:
- `lib/plan-generator.ts::generateGoalBasedPlan()` - throws error
- `lib/training.ts::generateNext7DaysPlan()` - throws error

✅ **Old plans filtered**:
- `getCurrentPlan()` ignores plans without fingerprint
- Forces regeneration with new engine

✅ **No fixtures/mocks**:
- No hardcoded plans found in codebase
- No localStorage caching detected
- No API route caching detected

## Remaining Work

- [ ] Add tests for fingerprint system
- [ ] Verify fingerprint persists across plan updates
- [ ] Add fingerprint to plan update operations
- [ ] Consider storing fingerprint in Plan model (requires migration)

## Success Criteria

✅ Fingerprint appears in debug mode (`?debug=1`)
✅ Old plans without fingerprint are ignored
✅ Tripwire detects constant paces and throws error
✅ Only canonical engine (`getTrainingPlan`) can create populated plans
✅ Build passes with no TypeScript errors
