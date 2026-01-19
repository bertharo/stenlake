# Source of Truth Map - OUTDATED

⚠️ **THIS FILE IS OUTDATED** - See `SOURCE_OF_TRUTH_CANONICAL.md` for current architecture.

## Current Canonical Path

**ONLY ALLOWED PATH**:
```
lib/actions.ts::generateGoalBasedPlan()
  → lib/planEngine/getTrainingPlan()
    → lib/planEngine/computePaceRanges()
    → Stores targetPace in database
```

**OLD PATHS (DISABLED)**:
- ❌ `lib/plan/generatePlan.ts` - throws error
- ❌ `lib/plan/paceModel.ts` - throws error
- ❌ `lib/plan/planAdapter.ts` - throws error

See `SOURCE_OF_TRUTH_CANONICAL.md` for complete documentation.

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
