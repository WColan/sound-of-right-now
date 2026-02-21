const WEATHER_URL = 'https://api.open-meteo.com/v1/forecast';

/**
 * Normalized weather state produced by the fetcher.
 * @typedef {Object} WeatherState
 * @property {number} temperature - Celsius
 * @property {number} humidity - 0-100
 * @property {number} pressure - hPa
 * @property {number} windSpeed - km/h
 * @property {number} windDirection - degrees (0-360)
 * @property {number} weatherCode - WMO weather code
 * @property {Date} sunrise - Today's sunrise
 * @property {Date} sunset - Today's sunset
 */

/**
 * Fetch current weather from Open-Meteo.
 * @param {number} latitude
 * @param {number} longitude
 * @returns {Promise<WeatherState|null>}
 */
export async function fetchWeather(latitude, longitude) {
  const params = new URLSearchParams({
    latitude: latitude.toFixed(4),
    longitude: longitude.toFixed(4),
    current: [
      'temperature_2m',
      'apparent_temperature',     // Feels-like (wind chill / heat index)
      'relative_humidity_2m',
      'surface_pressure',
      'wind_speed_10m',
      'wind_direction_10m',
      'weather_code',
      'cloud_cover',
    ].join(','),
    hourly: 'uv_index',
    daily: 'sunrise,sunset',
    timezone: 'auto',
    forecast_days: '1',
  });

  try {
    const response = await fetch(`${WEATHER_URL}?${params}`);
    if (!response.ok) throw new Error(`Weather API ${response.status}`);

    const data = await response.json();
    const current = data.current;
    const daily = data.daily;

    // Open-Meteo returns times as naive local strings (no timezone suffix) when
    // timezone: 'auto' is used. JavaScript's Date constructor parses these as
    // the *browser's* local timezone, which is wrong for remote locations.
    // Use utc_offset_seconds to convert the location's local time to UTC epoch.
    const utcOffsetMs = (data.utc_offset_seconds ?? 0) * 1000;

    function localStringToDate(str) {
      // Parse "YYYY-MM-DDTHH:MM" as UTC by appending Z, then subtract the
      // location's UTC offset to get the correct UTC epoch for that local time.
      return new Date(new Date(str + 'Z').getTime() - utcOffsetMs);
    }

    // Extract current hour's UV index from hourly data using the location's
    // local time (not the browser's local hour).
    const locationNowMs = Date.now() + utcOffsetMs;
    const currentHour = new Date(locationNowMs).getUTCHours();
    const uvIndex = data.hourly?.uv_index?.[currentHour] ?? 0;

    return {
      temperature: current.temperature_2m,
      apparentTemperature: current.apparent_temperature ?? current.temperature_2m,
      humidity: current.relative_humidity_2m,
      pressure: current.surface_pressure,
      windSpeed: current.wind_speed_10m,
      windDirection: current.wind_direction_10m,
      weatherCode: current.weather_code,
      cloudCover: current.cloud_cover ?? 0,
      sunrise: localStringToDate(daily.sunrise[0]),
      sunset: localStringToDate(daily.sunset[0]),
      uvIndex,
    };
  } catch (err) {
    console.error('Weather fetch failed:', err);
    return null;
  }
}

/**
 * Create a weather fetcher that polls on an interval.
 * @param {number} latitude
 * @param {number} longitude
 * @param {number} intervalMs - Polling interval (default 60s)
 * @returns {{ start: Function, stop: Function, onUpdate: Function, fetchNow: Function }}
 */
export function createWeatherFetcher(latitude, longitude, intervalMs = 60000) {
  let timer = null;
  let callback = null;
  let lastState = null;
  let lat = latitude;
  let lng = longitude;

  async function poll() {
    const state = await fetchWeather(lat, lng);
    if (state) {
      lastState = state;
      if (callback) callback(state);
    }
  }

  return {
    /** Register a callback for weather updates */
    onUpdate(fn) {
      callback = fn;
    },

    /** Start polling */
    async start() {
      await poll(); // Fetch immediately
      timer = setInterval(poll, intervalMs);
    },

    /** Stop polling */
    stop() {
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
    },

    /** Update the location and fetch immediately */
    async setLocation(latitude, longitude) {
      lat = latitude;
      lng = longitude;
      await poll();
    },

    /** Force an immediate fetch */
    fetchNow: poll,

    /** Get the last fetched state */
    get lastState() {
      return lastState;
    },
  };
}
