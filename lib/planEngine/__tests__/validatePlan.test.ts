/**
 * Unit tests for plan validator
 * 
 * Tests pace ordering, identical detection, and constraints
 */

import { validatePlan } from "../validatePlan";
import { TrainingPlan, PlanDay, PlanWeek } from "../types";

describe("validatePlan", () => {
  test("detects >2 run days with identical miles AND paceRange", () => {
    const invalidPlan: TrainingPlan = {
      status: "ready",
      meta: {
        provenance: "test",
        fingerprint: "test",
        generatedAt: new Date().toISOString(),
        assumptions: [],
        paceSource: "strava",
        rulesFired: [],
        fitnessSummary: {
          avgWeeklyMiles: 30,
          maxWeeklyMiles: 35,
          longRunMiles: 10,
          lastRunDate: null,
        },
      },
      weeks: [
        {
          weekNumber: 1,
          totalMiles: 15,
          days: [
            { date: new Date(), type: "easy", miles: 5.0, paceRange: [480, 540] },
            { date: new Date(), type: "easy", miles: 5.0, paceRange: [480, 540] },
            { date: new Date(), type: "easy", miles: 5.0, paceRange: [480, 540] },
          ],
        },
      ],
    };

    const result = validatePlan(invalidPlan);
    expect(result.isValid).toBe(false);
    expect(result.errors.some(e => e.includes("identical miles"))).toBe(true);
  });

  test("allows identical paces if miles differ", () => {
    const validPlan: TrainingPlan = {
      status: "ready",
      meta: {
        provenance: "test",
        fingerprint: "test",
        generatedAt: new Date().toISOString(),
        assumptions: [],
        paceSource: "strava",
        rulesFired: [],
        fitnessSummary: {
          avgWeeklyMiles: 30,
          maxWeeklyMiles: 35,
          longRunMiles: 10,
          lastRunDate: null,
        },
      },
      weeks: [
        {
          weekNumber: 1,
          totalMiles: 15,
          days: [
            { date: new Date(), type: "easy", miles: 4.0, paceRange: [480, 540] },
            { date: new Date(), type: "easy", miles: 5.0, paceRange: [480, 540] },
            { date: new Date(), type: "easy", miles: 6.0, paceRange: [480, 540] },
          ],
        },
      ],
    };

    const result = validatePlan(validPlan);
    // Should pass - different miles even if same pace
    expect(result.errors.filter(e => e.includes("identical")).length).toBe(0);
  });

  test("validates weekly totals match sum of days", () => {
    const invalidPlan: TrainingPlan = {
      status: "ready",
      meta: {
        provenance: "test",
        fingerprint: "test",
        generatedAt: new Date().toISOString(),
        assumptions: [],
        paceSource: "strava",
        rulesFired: [],
        fitnessSummary: {
          avgWeeklyMiles: 30,
          maxWeeklyMiles: 35,
          longRunMiles: 10,
          lastRunDate: null,
        },
      },
      weeks: [
        {
          weekNumber: 1,
          totalMiles: 20, // Incorrect - days sum to 15
          days: [
            { date: new Date(), type: "easy", miles: 5.0 },
            { date: new Date(), type: "easy", miles: 5.0 },
            { date: new Date(), type: "easy", miles: 5.0 },
          ],
        },
      ],
    };

    const result = validatePlan(invalidPlan);
    expect(result.isValid).toBe(false);
    expect(result.errors.some(e => e.includes("Total miles") && e.includes("doesn't match"))).toBe(true);
  });

  test("validates run days have miles >= 2.0", () => {
    const invalidPlan: TrainingPlan = {
      status: "ready",
      meta: {
        provenance: "test",
        fingerprint: "test",
        generatedAt: new Date().toISOString(),
        assumptions: [],
        paceSource: "strava",
        rulesFired: [],
        fitnessSummary: {
          avgWeeklyMiles: 30,
          maxWeeklyMiles: 35,
          longRunMiles: 10,
          lastRunDate: null,
        },
      },
      weeks: [
        {
          weekNumber: 1,
          totalMiles: 3,
          days: [
            { date: new Date(), type: "easy", miles: 1.5 }, // Too short
            { date: new Date(), type: "easy", miles: 1.5 },
          ],
        },
      ],
    };

    const result = validatePlan(invalidPlan);
    expect(result.isValid).toBe(false);
    expect(result.errors.some(e => e.includes("miles < 2.0"))).toBe(true);
  });

  test("validates non-taper weeks have >=1 long and >=1 quality", () => {
    const invalidPlan: TrainingPlan = {
      status: "ready",
      meta: {
        provenance: "test",
        fingerprint: "test",
        generatedAt: new Date().toISOString(),
        assumptions: [],
        paceSource: "strava",
        rulesFired: [],
        fitnessSummary: {
          avgWeeklyMiles: 30,
          maxWeeklyMiles: 35,
          longRunMiles: 10,
          lastRunDate: null,
        },
      },
      weeks: [
        {
          weekNumber: 1, // Non-taper week
          totalMiles: 10,
          days: [
            { date: new Date(), type: "easy", miles: 5.0 },
            { date: new Date(), type: "easy", miles: 5.0 },
            // Missing long run and quality session
          ],
        },
      ],
    };

    const result = validatePlan(invalidPlan);
    expect(result.isValid).toBe(false);
    expect(result.errors.some(e => e.includes("Missing long run"))).toBe(true);
    expect(result.errors.some(e => e.includes("Missing quality session"))).toBe(true);
  });

  test("allows taper weeks (10-12) without long/quality requirement", () => {
    const validPlan: TrainingPlan = {
      status: "ready",
      meta: {
        provenance: "test",
        fingerprint: "test",
        generatedAt: new Date().toISOString(),
        assumptions: [],
        paceSource: "strava",
        rulesFired: [],
        fitnessSummary: {
          avgWeeklyMiles: 30,
          maxWeeklyMiles: 35,
          longRunMiles: 10,
          lastRunDate: null,
        },
      },
      weeks: [
        {
          weekNumber: 11, // Taper week
          totalMiles: 10,
          days: [
            { date: new Date(), type: "easy", miles: 3.0 },
            { date: new Date(), type: "easy", miles: 3.0 },
            { date: new Date(), type: "easy", miles: 4.0 },
            // No long run or quality - OK for taper
          ],
        },
      ],
    };

    const result = validatePlan(validPlan);
    // Should not error for missing long/quality in taper weeks
    expect(result.errors.filter(e => e.includes("Missing long run") || e.includes("Missing quality")).length).toBe(0);
  });
});
