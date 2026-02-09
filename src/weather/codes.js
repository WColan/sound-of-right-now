/**
 * Maps WMO weather codes to musical categories.
 *
 * WMO codes: https://open-meteo.com/en/docs (see weather_code)
 */

const CODE_TO_CATEGORY = {
  0: 'clear',      // Clear sky
  1: 'clear',      // Mainly clear
  2: 'cloudy',     // Partly cloudy
  3: 'cloudy',     // Overcast
  45: 'fog',       // Fog
  48: 'fog',       // Depositing rime fog
  51: 'drizzle',   // Light drizzle
  53: 'drizzle',   // Moderate drizzle
  55: 'drizzle',   // Dense drizzle
  56: 'drizzle',   // Light freezing drizzle
  57: 'drizzle',   // Dense freezing drizzle
  61: 'rain',      // Slight rain
  63: 'rain',      // Moderate rain
  65: 'rain',      // Heavy rain
  66: 'rain',      // Light freezing rain
  67: 'rain',      // Heavy freezing rain
  71: 'snow',      // Slight snowfall
  73: 'snow',      // Moderate snowfall
  75: 'snow',      // Heavy snowfall
  77: 'snow',      // Snow grains
  80: 'rain',      // Slight rain showers
  81: 'rain',      // Moderate rain showers
  82: 'rain',      // Violent rain showers
  85: 'snow',      // Slight snow showers
  86: 'snow',      // Heavy snow showers
  95: 'storm',     // Thunderstorm
  96: 'storm',     // Thunderstorm with slight hail
  99: 'storm',     // Thunderstorm with heavy hail
};

/**
 * Convert a WMO weather code to a musical category.
 * @param {number} code - WMO weather code
 * @returns {string} One of: clear, cloudy, fog, drizzle, rain, snow, storm
 */
export function categorizeWeatherCode(code) {
  return CODE_TO_CATEGORY[code] || 'clear';
}

/**
 * Get a human-readable description for a WMO weather code.
 * @param {number} code
 * @returns {string}
 */
export function describeWeatherCode(code) {
  const descriptions = {
    0: 'Clear',
    1: 'Mostly Clear',
    2: 'Partly Cloudy',
    3: 'Overcast',
    45: 'Fog',
    48: 'Rime Fog',
    51: 'Light Drizzle',
    53: 'Drizzle',
    55: 'Heavy Drizzle',
    56: 'Freezing Drizzle',
    57: 'Heavy Freezing Drizzle',
    61: 'Light Rain',
    63: 'Rain',
    65: 'Heavy Rain',
    66: 'Freezing Rain',
    67: 'Heavy Freezing Rain',
    71: 'Light Snow',
    73: 'Snow',
    75: 'Heavy Snow',
    77: 'Snow Grains',
    80: 'Light Showers',
    81: 'Showers',
    82: 'Heavy Showers',
    85: 'Light Snow Showers',
    86: 'Heavy Snow Showers',
    95: 'Thunderstorm',
    96: 'Thunderstorm with Hail',
    99: 'Severe Thunderstorm',
  };
  return descriptions[code] || 'Unknown';
}
