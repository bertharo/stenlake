/**
 * Pace computation helpers
 * 
 * Converts race times to training pace ranges.
 */

import { RecentRace } from "./types";

/**
 * Parse time string with strict error handling
 * 
 * Supported formats:
 * - "1:29:00" (HH:MM:SS)
 * - "89:00" (MM:SS)
 * - "38:00" (MM:SS)
 * 
 * Returns parsed seconds and validation status
 */
export interface ParseTimeResult {
  seconds: number;
  isValid: boolean;
  error?: string;
}

export function parseTimeStrict(timeStr: string): ParseTimeResult {
  // Validate format
  if (!/^\d{1,2}:\d{2}(:\d{2})?$/.test(timeStr.trim())) {
    return {
      seconds: 0,
      isValid: false,
      error: `Invalid time format: ${timeStr}. Expected MM:SS or HH:MM:SS`,
    };
  }

  const parts = timeStr.trim().split(":").map((p) => {
    const num = Number(p);
    if (isNaN(num) || num < 0) {
      return null;
    }
    return num;
  });

  if (parts.some((p) => p === null)) {
    return {
      seconds: 0,
      isValid: false,
      error: `Invalid time format: ${timeStr}. Contains non-numeric values`,
    };
  }

  if (parts.length === 2) {
    // MM:SS format
    const [minutes, seconds] = parts as number[];
    if (seconds >= 60) {
      return {
        seconds: 0,
        isValid: false,
        error: `Invalid time format: ${timeStr}. Seconds must be < 60`,
      };
    }
    return {
      seconds: minutes * 60 + seconds,
      isValid: true,
    };
  } else if (parts.length === 3) {
    // HH:MM:SS format
    const [hours, minutes, seconds] = parts as number[];
    if (minutes >= 60 || seconds >= 60) {
      return {
        seconds: 0,
        isValid: false,
        error: `Invalid time format: ${timeStr}. Minutes and seconds must be < 60`,
      };
    }
    return {
      seconds: hours * 3600 + minutes * 60 + seconds,
      isValid: true,
    };
  }

  return {
    seconds: 0,
    isValid: false,
    error: `Invalid time format: ${timeStr}. Expected MM:SS or HH:MM:SS`,
  };
}

/**
 * Parse time string (e.g., "1:29:00") to total seconds
 * @deprecated Use parseTimeStrict for better error handling
 */
export function parseTime(timeStr: string): number {
  const result = parseTimeStrict(timeStr);
  if (!result.isValid) {
    throw new Error(result.error || `Invalid time format: ${timeStr}`);
  }
  return result.seconds;
}

/**
 * Format seconds per mile to pace string (e.g., "7:45/mi")
 */
export function formatPace(secPerMile: number): string {
  const minutes = Math.floor(secPerMile / 60);
  const seconds = Math.floor(secPerMile % 60);
  return `${minutes}:${String(seconds).padStart(2, "0")}/mi`;
}

/**
 * Format pace range (e.g., "7:45–8:15/mi")
 */
export function formatPaceRange(minSecPerMile: number, maxSecPerMile: number): string {
  return `${formatPace(minSecPerMile)}–${formatPace(maxSecPerMile)}`;
}

/**
 * Get race distance in miles
 */
function getRaceDistanceMiles(raceType: RecentRace["type"]): number {
  switch (raceType) {
    case "5K":
      return 3.10686;
    case "10K":
      return 6.21371;
    case "Half Marathon":
      return 13.109375;
    case "Marathon":
      return 26.21875;
  }
}

/**
 * Estimate pace ranges from recent race performance
 */
export interface PaceEstimates {
  easy: { min: number; max: number }; // seconds per mile
  steady: { min: number; max: number };
  threshold: { min: number; max: number };
  marathon: { min: number; max: number } | null; // null if no marathon data
}

/**
 * Pace computation result with source tracking
 */
export interface PaceComputationResult {
  estimates: PaceEstimates;
  paceSource: "race" | "goal" | "default";
  warnings: string[];
  assumptions: string[];
}

/**
 * Compute pace estimates from recent race results
 * 
 * Uses best recent race to estimate training paces:
 * - Easy: 20-30% slower than threshold pace
 * - Steady: 8-15% slower than threshold pace (comfortably hard)
 * - Threshold: Based on half marathon pace (close to HM pace)
 * - Marathon: Only if we have marathon data
 * 
 * Returns estimates with paceSource tracking for provenance
 */
export function computePaceEstimates(recentRaces: RecentRace[]): PaceEstimates {
  return computePaceEstimatesWithSource(recentRaces).estimates;
}

/**
 * Compute pace estimates with source tracking and debug info
 */
