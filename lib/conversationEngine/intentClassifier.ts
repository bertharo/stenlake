/**
 * Intent Classification for Natural Conversation
 * 
 * Lightweight rule-based classifier to understand user intent
 * and adapt response style accordingly.
 */

export type UserIntent =
  | "run_reflection"
  | "training_plan"
  | "performance_analysis"
  | "injury_or_constraint"
  | "motivation_or_vent"
  | "general_question"
  | "greeting"
  | "workout_request";

export interface IntentClassification {
  intent: UserIntent;
  confidence: number;
  context: {
    isQuestion: boolean;
    isVenting: boolean;
    isPlanning: boolean;
    mentionsInjury: boolean;
    mentionsRace: boolean;
    mentionsWorkout: boolean;
  };
}

/**
 * Classify user message intent
 */
export function classifyIntent(message: string): IntentClassification {
  const lower = message.toLowerCase().trim();

  // Context detection
  const isQuestion = /^(what|when|where|why|how|should|can|could|would|will)\s/i.test(lower) || lower.endsWith("?");
  const isVenting = /\b(frustrated|tired|struggling|can't|can not|difficult|hard|stuck|sucks|hate|awful|terrible|disappointed)\b/.test(lower);
  const isPlanning = /\b(plan|schedule|next|upcoming|week|month|should|recommend)\b/.test(lower);
  const mentionsInjury = /\b(injured|injury|hurt|pain|sore|ache|knee|hip|ankle|shin|achilles|plantar|it band|itb)\b/.test(lower);
  const mentionsRace = /\b(race|marathon|half|10k|5k|competition|event)\b/.test(lower);
  const mentionsWorkout = /\b(workout|run|training|session|long run|tempo|interval|easy run|today|tomorrow)\b/.test(lower);

  // Greeting patterns
  if (/^(hi|hello|hey|sup|what's up|howdy)/.test(lower) || lower.length < 5) {
    return {
      intent: "greeting",
      confidence: 0.9,
      context: {
        isQuestion,
        isVenting: false,
        isPlanning: false,
        mentionsInjury,
        mentionsRace,
        mentionsWorkout,
      },
    };
  }

  // Workout request patterns
  if (mentionsWorkout && (/\b(today|tomorrow|next|should|recommend|what|suggest)\b/.test(lower))) {
    return {
      intent: "workout_request",
      confidence: 0.85,
      context: {
        isQuestion,
        isVenting,
        isPlanning,
        mentionsInjury,
        mentionsRace,
        mentionsWorkout: true,
      },
    };
  }

  // Injury or constraint
  if (mentionsInjury || /\b(can't|cannot|unable|restricted|limit|constraint|issue|problem)\b/.test(lower)) {
    return {
      intent: "injury_or_constraint",
      confidence: 0.8,
      context: {
        isQuestion,
        isVenting,
        isPlanning,
        mentionsInjury: true,
        mentionsRace,
        mentionsWorkout,
      },
    };
  }

  // Motivation or venting
  if (isVenting || /\b(motivated|motivation|demotivated|unmotivated|encouragement|support|feel|feeling)\b/.test(lower)) {
    return {
      intent: "motivation_or_vent",
      confidence: 0.75,
      context: {
        isQuestion,
        isVenting: true,
        isPlanning,
        mentionsInjury,
        mentionsRace,
        mentionsWorkout,
      },
    };
  }

  // Training plan
  if (isPlanning && (mentionsRace || /\b(schedule|program|plan|weeks|months|prep|prepare)\b/.test(lower))) {
    return {
      intent: "training_plan",
      confidence: 0.8,
      context: {
        isQuestion,
        isVenting,
        isPlanning: true,
        mentionsInjury,
        mentionsRace,
        mentionsWorkout,
      },
    };
  }

  // Performance analysis
  if (isQuestion && (/\b(how|pace|time|performance|progress|improving|getting better|slower|faster|speed)\b/.test(lower))) {
    return {
      intent: "performance_analysis",
      confidence: 0.75,
      context: {
        isQuestion: true,
        isVenting,
        isPlanning,
        mentionsInjury,
        mentionsRace,
        mentionsWorkout,
      },
    };
  }

  // Run reflection
  if (/\b(run|ran|yesterday|today|this week|last week|felt|felt like|easy|hard|good|bad)\b/.test(lower) && !isPlanning) {
    return {
      intent: "run_reflection",
      confidence: 0.7,
      context: {
        isQuestion,
        isVenting,
        isPlanning: false,
        mentionsInjury,
        mentionsRace,
        mentionsWorkout,
      },
    };
  }

  // General question fallback
  if (isQuestion) {
    return {
      intent: "general_question",
      confidence: 0.6,
      context: {
        isQuestion: true,
        isVenting,
        isPlanning,
        mentionsInjury,
        mentionsRace,
        mentionsWorkout,
      },
    };
  }

  // Default to run reflection if no clear pattern
  return {
    intent: "run_reflection",
    confidence: 0.5,
    context: {
      isQuestion,
      isVenting,
      isPlanning,
      mentionsInjury,
      mentionsRace,
      mentionsWorkout,
    },
  };
}
