/**
 * Open-Meteo forecast — the atmosphere right here, right now.
 * https://open-meteo.com/en/docs (free, keyless, CORS)
 */
import { fetchJson, query } from '../http.js';
import { categorizeWeatherCode } from '../../weather/codes.js';

export const WEATHER_URL = 'https://api.open-meteo.com/v1/forecast';

const CURRENT_FIELDS = [
  'temperature_2m', 'apparent_temperature', 'relative_humidity_2m', 'dew_point_2m',
  'surface_pressure', 'wind_speed_10m', 'wind_gusts_10m', 'wind_direction_10m',
  'weather_code', 'cloud_cover', 'precipitation', 'rain', 'showers', 'snowfall',
  'is_day', 'visibility', 'shortwave_radiation',
];
const HOURLY_FIELDS = ['uv_index', 'cape', 'snow_depth', 'surface_pressure', 'visibility'];

export function buildWeatherUrl(lat, lng) {
  return `${WEATHER_URL}?${query({
    latitude: lat.toFixed(4),
    longitude: lng.toFixed(4),
    current: CURRENT_FIELDS.join(','),
    hourly: HOURLY_FIELDS.join(','),
    daily: 'sunrise,sunset,daylight_duration',
    timezone: 'auto',
    past_days: 1,
    forecast_days: 1,
  })}`;
}

/**
 * Pure: Open-Meteo response → WeatherNow.
 * Times from Open-Meteo are naive location-local strings; utc_offset_seconds
 * converts them to real instants.
 */
export function normalizeWeather(data, nowMs = Date.now()) {
  if (!data?.current) return null;
  const c = data.current;
  const utcOffsetSeconds = data.utc_offset_seconds ?? 0;
  const offsetMs = utcOffsetSeconds * 1000;
  const localToDate = (s) => (s ? new Date(new Date(`${s}Z`).getTime() - offsetMs) : null);

  // Hourly arrays cover yesterday + today (past_days=1) → index by local hour.
  const hourly = data.hourly ?? {};
  const times = hourly.time ?? [];
  const localNow = new Date(nowMs + offsetMs).toISOString().slice(0, 13); // "YYYY-MM-DDTHH"
  let idx = times.findIndex((t) => t.startsWith(localNow));
  if (idx < 0) idx = Math.max(0, times.length - 1);
  const at = (key, i = idx) => hourly[key]?.[i] ?? null;

  // 3-hour pressure tendency — the classic barometer reading
  const pNow = at('surface_pressure') ?? c.surface_pressure;
  const p3 = idx >= 3 ? at('surface_pressure', idx - 3) : null;
  const pressureTendency = p3 != null && pNow != null ? pNow - p3 : 0;

  // Today's daily index: last entry whose date is ≤ local today
  const daily = data.daily ?? {};
  const today = localNow.slice(0, 10);
  let d = (daily.time ?? []).indexOf(today);
  if (d < 0) d = Math.max(0, (daily.time?.length ?? 1) - 1);

  const precipitation = c.precipitation ?? ((c.rain ?? 0) + (c.showers ?? 0));
  return {
    temperature: c.temperature_2m,
    apparentTemperature: c.apparent_temperature ?? c.temperature_2m,
    humidity: c.relative_humidity_2m,
    dewPoint: c.dew_point_2m ?? null,
    pressure: c.surface_pressure,
    pressureTendency,
    windSpeed: c.wind_speed_10m ?? 0,
    windGusts: c.wind_gusts_10m ?? c.wind_speed_10m ?? 0,
    windDirection: c.wind_direction_10m ?? 0,
    weatherCode: c.weather_code ?? 0,
    category: categorizeWeatherCode(c.weather_code ?? 0),
    cloudCover: c.cloud_cover ?? 0,
    precipitation,
    snowfall: c.snowfall ?? 0,
    isDay: c.is_day == null ? null : Boolean(c.is_day),
    visibility: c.visibility ?? at('visibility') ?? null,
    radiation: c.shortwave_radiation ?? null,
    uvIndex: at('uv_index') ?? 0,
    cape: at('cape') ?? 0,
    snowDepth: at('snow_depth') ?? 0,
    sunrise: localToDate(daily.sunrise?.[d]),
    sunset: localToDate(daily.sunset?.[d]),
    daylightSeconds: daily.daylight_duration?.[d] ?? null,
    elevation: data.elevation ?? 0,
    utcOffsetSeconds,
    timezone: data.timezone ?? null,
  };
}

export async function loadWeather({ lat, lng, now = Date.now(), fetchImpl }) {
  return normalizeWeather(await fetchJson(buildWeatherUrl(lat, lng), { fetchImpl }), now);
}