export function computePaceEstimatesWithSource(recentRaces: RecentRace[]): PaceComputationResult {
  const warnings: string[] = [];
  const assumptions: string[] = [];

  if (recentRaces.length === 0) {
    // Conservative defaults if no race data
    assumptions.push("No race data provided - using conservative defaults");
    return {
      estimates: {
        easy: { min: 8 * 60 + 0, max: 9 * 60 + 0 }, // 8:00-9:00/mi
        steady: { min: 7 * 60 + 15, max: 7 * 60 + 45 }, // 7:15-7:45/mi
        threshold: { min: 6 * 60 + 45, max: 7 * 60 + 15 }, // 6:45-7:15/mi
        marathon: null,
      },
      paceSource: "default",
      warnings,
      assumptions,
    };
  }

  // Parse all race times with strict validation
  const validRaces: Array<{ race: RecentRace; paceSecPerMile: number }> = [];
  
  for (const race of recentRaces) {
    const parseResult = parseTimeStrict(race.time);
    if (!parseResult.isValid) {
      warnings.push(`Skipped race ${race.type} (${race.date}): ${parseResult.error}`);
      continue;
    }

    const distanceMiles = getRaceDistanceMiles(race.type);
    const timeSeconds = parseResult.seconds;
    const paceSecPerMile = timeSeconds / distanceMiles;
    
    // Validate pace is reasonable (3:00/mi to 20:00/mi)
    if (paceSecPerMile < 180 || paceSecPerMile > 1200) {
      warnings.push(`Race ${race.type} (${race.date}) has unusual pace ${formatPace(paceSecPerMile)} - may be incorrect`);
    }
    
    validRaces.push({ race, paceSecPerMile });
  }

  if (validRaces.length === 0) {
    assumptions.push("No valid race data after parsing - using conservative defaults");
    return {
      estimates: {
        easy: { min: 8 * 60 + 0, max: 9 * 60 + 0 },
        steady: { min: 7 * 60 + 15, max: 7 * 60 + 45 },
        threshold: { min: 6 * 60 + 45, max: 7 * 60 + 15 },
        marathon: null,
      },
      paceSource: "default",
      warnings,
      assumptions,
    };
  }

  // Use best recent race (fastest pace)
  let bestPaceSecPerMile = Infinity;
  let marathonPaceSecPerMile: number | null = null;

  for (const { race, paceSecPerMile } of validRaces) {
    if (paceSecPerMile < bestPaceSecPerMile) {
      bestPaceSecPerMile = paceSecPerMile;
    }

    if (race.type === "Marathon") {
      marathonPaceSecPerMile = paceSecPerMile;
    }
  }

  // Use half marathon as proxy for threshold if available
  let thresholdBase = bestPaceSecPerMile;
  const halfMarathon = validRaces.find((r) => r.race.type === "Half Marathon");
  if (halfMarathon) {
    thresholdBase = halfMarathon.paceSecPerMile;
    assumptions.push(`Using half marathon pace (${formatPace(thresholdBase)}) as threshold base`);
  } else {
    assumptions.push(`Using best race pace (${formatPace(thresholdBase)}) as threshold base`);
  }

  // Threshold: very close to HM pace (±2%)
  const thresholdMin = thresholdBase * 0.98;
  const thresholdMax = thresholdBase * 1.02;

  // Steady: 8-15% slower than threshold (comfortably hard, not threshold)
  const steadyMin = thresholdBase * 1.08;
  const steadyMax = thresholdBase * 1.15;

  // Easy: 20-30% slower than threshold
  const easyMin = thresholdBase * 1.20;
  const easyMax = thresholdBase * 1.30;

  // Validate ordering: easy must be slower than steady, steady slower than threshold
  if (easyMin <= steadyMax) {
    warnings.push("Easy pace range overlaps with steady - clamping easy pace");
    const adjustedEasyMax = steadyMax * 1.05;
    const adjustedEasyMin = adjustedEasyMax * 1.05;
    return {
      estimates: {
        easy: { min: adjustedEasyMin, max: adjustedEasyMax },
        steady: { min: steadyMin, max: steadyMax },
        threshold: { min: thresholdMin, max: thresholdMax },
        marathon: marathonPaceSecPerMile
          ? {
              min: marathonPaceSecPerMile * 0.98,
              max: marathonPaceSecPerMile * 1.02,
            }
          : null,
      },
      paceSource: "race",
      warnings,
      assumptions,
    };
  }

  return {
    estimates: {
      easy: { min: easyMin, max: easyMax },
      steady: { min: steadyMin, max: steadyMax },
      threshold: { min: thresholdMin, max: thresholdMax },
      marathon: marathonPaceSecPerMile
        ? {
            min: marathonPaceSecPerMile * 0.98,
            max: marathonPaceSecPerMile * 1.02,
          }
        : null,
    },
    paceSource: "race",
    warnings,
    assumptions,
  };
}
