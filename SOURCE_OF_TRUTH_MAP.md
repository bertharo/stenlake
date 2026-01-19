# Source of Truth Map

## Pace Source-of-Truth

**Computation Path:**
1. `lib/actions.ts::generateGoalBasedPlan()` 
   → Calls `lib/plan/generatePlan.ts::generateMarathonPlan()`
   → Uses `lib/plan/paceModel.ts::computePaceRanges(fitness, goal, distanceUnit)`
   → Converts via `lib/plan/planAdapter.ts::convertPlanToLegacyFormat()`
   → Stores `targetPace` in database (PlanItem.targetPace)

2. **Display Path:**
   - `app/dashboard/plan-viewer.tsx` line 289: `formatPace(item.targetPace, distanceUnit)`
   - `lib/units.ts::formatPace()` converts seconds/meter to min:sec/unit

**Problem:** The new generator IS being used, but:
- If `RecentFitness` has no data, pace model falls back to defaults
- Default 0.36 s/m = 9:39/mile (close to 9:30)
- Need to ensure pace ranges are computed from goal pace, not hardcoded defaults

## Chat Source-of-Truth

**Response Path:**
1. `app/dashboard/chat-window.tsx` line 85: `fetch("/api/chat", ...)`
   → `app/api/chat/route.ts::POST()`
   → Calls `lib/coach-v2.ts::generateGroundedCoachResponse()`
   → Uses OpenAI or stub response

**Problem:** 
- Stub response in `coach-v2.ts` might be too rigid
- Need to ensure OpenAI responses are actually being used
- Need to check if prompt is being applied correctly

## Issues Found

1. **Pace:** Default 0.36 s/m (9:39/mile) is too close to 9:30. Need to compute from goal pace instead.
2. **Chat:** Stub responses might be too template-like. Need to ensure natural responses.
