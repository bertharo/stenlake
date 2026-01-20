/**
 * Natural Conversation Engine
 * 
 * Single canonical entry point for conversational coaching.
 */

export { processConversationTurn } from "./engine";
export type { ConversationResponse } from "./engine";
export { classifyIntent } from "./intentClassifier";
export type { IntentClassification, UserIntent } from "./intentClassifier";
export { getMemory, updateMemory, getRelevantMemory } from "./memory";
export type {
  UserProfile,
  RunningContext,
  DerivedBaselines,
  ConversationMemory,
} from "./memory";
export { TOOLS, executeTool } from "./tools";
export type { ToolCall, ToolResult } from "./tools";
export { NATURAL_COACH_SYSTEM_PROMPT } from "./systemPrompt";
export { shapeOutput } from "./outputShaper";
