/**
 * Compute Pace Ranges from fitness and goal
 * 
 * All paces in seconds per mile.
 * Ensures ordering: interval faster than tempo faster than mp faster than easy.
 */

import { RecentFitness, Goal, PaceRanges } from "./types";

/**
 * Compute marathon pace from goal
 */
function computeMarathonPace(goal: Goal): number {
  const distanceMiles = goal.race === "marathon" ? 26.21875 : // 42.195 km
                        goal.race === "half" ? 13.109375 : // 21.0975 km
                        goal.race === "10k" ? 6.21371 : // 10 km
                        3.10686; // 5 km
  
  return goal.targetTimeSec / distanceMiles;
}

/**
 * Compute pace ranges from fitness and goal
 */
export function computePaceRanges(fitness: RecentFitness, goal: Goal): PaceRanges {
  const mp = computeMarathonPace(goal);
  
  // Marathon pace range: ±10-15s
  const mpRange: [number, number] = [
    mp - 10,
    mp + 15,
  ];
  
  // Easy pace: mp + 60-120s (or derived from fitness)
  const easyRange: [number, number] = fitness.easyPaceRangeSecPerMile[0] > 0
    ? fitness.easyPaceRangeSecPerMile
    : [mp + 60, mp + 120];
  
  // Tempo pace: mp - 15-35s (or threshold estimate if available)
  let tempoMin: number;
  let tempoMax: number;
  
  if (fitness.thresholdPaceSecPerMile !== null) {
    // Use threshold estimate ± 5s
    tempoMin = fitness.thresholdPaceSecPerMile - 5;
    tempoMax = fitness.thresholdPaceSecPerMile + 5;
  } else {
    // Estimate from mp: tempo is 15-35s faster
    tempoMin = mp - 35;
    tempoMax = mp - 15;
  }
  
  // Ensure tempo is faster than mp
  if (tempoMax >= mp) {
    tempoMax = mp - 5;
    tempoMin = mp - 30;
  }
  
  const tempoRange: [number, number] = [tempoMin, tempoMax];
  
  // Interval pace: mp - 45-75s (or VO2 estimate if available)
  let intervalMin: number;
  let intervalMax: number;
  
  if (fitness.vo2PaceSecPerMile !== null) {
    // Use VO2 estimate ± 5s
    intervalMin = fitness.vo2PaceSecPerMile - 5;
    intervalMax = fitness.vo2PaceSecPerMile + 5;
  } else {
    // Estimate from mp: interval is 45-75s faster
    intervalMin = mp - 75;
    intervalMax = mp - 45;
  }
  
  // Ensure interval is faster than tempo
  if (intervalMax >= tempoMin) {
    intervalMax = tempoMin - 5;
    intervalMin = tempoMin - 30;
  }
  
  const intervalRange: [number, number] = [intervalMin, intervalMax];
  
  // Validate ordering: interval < tempo < mp < easy
  if (intervalRange[1] >= tempoRange[0]) {
    // Adjust interval to be faster than tempo
    intervalRange[1] = tempoRange[0] - 5;
    intervalRange[0] = tempoRange[0] - 30;
  }
  
  if (tempoRange[1] >= mpRange[0]) {
    // Adjust tempo to be faster than mp
    tempoRange[1] = mpRange[0] - 5;
    tempoRange[0] = mpRange[0] - 30;
  }
  
  if (mpRange[1] >= easyRange[0]) {
    // Adjust mp to be faster than easy
    mpRange[1] = easyRange[0] - 5;
    mpRange[0] = easyRange[0] - 30;
  }
  
  return {
    mp: mpRange,
    easy: easyRange,
    tempo: tempoRange,
    interval: intervalRange,
  };
}
