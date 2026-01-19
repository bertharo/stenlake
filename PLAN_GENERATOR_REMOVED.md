# Plan Generator Removed

**Date**: 2024-12-XX

## Summary

The weekly training plan generator has been completely removed and will be rebuilt from scratch.

## What Was Removed

1. **Plan Generation Functions** (all disabled in `lib/actions.ts`):
   - `generateGoalBasedPlan()` - throws error
   - `updatePlanFromRecentRuns()` - throws error  
   - `regeneratePlan()` - throws error
   - `getCurrentPlan()` - returns `null` (no plan from DB)

2. **Plan Engine** (still exists but unused):
   - `lib/planEngine/index.ts` - canonical plan engine (kept for reference)
   - `lib/plan/` - plan generation modules (kept for reference)

3. **UI Changes**:
   - `PlanManager` - shows disabled placeholder button
   - `PlanViewer` - only renders if plan has items (empty state shown instead)
   - `dashboard-client.tsx` - shows empty state card with next steps

## Current State

- **Dashboard**: Shows empty state with message "Training plan generation is temporarily disabled while we rebuild it"
- **Next Steps Displayed**:
  - Connect Strava
  - Set a goal race and target time
  - Choose days per week
- **Safety Tripwire**: `PlanViewer` logs console error in dev mode if it attempts to render pace/distance from a plan

## Call Chain (Before Removal)

```
app/dashboard/page.tsx
  → getCurrentPlan() [lib/actions.ts]
    → Returns plan from DB (now returns null)

app/dashboard/plan-manager.tsx
  → generateGoalBasedPlan() [lib/actions.ts]
    → planEngine::generate12WeekPlan()
      → lib/plan/generatePlan.ts
        → Creates Plan with weeks/days/paces
```

## Files Modified

- `lib/actions.ts` - All plan generation functions disabled
- `app/dashboard/dashboard-client.tsx` - Empty state UI
- `app/dashboard/plan-manager.tsx` - Disabled buttons, removed handlers
- `app/dashboard/plan-viewer.tsx` - Safety tripwire, empty state check

## Next Steps for Rebuild

When rebuilding the plan generator:
1. Re-enable functions in `lib/actions.ts`
2. Update `getCurrentPlan()` to query DB again
3. Re-enable buttons in `PlanManager`
4. Remove empty state UI from `dashboard-client.tsx`
5. Remove safety tripwire from `PlanViewer`
