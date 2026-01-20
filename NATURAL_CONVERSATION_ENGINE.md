# Natural Conversation Engine

## Overview

A natural, continuous conversational coaching system that feels like a thoughtful human coach who remembers context, reacts appropriately to different intents, and grounds responses in real user data.

## Architecture

### Core Components

```
lib/conversationEngine/
├── index.ts              - Single canonical entry point
├── engine.ts             - Main conversation processing with agent loop
├── intentClassifier.ts   - Lightweight intent classification
├── memory.ts             - Structured memory management
├── tools.ts              - Tool definitions and execution
├── systemPrompt.ts       - Natural coach system prompt
└── outputShaper.ts       - Post-processing for natural responses
```

### Database Models

- **Conversation**: Persistent conversation sessions (one per user, auto-created)
- **ConversationMessage**: Messages in conversations with tool calls/results
- **ConversationMemory**: Structured memory (profile, context, baselines) separate from chat history

### Key Features

1. **Persistent Conversation IDs**: Each user has an active conversation (auto-created, persists for 24 hours)
2. **Intent Classification**: Rule-based classifier identifies user intent (run_reflection, training_plan, performance_analysis, etc.)
3. **Structured Memory**: Separate memory objects (profile, context, baselines) independent from chat history
4. **Tool-First Data Access**: Agent loop with tools (get_recent_strava_runs, get_training_load, get_upcoming_race, update_memory)
5. **Output Shaping**: Post-processing removes AI artifacts, enforces concise structure, ensures natural cadence

## System Prompt

The system prompt enforces:
- Natural, conversational tone
- Never restate user's message
- Never say "as an AI"
- Never list obvious steps
- React differently to venting vs analysis vs planning
- Ask at most ONE question, then proceed
- Keep responses concise (120-150 words unless asked for more)

## Intent Classification

Classifies user messages into:
- `run_reflection`: User reflecting on a run
- `training_plan`: User asking about training plans
- `performance_analysis`: User analyzing performance
- `injury_or_constraint`: User mentioning injury/constraints
- `motivation_or_vent`: User venting or needing motivation
- `general_question`: General questions
- `greeting`: Greetings
- `workout_request`: Requests for workout recommendations

## Memory Structure

### UserProfile
- `goal_race`: Race name/distance
- `goal_time`: Target time
- `preferred_feedback_style`: "direct" | "supportive" | "analytical"
- `injury_notes`: Optional injury history

### RunningContext
- `current_week`: Current training week
- `fatigue_flag`: Fatigue risk indicator
- `last_key_workout`: Date of last key workout
- `weekly_mileage_trend`: "up" | "down" | "stable"

### DerivedBaselines
- `easy_pace_range`: Easy pace range string
- `threshold_pace`: Threshold pace string
- `marathon_pace`: Marathon pace (optional)
- `weekly_mileage_avg`: Average weekly mileage

## Tools

### get_recent_strava_runs(days)
Returns formatted summaries of recent runs.

### get_training_load()
Returns current training load metrics (weekly mileage, fatigue signals, intensity distribution).

### get_upcoming_race()
Returns upcoming race goal details.

### update_memory(key, value)
Updates structured memory (profile, context, or baselines).

## Agent Loop

1. Classify user intent
2. Get relevant memory for intent
3. Build conversation history (last 20 messages)
4. Call OpenAI with tools enabled
5. If tool calls are made:
   - Execute tools
   - Add tool results to conversation
   - Continue loop to get final response
6. Shape output for natural conversation
7. Save assistant message
8. Update conversation timestamp

## API Endpoint

**POST /api/chat**
- Accepts: `{ message: string, stream?: boolean }`
- Returns: `{ message: string, conversationId: string, intent: UserIntent, toolCalls?: Array }`

## Usage

```typescript
import { processConversationTurn } from "@/lib/conversationEngine";

const response = await processConversationTurn(
  userId,
  userMessage,
  openai
);
```

## Definition of Success

The user should feel:
- "it remembers me"
- "it knows what I'm training for"
- "it reacts like a human, not a script"
- "it doesn't ask dumb follow-ups"

If a response sounds like customer support, it needs to be rewritten.
