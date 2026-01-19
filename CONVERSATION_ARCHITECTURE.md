# Conversation Architecture

## Overview

Production-quality conversational layer for Stenlake running coach that provides ChatGPT-like experience with grounded, data-referenced coaching.

## Architecture

### A) File Structure & Responsibilities

```
lib/
  conversation.ts      - Context preparation, data selection, formatting
  coach-v2.ts          - Grounded coach prompt & response generation
  training.ts          - Training signals computation (existing)
  actions.ts           - Database operations (existing)

app/api/chat/
  route.ts             - Streaming chat API endpoint

app/dashboard/
  chat-window.tsx      - Client chat UI with streaming support
```

### B) Data Model

#### ConversationState
Tracks user preferences and constraints:
- Goal (race distance, target time, race date)
- Distance unit (km/mi)
- Weekly availability
- Injury history
- Preferences (workout types, time of day)

#### StravaRunSummary
Compact representation of a run:
- Date, distance, time, pace (formatted)
- Heart rate, elevation, cadence
- Intensity classification (easy/moderate/hard)
- Days ago, date label ("Today", "Yesterday", "3 days ago")

#### PreparedContext
Optimized context for token efficiency:
- Goal summary with days until race
- Weekly mileage (last 4 weeks) with trend
- Last week stats (total, average, run count)
- Selected runs (top 3 most relevant)
- Plan summary (next run, weekly total)
- Intensity distribution
- Fatigue signals
- Recent conversation (last 5 messages)

### C) Context Preparation Strategy

**Smart Run Selection** (`selectRelevantRuns`):
1. Most recent run (always included)
2. Longest run (if not already selected)
3. Hardest workout (fastest pace, if not already selected)
4. Fill remaining slots with most recent

**Token Optimization**:
- Only include top 3 runs (not all 30)
- Use formatted strings (not raw data)
- Aggregate weekly stats (not daily)
- Summarize plan (not full item list)
- Last 5 messages only (not full history)

### D) Coach Prompt Strategy

**Core Principles**:
1. **Data-first**: Every response MUST reference at least ONE concrete data point
2. **Concise & scannable**: Bullets, short paragraphs, mobile-first
3. **Proactive**: Ask 1-2 sharp questions when helpful, otherwise act
4. **Continuity**: Reference previous conversation turns
5. **Coach voice**: Direct but supportive

**Response Format** (JSON):
```typescript
{
  message: string;              // Markdown-formatted response
  suggestedActions?: Array<{    // Action buttons
    label: string;
    action: string;
    type: "button" | "link";
  }>;
  confidence: number;            // 0-1
  needsClarification: boolean;
  dataPointsCited: string[];    // Track citations
  nextRunRecommendation?: {     // Optional specific recommendation
    type: string;
    distanceFormatted: string;
    paceFormatted: string;
    notes: string;
  };
}
```

### E) API Route: `/api/chat`

**POST /api/chat**
- Accepts: `{ message: string, stream?: boolean }`
- Returns: `CoachResponse` (non-streaming) or SSE stream (streaming)

**Flow**:
1. Save user message to DB
2. Load context (goal, activities, plan, recent messages)
3. Compute training signals
4. Prepare optimized context
5. Generate response (OpenAI or stub)
6. Save assistant message to DB
7. Return response

**Streaming Support**:
- Uses OpenAI streaming API
- Returns SSE (Server-Sent Events)
- Saves complete message to DB after stream completes

### F) Client Implementation

**Chat Window** (`chat-window.tsx`):
- Optimistic updates for immediate feedback
- Reloads messages after send to get real IDs
- Renders markdown (bold, bullets)
- Displays suggested action buttons
- Handles recommendations (existing)

**Message Format**:
- Supports markdown rendering (bold, bullets)
- Shows suggested actions as clickable buttons
- Maintains conversation continuity

## Memory Design

### Short-term Memory
- Last 5 messages in conversation history
- Included in every API call
- Maintains context across turns

### Long-term Memory
- All messages stored in `CoachMessage` table
- Indexed by `userId` and `createdAt`
- Retrieved for context preparation

### Context Summarization
- Weekly mileage aggregated (not daily)
- Top 3 runs selected (not all runs)
- Plan summarized (next run + weekly total)
- Intensity distribution aggregated

## Coaching Behavior Spec

### Non-negotiables

1. **Data Citation**: Every answer must reference at least ONE concrete data point when Strava data exists
   - ✅ "Your run on 3/15 was 8.5km at 5:12/km"
   - ❌ "Based on your training pattern..." (too vague)

2. **Missing Info Handling**: If missing key info (injury, race date, availability):
   - Ask at most 2 questions
   - Then propose default plan with assumptions stated

3. **Response Structure**:
   - Quick summary of what was noticed
   - Recommendation for next run
   - 7-day microplan (if relevant)
   - Optional "why" explanation

4. **No Hallucination**: Only use data provided in context objects. Never invent runs or stats.

## Testing

See `lib/conversation-tests.md` for:
- 8 test scenarios with mock data
- Expected "non-generic" outputs
- Failure mode handling (no Strava data)
- Continuity tests

## Constraints

- **Token Efficiency**: Do not dump all runs into prompt. Use summarization + selection.
- **Mobile-First**: Replies scannable, concise, with clear structure.
- **Streaming**: Optional but supported for better UX.
- **Fallback**: Stub responses when OpenAI unavailable.

## Next Steps

1. ✅ Core architecture implemented
2. ✅ Context preparation with smart selection
3. ✅ Grounded coach prompt
4. ✅ API route with streaming support
5. ✅ Client integration
6. ⏳ Add streaming UI (optional enhancement)
7. ⏳ Store suggestedActions in DB (future enhancement)
8. ⏳ Add conversation state persistence (future enhancement)
