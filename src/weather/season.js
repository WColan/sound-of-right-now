/**
 * Seasonal awareness — compute a brightness factor from date and latitude.
 *
 * Summer = 1.0 (brightest timbres), Winter = 0.0 (darkest).
 * Hemisphere-aware: southern hemisphere is inverted.
 */

/**
 * @param {Date} [date]
 * @param {number} [latitude] - Positive = northern hemisphere
 * @returns {number} 0-1 seasonal factor (1 = summer peak)
 */
export function getSeasonalFactor(date = new Date(), latitude = 0) {
  const dayOfYear = getDayOfYear(date);

  // Sinusoidal curve peaking at summer solstice (~day 172 in northern hemisphere)
  // Offset by 0.5 for southern hemisphere
  const offset = latitude >= 0 ? 0 : 0.5;
  const raw = Math.sin(((dayOfYear / 365) - 0.22 + offset) * Math.PI * 2);

  return (raw + 1) / 2; // Normalize to 0-1
}

function getDayOfYear(date) {
  const start = new Date(date.getFullYear(), 0, 0);
  return Math.floor((date - start) / 86400000);
}
