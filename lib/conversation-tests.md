# Conversation Tests

## Test 1: Greeting with Training Data
**User:** "hi"
**Context:** 
- Last run: 8.5km yesterday at 5:12/km, HR 145bpm
- Weekly mileage: 28km → 32km → 35km (trending up)
- Goal: Marathon in 8 weeks

**Expected Response:**
- Friendly greeting
- References specific data: "I see you ran 8.5km yesterday at 5:12/km"
- Asks 1-2 follow-up questions
- Suggested actions: "What's my next run?", "How's my training?"

**Non-generic check:** Must mention "8.5km", "yesterday", or "5:12/km"

---

## Test 2: Next Run Request
**User:** "what should my next run be?"
**Context:**
- Last week: 32km total, 4 runs
- Last run: 5km easy at 5:30/km (2 days ago)
- Plan: Has a scheduled tempo run tomorrow

**Expected Response:**
- References last week data: "Based on your last week (32km total, 4 runs)"
- Specific recommendation: "5km easy run at 5:30/km pace"
- Reasoning tied to data
- Suggested action: "Add to plan"

**Non-generic check:** Must cite "32km", "4 runs", or specific pace

---

## Test 3: Training Status Check
**User:** "how's my training going?"
**Context:**
- Weekly mileage: 28km → 32km → 35km (last 3 weeks)
- Intensity: 60% easy, 25% moderate, 15% hard
- Long run: 12km last Sunday
- Goal: Marathon in 8 weeks

**Expected Response:**
- Trend analysis: "Trending up 📈"
- Specific numbers: "28km → 32km → 35km"
- Intensity breakdown
- Long run mention: "12km last Sunday"
- Timeline context: "8 weeks away"
- Suggested action: "View 7-day plan"

**Non-generic check:** Must include at least 3 specific data points

---

## Test 4: Injury/Pain Mention
**User:** "my knee hurts"
**Context:**
- Last run: 10km yesterday
- Weekly mileage: 40km
- Fatigue risk: HIGH

**Expected Response:**
- Conservative approach
- References recent training: "You ran 10km yesterday"
- Recommendation: Rest, reduce load
- Suggests professional care if persists
- Suggested action: "Adjust plan for rest"

**Non-generic check:** Must reference "10km yesterday" or "40km/week"

---

## Test 5: No Strava Data (Failure Mode)
**User:** "what should I run?"
**Context:**
- No activities
- No goal set
- No plan

**Expected Response:**
- Graceful handling
- Asks clarifying questions (max 2)
- Suggests: "Connect Strava" or "Set a goal"
- Doesn't hallucinate data
- Suggested actions: "Connect Strava", "Set a goal"

**Non-generic check:** Must NOT mention any fake runs or data

---

## Test 6: Specific Run Question
**User:** "how was my run on Tuesday?"
**Context:**
- Tuesday run: 12km long run at 5:45/km, HR 150bpm, +200m elevation

**Expected Response:**
- References exact run: "Your Tuesday run was 12km at 5:45/km"
- Mentions HR: "150bpm average"
- Mentions elevation: "+200m elevation gain"
- Analysis: "Solid long run pace"
- Suggested action: "View all runs"

**Non-generic check:** Must cite "12km", "5:45/km", "Tuesday", "150bpm", or "+200m"

---

## Test 7: Goal-Based Question
**User:** "am I on track for my marathon?"
**Context:**
- Goal: Marathon in 8 weeks, target 3:30
- Current weekly mileage: 45km
- Recommended: 50-60km/week for 3:30 marathon
- Long run: 18km last week

**Expected Response:**
- References goal: "Your marathon is 8 weeks away, target 3:30"
- Current status: "You're at 45km/week"
- Gap analysis: "Recommended 50-60km/week"
- Long run context: "Your 18km long run last week"
- Actionable: "Increase weekly volume by 10-15km"
- Suggested action: "Generate training plan"

**Non-generic check:** Must include "8 weeks", "3:30", "45km/week", "50-60km", or "18km"

---

## Test 8: Continuity Test
**User:** "hi"
**Assistant:** "Hey! I see you ran 8.5km yesterday. How are you feeling?"

**User:** "good, what should I run today?"
**Context:** Same as Test 1

**Expected Response:**
- References previous conversation: "Since you're feeling good after yesterday's 8.5km run"
- Specific recommendation based on yesterday's run
- Maintains context from "hi" message

**Non-generic check:** Must reference "yesterday's 8.5km run" or previous context

---

## Implementation Notes

1. **Data Citation Tracking**: The `dataPointsCited` array should contain at least one entry for every response when data exists.

2. **Confidence Score**: 
   - 0.9+ when multiple data points cited
   - 0.7-0.8 when limited data
   - 0.5-0.6 when no data or needs clarification

3. **Suggested Actions**: Should be contextual and actionable. Max 3 buttons per response.

4. **Mobile-First**: Responses should be scannable with bullets, short paragraphs, clear structure.

5. **Coach Voice**: Direct, supportive, data-grounded. Not overly friendly or generic.
