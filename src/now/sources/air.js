/**
 * Open-Meteo Air Quality — what's suspended in the air: AQI, PM2.5, pollen.
 * https://open-meteo.com/en/docs/air-quality-api (free, keyless, CORS)
 * Pollen is only modelled for Europe; elsewhere it's null.
 */
import { fetchJson, query } from '../http.js';

export const AIR_URL = 'https://air-quality-api.open-meteo.com/v1/air-quality';
const POLLEN = ['alder_pollen', 'birch_pollen', 'grass_pollen', 'mugwort_pollen', 'olive_pollen', 'ragweed_pollen'];

export function buildAirUrl(lat, lng) {
  return `${AIR_URL}?${query({
    latitude: lat.toFixed(4),
    longitude: lng.toFixed(4),
    current: ['us_aqi', 'pm2_5', ...POLLEN].join(','),
  })}`;
}

export function normalizeAir(data) {
  const c = data?.current;
  if (!c) return null;
  const pollenValues = POLLEN.map((k) => c[k]).filter((v) => typeof v === 'number');
  return {
    aqi: c.us_aqi ?? 0,
    pm25: c.pm2_5 ?? 0,
    // grains/m³ summed across species; null where not modelled
    pollen: pollenValues.length ? pollenValues.reduce((a, b) => a + b, 0) : null,
  };
}

export async function loadAir({ lat, lng, fetchImpl }) {
  return normalizeAir(await fetchJson(buildAirUrl(lat, lng), { fetchImpl }));
}
