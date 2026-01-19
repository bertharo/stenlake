# Code Paths Enumeration

## Plan Generation Paths

### Path A: OLD 7-Day Generator (BUGGY - STILL ACTIVE)
- **Called from**: `lib/actions.ts::regeneratePlan()` line 191
- **Generator**: `lib/training.ts::generateNext7DaysPlan()`
- **UI Renderer**: `app/dashboard/plan-viewer.tsx`
- **Conditions**: Called when user clicks "Regenerate Plan" button (if it exists)
- **Issues**: 
  - Buggy distance calculation (lines 299, 307) - equal splits
  - Uses `signals.medianPace` directly (can be 0.36 default = 9:39/mi)
  - No validation
  - All easy runs get same pace (`paceKm * 1.08`)

### Path B: NEW 12-Week Generator (CORRECT)
- **Called from**: `lib/actions.ts::generateGoalBasedPlan()` line 234
- **Generator**: `lib/plan/generatePlan.ts::generateMarathonPlan()`
- **UI Renderer**: `app/dashboard/plan-viewer.tsx`
- **Conditions**: Called when user clicks "Generate Goal-Based Plan"
- **Status**: ✅ Uses RecentFitness, validates, computes pace ranges

### Path C: NEW 12-Week Generator (Update Path)
- **Called from**: `lib/actions.ts::updatePlanFromRecentRuns()` line 314
- **Generator**: `lib/plan/generatePlan.ts::generateMarathonPlan()`
- **UI Renderer**: `app/dashboard/plan-viewer.tsx`
- **Conditions**: Called when user clicks "Update Plan from Recent Runs"
- **Status**: ✅ Uses RecentFitness, validates, computes pace ranges

### Path D: OLD Goal-Based Generator (UNUSED?)
- **Location**: `lib/plan-generator.ts::generateGoalBasedPlan()`
- **Called from**: NOT FOUND in current codebase (may be legacy)
- **Status**: ⚠️ Still exists but appears unused

### Path E: Conservative Fallback (TEMPLATE ISSUE)
- **Called from**: `lib/plan/generatePlan.ts::generateConservativePlan()` line 406
- **Generator**: `lib/plan/generatePlan.ts::generateConservativePlan()`
- **UI Renderer**: `app/dashboard/plan-viewer.tsx`
- **Conditions**: When validation fails after 3 fix attempts
- **Issues**: 
  - All runs have identical notes: "Easy run - conservative plan"
  - Equal distance splits: `startMileage / 4`
  - No pace ranges (missing paceRanges field)

## Chat Generation Paths

### Path F: OpenAI API Route (PRIMARY)
- **Called from**: `app/dashboard/chat-window.tsx` line 85: `fetch("/api/chat")`
- **API Route**: `app/api/chat/route.ts::POST()` line 96
- **Responder**: `lib/coach-v2.ts::generateGroundedCoachResponse()`
- **Conditions**: When `OPENAI_API_KEY` is set
- **Status**: ✅ Uses updated prompt

### Path G: Stub Response (FALLBACK)
- **Called from**: `app/api/chat/route.ts` line 69 (when no OpenAI key)
- **Responder**: `lib/coach-v2.ts::generateStubResponse()`
- **Conditions**: When `OPENAI_API_KEY` is missing
- **Status**: ⚠️ Updated but still template-like

### Path H: Old Coach (UNUSED?)
- **Location**: `lib/coach.ts::generateCoachResponse()`
- **Called from**: NOT FOUND in current codebase
- **Status**: ⚠️ Still exists but appears unused

## Problem Summary

1. **Path A is still active** - `regeneratePlan()` uses old buggy generator
2. **Path E produces identical runs** - Conservative fallback has template issues
3. **Multiple unused generators** - `plan-generator.ts` and `coach.ts` still exist

## Solution Required

1. Consolidate ALL plan generation to `lib/plan/generatePlan.ts`
2. Remove or redirect `regeneratePlan()` to use canonical engine
3. Fix conservative plan to have varied runs
4. Add provenance tracking to all paths
5. Consolidate chat to single responder with provenance
