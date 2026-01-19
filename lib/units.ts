/**
 * Unit conversion utilities
 */

export type DistanceUnit = "km" | "mi";

const METERS_TO_KM = 0.001;
const METERS_TO_MI = 0.000621371;
const KM_TO_MI = 0.621371;
const MI_TO_KM = 1.60934;

/**
 * Convert meters to the specified unit
 */
export function metersToUnit(meters: number, unit: DistanceUnit): number {
  if (unit === "mi") {
    return meters * METERS_TO_MI;
  }
  return meters * METERS_TO_KM;
}

/**
 * Convert from the specified unit to meters
 */
export function unitToMeters(value: number, unit: DistanceUnit): number {
  if (unit === "mi") {
    return value / METERS_TO_MI;
  }
  return value / METERS_TO_KM;
}

/**
 * Format distance with unit label
 */
export function formatDistance(meters: number, unit: DistanceUnit, decimals: number = 1): string {
  const value = metersToUnit(meters, unit);
  const unitLabel = unit === "mi" ? "mi" : "km";
  return `${value.toFixed(decimals)} ${unitLabel}`;
}

/**
 * Format pace (seconds per meter) to min:sec per unit
 */
export function formatPace(secondsPerMeter: number, unit: DistanceUnit): string {
  let secondsPerUnit: number;
  
  if (unit === "mi") {
    // Convert seconds per meter to seconds per mile
    // 1 mile = 1609.34 meters, so seconds per mile = seconds per meter * 1609.34
    const METERS_PER_MILE = 1 / METERS_TO_MI; // 1609.34
    secondsPerUnit = secondsPerMeter * METERS_PER_MILE;
  } else {
    // Convert seconds per meter to seconds per km
    // 1 km = 1000 meters, so seconds per km = seconds per meter * 1000
    const METERS_PER_KM = 1 / METERS_TO_KM; // 1000
    secondsPerUnit = secondsPerMeter * METERS_PER_KM;
  }
  
  const min = Math.floor(secondsPerUnit / 60);
  const sec = Math.floor(secondsPerUnit % 60);
  const unitLabel = unit === "mi" ? "/mi" : "/km";
  return `${min}:${String(sec).padStart(2, "0")}${unitLabel}`;
}

/**
 * Convert pace from one unit to another
 */
export function convertPace(secondsPerMeter: number, fromUnit: DistanceUnit, toUnit: DistanceUnit): number {
  if (fromUnit === toUnit) return secondsPerMeter;
  
  if (fromUnit === "km" && toUnit === "mi") {
    return secondsPerMeter * KM_TO_MI;
  }
  if (fromUnit === "mi" && toUnit === "km") {
    return secondsPerMeter * MI_TO_KM;
  }
  return secondsPerMeter;
}
