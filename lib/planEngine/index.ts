/**
 * CANONICAL PLAN ENGINE
 * 
 * This is the ONLY module that generates training plans.
 * All other modules MUST call this module - no other plan generation allowed.
 * 
 * Usage:
 *   import { getTrainingPlan } from './planEngine';
 *   const { plan, validation } = await getTrainingPlan(goal, activities, daysPerWeek, mode);
 */

export { getTrainingPlan } from "./getTrainingPlan";
export { computeRecentFitness } from "./computeRecentFitness";
export { computePaceRanges } from "./computePaceRanges";
export { generate12WeekPlan } from "./generate12WeekPlan";
export { validatePlan } from "./validatePlan";

export type {
  TrainingPlan,
  PlanWeek,
  PlanDay,
  Goal,
  RecentFitness,
  PaceRanges,
} from "./types";

export type { ValidationResult } from "./validatePlan";
