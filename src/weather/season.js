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

/**
 * Get the named season for a date and latitude.
 * Uses astronomical season boundaries (equinoxes/solstices).
 *
 * @param {Date} [date]
 * @param {number} [latitude] - Positive = northern hemisphere
 * @returns {'winter'|'spring'|'summer'|'autumn'}
 */
export function getSeasonName(date = new Date(), latitude = 0) {
  const doy = getDayOfYear(date);
  // Northern hemisphere astronomical boundaries (approximate day-of-year)
  // Spring: Mar 20 (day 79) – Jun 20 (day 171)
  // Summer: Jun 21 (day 172) – Sep 22 (day 265)
  // Autumn: Sep 23 (day 266) – Dec 20 (day 354)
  // Winter: Dec 21 (day 355) – Mar 19 (day 78)
  const SEASONS_N = ['winter', 'spring', 'summer', 'autumn'];
  const SEASONS_S = ['summer', 'autumn', 'winter', 'spring'];
  const seasons = latitude >= 0 ? SEASONS_N : SEASONS_S;

  if (doy < 79)  return seasons[0];
  if (doy < 172) return seasons[1];
  if (doy < 266) return seasons[2];
  if (doy < 355) return seasons[3];
  return seasons[0];
}

function getDayOfYear(date) {
  const start = new Date(date.getFullYear(), 0, 0);
  return Math.floor((date - start) / 86400000);
}
