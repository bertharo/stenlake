# Fixes Applied - Root Cause Resolution

## Source of Truth Map

### Pace Source-of-Truth
- **Computation**: `lib/plan/paceModel.ts::computePaceRanges()` → `lib/plan/planAdapter.ts::convertPlanToLegacyFormat()` → Database `PlanItem.targetPace`
- **Display**: `app/dashboard/plan-viewer.tsx` line 289: `formatPace(item.targetPace, distanceUnit)`

### Chat Source-of-Truth  
- **API Route**: `app/api/chat/route.ts::POST()` → `lib/coach-v2.ts::generateGroundedCoachResponse()`
- **Display**: `app/dashboard/chat-window.tsx` line 95: `result.message`

## Fixes Applied

### 1. Eliminated Hardcoded 9:30 Pace

**Problem**: Default 0.36 s/m (~9:39/mile) was too close to 9:30, and could appear as 9:30 due to rounding.

**Fixes**:
- ✅ Removed hardcoded default from `computeRecentFitness` - now returns `{min: 0, max: 0}` to signal "use goal-based estimate"
- ✅ `paceModel.ts` now always computes from goal pace if no fitness data: Easy = MP × 1.15-1.25
- ✅ Added invariant check in `paceModel.ts` and `formatPace()` to detect and error on exactly 9:30/mi (0.354 s/m)
- ✅ Added debug logging to show computed pace ranges and their source

### 2. Fixed Plan Mileage Issues

**Problem**: Negative miles, 0.5 mile runs, incoherent weekly totals.

**Fixes**:
- ✅ Validation runs BEFORE returning plan (`validatePlan()` called in `generateMarathonPlan()`)
- ✅ Minimum 2.0 miles enforced for all runs (including warmup/cooldown)
- ✅ Quality workouts minimum 3.0 miles total
- ✅ Easy run distance calculation ensures minimums are met
- ✅ Auto-fix attempts (up to 3) before falling back to conservative plan

### 3. Made Chat Conversational

**Problem**: Stub responses were template-like and rigid.

**Fixes**:
- ✅ Updated stub responses to be more natural ("Looking at your plan..." instead of "Your next scheduled run is...")
- ✅ Removed rigid formatting, made responses flow naturally
- ✅ Added debug logging to show if using OpenAI or stub
- ✅ Updated system prompt to emphasize natural conversation

### 4. Debug Logging Added

**Dev-only logging**:
- ✅ Pace ranges: Shows computed ranges and source (fitness data vs goal estimate)
- ✅ Chat source: Shows if using OpenAI API or stub response
- ✅ Stack traces: Shows where pace computation happens

## Testing

To verify fixes:

1. **Check pace computation**:
   - Open browser console (dev mode)
   - Look for `[PACE DEBUG]` logs showing computed ranges
   - Verify no pace equals exactly 9:30/mi

2. **Check chat source**:
   - Look for `[CHAT DEBUG]` logs
   - Verify `hasOpenAIKey: true` and `responseSource: 'OpenAI API'`
   - If using stub, you'll see a warning

3. **Check plan validation**:
   - Generate a plan
   - Check console for validation errors
   - Verify no negative miles, all runs >= 2.0 miles

## Next Steps

1. Regenerate your plan to see new pace calculations
2. Test chat with various queries to verify natural responses
3. Check browser console for debug logs (dev mode only)
