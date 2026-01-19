# Fixes Applied for Pace and Longest Run Issues

## Issues Fixed

### 1. Pace Showing 9:30min for Every Run
**Root Cause**: All easy runs use the same `easyPace` value, which is calculated from median pace. If median pace calculation had issues, all easy runs would show the same incorrect pace.

**Fixes Applied**:
- Added validation to filter out invalid paces (zero distance or zero time) in `lib/training.ts`
- Added bounds checking: median pace must be between 0.2-1.0 seconds per meter
- Added default fallback to 0.36 seconds per meter (~5:00/km) if median pace is invalid
- Added same validation in `lib/plan-generator.ts` for plan generation

**Note**: If you're still seeing the same pace, you need to **regenerate your plan** for the fixes to take effect. The old plan in the database still has the old values.

### 2. Longest Run Showing 17 Miles (Too Short)
**Root Cause**: Incorrect unit conversion in the maximum long run cap.

**Fixes Applied**:
- Fixed maximum long run cap: 22 miles = 35,405 meters (was incorrectly 35,000m = 21.75 miles)
- Fixed minimum long run values:
  - 20 miles = 32,187 meters (was incorrectly 20,000m = 12.4 miles)
  - 15 miles = 24,140 meters (was incorrectly 15,000m = 9.3 miles)

**Note**: You need to **regenerate your plan** for the longest run fix to take effect.

## How to Apply the Fixes

1. **Regenerate your training plan**:
   - Go to Dashboard
   - Click "Generate Goal-Based Plan" or "Update Plan from Recent Runs"
   - This will create a new plan with the corrected calculations

2. **Verify the fixes**:
   - Check that different run types (easy, tempo, interval) show different paces
   - Check that long runs are no longer capped at 17 miles (should allow up to 22 miles)

## Debugging

If you're still seeing issues after regenerating:

1. **Check your activity data**:
   - Verify `movingTimeSeconds` and `distanceMeters` are correct in your database
   - Invalid data (zero values) will cause pace calculation issues

2. **Check your distance unit**:
   - If you're using miles, 9:30/mile = 5:54/km (reasonable easy pace)
   - If you're using km, 9:30/km is very slow (walking pace)

3. **Check median pace calculation**:
   - The median pace should be between 0.2-1.0 seconds per meter
   - If it's outside this range, it will default to 0.36 seconds per meter (~5:00/km)
