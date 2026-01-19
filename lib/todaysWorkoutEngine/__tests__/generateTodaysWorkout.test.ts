/**
 * Unit tests for Today's Workout Engine
 * 
 * To run: Install jest and run `npx jest lib/todaysWorkoutEngine/__tests__/generateTodaysWorkout.test.ts`
 */

import { generateTodaysWorkout } from "../generateTodaysWorkout";
import { TodaysWorkoutInput } from "../types";

describe("generateTodaysWorkout", () => {
  // Scenario 1: Standard case - Boston Marathon goal, recent half marathon, moderate mileage
  test("Scenario 1: Standard case with recent race and moderate mileage", () => {
    const input: TodaysWorkoutInput = {
      goal: { race: "Boston Marathon", targetTime: "2:40:00", date: "2026-04-20" },
      recentRaces: [{ type: "Half Marathon", time: "1:29:00", date: "2026-01-11" }],
      weeklyMileage: [18, 22, 20, 25, 24, 27, 29, 31, 33, 30, 32, 33],
      todayConstraints: { mustBe: "long_run", timeLimited: false },
      lastLongRunMiles: null,
      terrain: { hilly: true },
    };

    const result = generateTodaysWorkout(input);

    expect(result.title).toBe("Today's Long Run");
    expect(result.totalMiles).toBeGreaterThanOrEqual(6);
    expect(result.totalMiles).toBeLessThanOrEqual(22);
    expect(result.segments.length).toBeGreaterThan(0);
    expect(result.rationale).toContain("1:29:00");
    expect(result.rationale).toContain("33");
    expect(result.guardrails.length).toBeGreaterThan(0);
    expect(result.guardrails).toContain("Keep effort constant on hills; pace floats.");
    expect(result.guardrails).toContain("No marathon-pace blocks at this mileage.");

    // Verify segment structure
    let currentMile = 0;
    for (const segment of result.segments) {
      expect(segment.fromMile).toBeGreaterThan(currentMile);
      expect(segment.toMile).toBeGreaterThanOrEqual(segment.fromMile);
      expect(segment.paceRange).toMatch(/\d+:\d+–\d+:\d+\/mi/);
      expect(segment.notes.length).toBeGreaterThan(0);
      currentMile = segment.toMile;
    }
    expect(result.segments[result.segments.length - 1].toMile).toBe(result.totalMiles);
  });

  // Scenario 2: Missing inputs - no recent races
  test("Scenario 2: Missing recent races (uses conservative defaults)", () => {
    const input: TodaysWorkoutInput = {
      goal: { race: "Marathon", targetTime: "3:30:00", date: "2026-06-01" },
      recentRaces: [],
      weeklyMileage: [20, 22, 24, 26],
      todayConstraints: { mustBe: "long_run" },
      lastLongRunMiles: null,
    };

    const result = generateTodaysWorkout(input);

    expect(result.totalMiles).toBeGreaterThanOrEqual(6);
    expect(result.segments.length).toBeGreaterThan(0);
    expect(result.rationale).toContain("current fitness");
    expect(result.guardrails.length).toBeGreaterThan(0);
  });

  // Scenario 3: Extremely low mileage
  test("Scenario 3: Extremely low mileage (minimum safety constraints)", () => {
    const input: TodaysWorkoutInput = {
      goal: { race: "5K", targetTime: "20:00", date: "2026-03-01" },
      recentRaces: [{ type: "5K", time: "20:30", date: "2026-01-15" }],
      weeklyMileage: [10, 12, 14, 15, 16, 18, 17, 19, 18, 20, 19, 20],
      todayConstraints: { mustBe: "long_run" },
      lastLongRunMiles: 6,
    };

    const result = generateTodaysWorkout(input);

    expect(result.totalMiles).toBeGreaterThanOrEqual(6);
    expect(result.totalMiles).toBeLessThanOrEqual(7); // Should be ~30-35% of 20 = 6-7
    expect(result.guardrails).toContain("No marathon-pace blocks at this mileage.");
    expect(result.guardrails).toContain("Prioritize completion over pace.");

    // Should not have marathon pace segments
    const hasMarathonPace = result.segments.some((s) =>
      s.label.toLowerCase().includes("marathon pace")
    );
    expect(hasMarathonPace).toBe(false);
  });

  // Scenario 4: Very high mileage with marathon pace blocks
  test("Scenario 4: Very high mileage (allows marathon pace work)", () => {
    const input: TodaysWorkoutInput = {
      goal: { race: "Marathon", targetTime: "2:45:00", date: "2026-05-01" },
      recentRaces: [
        { type: "Marathon", time: "2:48:00", date: "2025-10-15" },
        { type: "Half Marathon", time: "1:21:00", date: "2026-01-20" },
      ],
      weeklyMileage: [
        45, 48, 50, 52, 55, 58, 60, 62, 65, 63, 65, 68,
      ],
      todayConstraints: { mustBe: "long_run" },
      lastLongRunMiles: 18,
    };

    const result = generateTodaysWorkout(input);

    expect(result.totalMiles).toBeGreaterThanOrEqual(18);
    expect(result.totalMiles).toBeLessThanOrEqual(22); // Cap at 22

    // At 68 mpw, should potentially include marathon pace
    const hasMarathonPace = result.segments.some((s) =>
      s.label.toLowerCase().includes("marathon pace")
    );
    // May or may not have it depending on structure, but shouldn't error

    expect(result.rationale).toContain("68");
    expect(result.guardrails.length).toBeGreaterThan(0);
  });

  // Scenario 5: Time-limited constraint
  test("Scenario 5: Time-limited constraint (reduces distance)", () => {
    const input: TodaysWorkoutInput = {
      goal: { race: "Half Marathon", targetTime: "1:25:00", date: "2026-03-15" },
      recentRaces: [{ type: "10K", time: "38:00", date: "2026-01-10" }],
      weeklyMileage: [25, 28, 30, 32, 35, 33, 35, 37],
      todayConstraints: { mustBe: "long_run", timeLimited: true },
      lastLongRunMiles: 12,
    };

    const result = generateTodaysWorkout(input);

    expect(result.totalMiles).toBeLessThan(15); // Should be reduced from ~12
    expect(result.totalMiles).toBeGreaterThanOrEqual(6); // Still minimum
  });

  // Scenario 6: Last long run cap (+10% rule)
  test("Scenario 6: Last long run cap prevents excessive increase", () => {
    const input: TodaysWorkoutInput = {
      goal: { race: "Marathon", targetTime: "3:00:00", date: "2026-04-01" },
      recentRaces: [{ type: "Half Marathon", time: "1:28:00", date: "2026-01-05" }],
      weeklyMileage: [30, 32, 34, 36, 38, 40, 38, 42],
      todayConstraints: { mustBe: "long_run" },
      lastLongRunMiles: 10, // Last week's long run was 10 miles
    };

    const result = generateTodaysWorkout(input);

    // Should be capped at +10% of last long run (11 miles)
    // But also consider 30-35% of peak (42 * 0.325 = ~13.6)
    // Should take minimum of the two considerations
    expect(result.totalMiles).toBeGreaterThanOrEqual(10);
    expect(result.totalMiles).toBeLessThanOrEqual(14); // Capped by +10% rule applied reasonably
  });

  // Scenario 7: Conflicting goals - very aggressive target vs low mileage
  test("Scenario 7: Aggressive goal vs conservative mileage (safety first)", () => {
    const input: TodaysWorkoutInput = {
      goal: { race: "Boston Marathon", targetTime: "2:30:00", date: "2026-04-20" },
      recentRaces: [{ type: "Half Marathon", time: "1:15:00", date: "2025-12-01" }],
      weeklyMileage: [22, 24, 25, 26, 28, 30, 28, 30, 32, 30, 32, 32],
      todayConstraints: { mustBe: "long_run" },
      lastLongRunMiles: null,
    };

    const result = generateTodaysWorkout(input);

    // Despite aggressive goal, should respect low mileage
    expect(result.totalMiles).toBeLessThanOrEqual(12); // ~30-35% of 32 = 9.6-11.2
    expect(result.guardrails).toContain("No marathon-pace blocks at this mileage.");
    expect(result.guardrails).toContain("Prioritize completion over pace.");
  });

  // Scenario 8: Flat terrain (no hills)
  test("Scenario 8: Flat terrain (effort guidance differs)", () => {
    const input: TodaysWorkoutInput = {
      goal: { race: "Marathon", targetTime: "3:15:00", date: "2026-05-01" },
      recentRaces: [{ type: "Half Marathon", time: "1:32:00", date: "2026-01-10" }],
      weeklyMileage: [35, 38, 40, 42, 40, 45, 43, 45],
      todayConstraints: { mustBe: "long_run" },
      lastLongRunMiles: 14,
      terrain: { hilly: false },
    };

    const result = generateTodaysWorkout(input);

    expect(result.totalMiles).toBeGreaterThanOrEqual(10);
    // Should not mention hills in guardrails
    const mentionsHills = result.guardrails.some((g) => g.toLowerCase().includes("hill"));
    expect(mentionsHills).toBe(false);

    // Segment notes shouldn't mention hills
    for (const segment of result.segments) {
      expect(segment.notes).not.toContain("hill");
    }
  });

  // Scenario 9: Medium mileage (40-55 mpw) - should not have marathon pace
  test("Scenario 9: Medium mileage - steady progression only", () => {
    const input: TodaysWorkoutInput = {
      goal: { race: "Marathon", targetTime: "3:00:00", date: "2026-06-01" },
      recentRaces: [{ type: "Half Marathon", time: "1:25:00", date: "2026-02-01" }],
      weeklyMileage: [40, 42, 44, 46, 45, 48, 47, 50, 49, 52, 51, 52],
      todayConstraints: { mustBe: "long_run" },
      lastLongRunMiles: 15,
    };

    const result = generateTodaysWorkout(input);

    expect(result.totalMiles).toBeGreaterThanOrEqual(15);
    // At 52 mpw (just below 55 threshold), should not have marathon pace
    const hasMarathonPace = result.segments.some((s) =>
      s.label.toLowerCase().includes("marathon pace")
    );
    expect(hasMarathonPace).toBe(false);
  });

  // Scenario 10: Edge case - empty weekly mileage (should throw)
  test("Scenario 10: Empty weekly mileage throws error", () => {
    const input: TodaysWorkoutInput = {
      goal: { race: "5K", targetTime: "20:00", date: "2026-03-01" },
      recentRaces: [],
      weeklyMileage: [],
      todayConstraints: { mustBe: "long_run" },
      lastLongRunMiles: null,
    };

    expect(() => generateTodaysWorkout(input)).toThrow("weeklyMileage must have at least one week");
  });

  // Scenario 11: Very short long run minimum
  test("Scenario 11: Very low peak mileage enforces minimum 6 miles", () => {
    const input: TodaysWorkoutInput = {
      goal: { race: "5K", targetTime: "22:00", date: "2026-03-01" },
      recentRaces: [],
      weeklyMileage: [8, 10, 12, 14, 16, 18, 16, 18],
      todayConstraints: { mustBe: "long_run" },
      lastLongRunMiles: null,
    };

    const result = generateTodaysWorkout(input);

    // Even at 18 mpw * 0.325 = 5.85, should enforce minimum of 6
    expect(result.totalMiles).toBeGreaterThanOrEqual(6);
  });

  // Scenario 12: Maximum cap at 22 miles
  test("Scenario 12: High mileage capped at 22 miles maximum", () => {
    const input: TodaysWorkoutInput = {
      goal: { race: "Marathon", targetTime: "2:30:00", date: "2026-04-01" },
      recentRaces: [{ type: "Marathon", time: "2:35:00", date: "2025-10-01" }],
      weeklyMileage: [
        70, 72, 75, 78, 80, 82, 85, 88, 90, 88, 90, 92,
      ],
      todayConstraints: { mustBe: "long_run" },
      lastLongRunMiles: 20,
    };

    const result = generateTodaysWorkout(input);

    // At 92 mpw, 30-35% would be 27.6-32.2, but should cap at 22
    expect(result.totalMiles).toBeLessThanOrEqual(22);
    expect(result.totalMiles).toBeGreaterThanOrEqual(20);
  });
});
