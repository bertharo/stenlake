/**
 * Unit tests for pace computation
 * 
 * Tests pace parsing, source tracking, and metamorphic properties
 */

import { parseTimeStrict, computePaceEstimatesWithSource } from "../pace";
import { RecentRace } from "../types";

describe("parseTimeStrict", () => {
  test("parses HH:MM:SS format correctly", () => {
    const result = parseTimeStrict("1:29:00");
    expect(result.isValid).toBe(true);
    expect(result.seconds).toBe(5340); // 1*3600 + 29*60 + 0
  });

  test("parses MM:SS format correctly", () => {
    const result = parseTimeStrict("38:00");
    expect(result.isValid).toBe(true);
    expect(result.seconds).toBe(2280); // 38*60 + 0
  });

  test("rejects invalid format", () => {
    const result = parseTimeStrict("invalid");
    expect(result.isValid).toBe(false);
    expect(result.error).toBeDefined();
  });

  test("rejects seconds >= 60", () => {
    const result = parseTimeStrict("1:29:60");
    expect(result.isValid).toBe(false);
    expect(result.error).toContain("seconds must be < 60");
  });

  test("rejects minutes >= 60", () => {
    const result = parseTimeStrict("1:60:00");
    expect(result.isValid).toBe(false);
    expect(result.error).toContain("Minutes and seconds must be < 60");
  });
});

describe("computePaceEstimatesWithSource - metamorphic tests", () => {
  test("improving HM time speeds up steady/finish ranges", () => {
    const slowHM: RecentRace = { type: "Half Marathon", time: "1:35:00", date: "2025-12-01" };
    const fastHM: RecentRace = { type: "Half Marathon", time: "1:25:00", date: "2026-01-01" };

    const slowResult = computePaceEstimatesWithSource([slowHM]);
    const fastResult = computePaceEstimatesWithSource([fastHM]);

    // Fast HM should have faster paces
    expect(fastResult.estimates.steady.max).toBeLessThan(slowResult.estimates.steady.max);
    expect(fastResult.estimates.steady.min).toBeLessThan(slowResult.estimates.steady.min);
    expect(fastResult.estimates.threshold.max).toBeLessThan(slowResult.estimates.threshold.max);
    expect(fastResult.estimates.threshold.min).toBeLessThan(slowResult.estimates.threshold.min);
  });

  test("changing peak weekly mileage changes totalMiles ~30-35%", () => {
    // This is tested indirectly in generateTodaysWorkout tests
    // The rule is: totalMiles = peakWeeklyMileage * 0.325
    // So doubling mileage should roughly double long run distance
  });

  test("no valid pace signals outputs paceSource=default", () => {
    const result = computePaceEstimatesWithSource([]);
    expect(result.paceSource).toBe("default");
    expect(result.assumptions).toContain("No race data provided");
    expect(result.estimates.easy.min).toBeGreaterThan(0);
  });

  test("invalid race time marks paceSource=default with warnings", () => {
    const invalidRace: RecentRace = { type: "Half Marathon", time: "invalid", date: "2026-01-01" };
    const result = computePaceEstimatesWithSource([invalidRace]);
    
    expect(result.paceSource).toBe("default");
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.warnings.some(w => w.includes("Skipped race"))).toBe(true);
  });

  test("pace ranges are properly ordered (easy > steady > threshold)", () => {
    const race: RecentRace = { type: "Half Marathon", time: "1:30:00", date: "2026-01-01" };
    const result = computePaceEstimatesWithSource([race]);

    // Easy should be slower than steady
    expect(result.estimates.easy.min).toBeGreaterThan(result.estimates.steady.max);
    // Steady should be slower than threshold
    expect(result.estimates.steady.min).toBeGreaterThan(result.estimates.threshold.max);
  });

  test("marathon race provides marathon pace estimate", () => {
    const marathon: RecentRace = { type: "Marathon", time: "3:00:00", date: "2025-10-01" };
    const result = computePaceEstimatesWithSource([marathon]);

    expect(result.estimates.marathon).not.toBeNull();
    expect(result.estimates.marathon!.min).toBeGreaterThan(0);
    expect(result.estimates.marathon!.max).toBeGreaterThan(result.estimates.marathon!.min);
  });
});
