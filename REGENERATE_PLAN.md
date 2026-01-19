# Important: Regenerate Your Plan

## The Issue

The fixes I made are in the code, but **your existing plan in the database still has the old values**. You need to regenerate your plan for the fixes to take effect.

## How to Fix

1. **Go to your Dashboard**
2. **Click "Regenerate Plan"** (or "Generate Weekly Plan" if you don't have a plan yet)
3. This will create a new plan with:
   - Corrected pace calculations (different paces for easy, tempo, interval runs)
   - Corrected longest run cap (up to 22 miles instead of 17 miles)

## What Was Fixed

### Pace Issue (9:30min for every run)
- **Problem**: All easy runs were using the same pace, and if median pace was wrong, all runs showed the same incorrect pace
- **Fix**: Added validation to ensure median pace is reasonable, and different run types (easy, tempo, interval) now use different paces
- **Note**: Easy runs will still show the same pace (that's correct - all easy runs should have the same target pace), but tempo and interval runs should show faster paces

### Longest Run Issue (17 miles cap)
- **Problem**: Maximum long run was incorrectly capped at 35,000 meters (21.75 miles) instead of 35,405 meters (22 miles)
- **Fix**: Corrected the cap to 35,405 meters (22 miles) for users with miles as their unit
- **Also fixed**: Minimum long run values were incorrect (20 miles was set to 20,000m instead of 32,187m)

## After Regenerating

After you regenerate your plan, you should see:
- ✅ Different paces for different run types (easy runs slower, tempo/interval faster)
- ✅ Long runs can go up to 22 miles (if your weekly mileage supports it)

## If Issues Persist

If you still see problems after regenerating:

1. **Check your activity data**: Make sure your Strava activities have correct `movingTimeSeconds` and `distanceMeters` values
2. **Check your distance unit**: Are you using miles or kilometers? The pace format should show "/mi" or "/km"
3. **Check the run types**: Are you seeing only easy runs? If so, that's why they all have the same pace (which is correct)
