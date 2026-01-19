# Rebrand Checklist: Stenlake → Roger

## ✅ Files Updated

### User-Facing Copy
- ✅ `app/layout.tsx` - Updated title and description metadata
  - Title: "Stenlake — Running Coach" → "Roger — Running Coach"
  - Description: Updated to reflect "calm, intelligent running coach"

### System Prompts & AI Responses
- ✅ `lib/coach.ts` - Updated system prompt and stub responses
  - Changed "Stenlake" to "Roger"
  - Updated tone to be "calm, intelligent, short, precise, grounded"
  - Simplified greeting responses to be more concise
  
- ✅ `lib/coach-v2.ts` - Updated grounded coach prompt
  - Changed "Stenlake" to "Roger"
  - Updated tone examples to be shorter and more precise
  - Removed excessive emojis, made responses more direct

- ✅ `app/api/chat/route.ts` - Updated streaming system prompt
  - Changed "Stenlake" to "Roger"
  - Updated tone to match new voice

### Internal Identifiers
- ✅ `package.json` - Updated package name
  - "stenlake" → "roger"

- ✅ `README.md` - Updated title and description
  - Title: "# Stenlake" → "# Roger"
  - Description updated to reflect "calm, intelligent running coach"

- ✅ `CONVERSATION_ARCHITECTURE.md` - Updated references
  - Changed "Stenlake" to "Roger" in documentation

## ⚠️ Technical IDs Preserved (Intentionally)

### package-lock.json
- **Status**: Still contains "stenlake" references
- **Reason**: Auto-generated file that will update on next `npm install`
- **Action**: Run `npm install` to regenerate with new package name
- **Safety**: No breaking changes - this is a lockfile only

### Database Schema
- **Status**: No "Stenlake" references found
- **Reason**: Database uses generic identifiers (User, Goal, Activity, etc.)
- **Safety**: No changes needed

### Environment Variables
- **Status**: No "Stenlake" references found
- **Reason**: Uses generic names (DATABASE_URL, STRAVA_CLIENT_ID, etc.)
- **Safety**: No changes needed

### API Routes
- **Status**: No "Stenlake" in route paths
- **Reason**: Routes use generic paths (/api/chat, /dashboard, etc.)
- **Safety**: No breaking changes

### Analytics/Event Names
- **Status**: No analytics implementation found
- **Reason**: Not implemented in current codebase
- **Safety**: N/A

## Tone Updates

All system prompts updated to reflect:
- **Calm**: Removed excessive enthusiasm, made responses more measured
- **Intelligent**: Maintained data-grounded approach
- **Short**: Reduced verbosity, made responses more concise
- **Precise**: Emphasized specific data points over generic statements
- **Grounded**: Maintained focus on actual training data

### Example Changes:
- "Hey! 👋 I'm Stenlake, your running coach. I'm here to help with your training. What can I help you with today?" 
  → "Hey. I'm Roger, your running coach. What can I help with?"

- "Trending up 📈 Your weekly mileage: 28km → 32km → 35km..."
  → "Trending up. Weekly mileage: 28km → 32km → 35km..."

## Verification

- ✅ Build successful: `npm run build` completes without errors
- ✅ No linter errors
- ✅ All user-facing text updated
- ✅ All system prompts updated
- ✅ Package name updated
- ✅ Documentation updated

## Next Steps (Optional)

1. Run `npm install` to regenerate `package-lock.json` with new package name
2. Update any external references (deployment configs, CI/CD, etc.) if applicable
3. Update favicon/logo if separate branding assets exist

## Summary

**Total files updated**: 7
**Technical IDs preserved**: 1 (package-lock.json - auto-regenerated)
**Breaking changes**: None
**Functional changes**: None (tone adjustments only)
