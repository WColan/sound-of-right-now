/**
 * Calculate the current moon phase using the Julian date method.
 *
 * Returns a value from 0 to 1:
 *   0.00 = New Moon
 *   0.25 = First Quarter
 *   0.50 = Full Moon
 *   0.75 = Last Quarter
 *
 * Accuracy is sufficient for musical/artistic purposes (~1 day).
 */

const SYNODIC_MONTH = 29.53059; // Average days in a lunar cycle
const KNOWN_NEW_MOON_JD = 2451550.1; // January 6, 2000 (Julian Day)

/**
 * Convert a JavaScript Date to Julian Day Number.
 */
function toJulianDay(date) {
  return date.getTime() / 86400000 + 2440587.5;
}

/**
 * Get the moon phase for a given date.
 * @param {Date} [date] - Defaults to now
 * @returns {number} Phase from 0 to 1
 */
export function getMoonPhase(date = new Date()) {
  const jd = toJulianDay(date);
  const daysSinceNewMoon = jd - KNOWN_NEW_MOON_JD;
  const lunarCycles = daysSinceNewMoon / SYNODIC_MONTH;
  return lunarCycles - Math.floor(lunarCycles);
}

/**
 * Get the "fullness" of the moon (0 = new, 1 = full).
 * Useful for modulation depth mapping.
 * @param {Date} [date]
 * @returns {number} 0 to 1
 */
export function getMoonFullness(date = new Date()) {
  const phase = getMoonPhase(date);
  return 1 - Math.abs(phase - 0.5) * 2;
}

/**
 * Get a human-readable moon phase name.
 * @param {Date} [date]
 * @returns {string}
 */
export function getMoonPhaseName(date = new Date()) {
  const phase = getMoonPhase(date);

  if (phase < 0.0625) return 'New Moon';
  if (phase < 0.1875) return 'Waxing Crescent';
  if (phase < 0.3125) return 'First Quarter';
  if (phase < 0.4375) return 'Waxing Gibbous';
  if (phase < 0.5625) return 'Full Moon';
  if (phase < 0.6875) return 'Waning Gibbous';
  if (phase < 0.8125) return 'Last Quarter';
  if (phase < 0.9375) return 'Waning Crescent';
  return 'New Moon';
}
