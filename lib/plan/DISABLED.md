# lib/plan/ Directory - DISABLED

**STATUS**: This directory is DEPRECATED and DISABLED.

**REASON**: Replaced by `lib/planEngine/` which is the new canonical plan generation system.

**DO NOT USE**: All functions in this directory should throw errors if called.

**USE INSTEAD**: `lib/planEngine/getTrainingPlan()` - the single canonical entry point.

## Migration

- OLD: `lib/plan/generatePlan.ts::generateMarathonPlan()` ❌
- NEW: `lib/planEngine/getTrainingPlan()` ✅

- OLD: `lib/plan/paceModel.ts::computePaceRanges()` ❌
- NEW: `lib/planEngine/computePaceRanges()` ✅

- OLD: `lib/plan/validatePlan.ts::validatePlan()` ❌
- NEW: `lib/planEngine/validatePlan()` ✅

## Files in this directory

All files are kept for reference but should NOT be imported or called.
