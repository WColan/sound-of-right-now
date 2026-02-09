/**
 * Open-Meteo Air Quality API client.
 *
 * Fetches US AQI and PM2.5 for the current location.
 * Free, no API key needed.
 *
 * API docs: https://open-meteo.com/en/docs/air-quality-api
 */

const AQ_URL = 'https://air-quality-api.open-meteo.com/v1/air-quality';

/**
 * Fetch current air quality.
 * @param {number} latitude
 * @param {number} longitude
 * @returns {Promise<{aqi: number, pm25: number}|null>}
 */
export async function fetchAirQuality(latitude, longitude) {
  const params = new URLSearchParams({
    latitude: latitude.toFixed(4),
    longitude: longitude.toFixed(4),
    current: 'us_aqi,pm2_5',
  });

  try {
    const response = await fetch(`${AQ_URL}?${params}`);
    if (!response.ok) throw new Error(`AQ API ${response.status}`);

    const data = await response.json();
    const current = data.current;

    return {
      aqi: current.us_aqi ?? 0,
      pm25: current.pm2_5 ?? 0,
    };
  } catch (err) {
    console.error('Air quality fetch failed:', err);
    return null;
  }
}

/**
 * Create an air quality fetcher that polls on an interval.
 * Follows the same pattern as tides.js.
 *
 * @param {number} latitude
 * @param {number} longitude
 * @returns {object} Fetcher with onUpdate, start, stop
 */
export function createAirQualityFetcher(latitude, longitude) {
  let callback = null;
  let timer = null;
  let lastData = null;
  let lat = latitude;
  let lng = longitude;

  async function poll() {
    const data = await fetchAirQuality(lat, lng);
    if (data) {
      lastData = data;
      if (callback) callback(data);
    }
  }

  return {
    onUpdate(fn) {
      callback = fn;
    },

    async start() {
      await poll();
      // AQI doesn't change fast — poll every 15 minutes
      timer = setInterval(poll, 15 * 60 * 1000);
    },

    stop() {
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
    },

    setLocation(latitude, longitude) {
      lat = latitude;
      lng = longitude;
    },

    get lastData() {
      return lastData;
    },
  };
}
