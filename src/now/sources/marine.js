/**
 * Open-Meteo Marine — the sea's breathing: wave height, period, swell, SST.
 * https://open-meteo.com/en/docs/marine-weather-api (free, keyless, CORS)
 * Inland points return nulls → the ocean section stays silent.
 */
import { fetchJson, query } from '../http.js';

export const MARINE_URL = 'https://marine-api.open-meteo.com/v1/marine';

export function buildMarineUrl(lat, lng) {
  return `${MARINE_URL}?${query({
    latitude: lat.toFixed(4),
    longitude: lng.toFixed(4),
    current: 'wave_height,wave_period,wave_direction,swell_wave_height,swell_wave_period,sea_surface_temperature',
    cell_selection: 'sea',
  })}`;
}

export function normalizeMarine(data) {
  const c = data?.current;
  if (!c || c.wave_height == null) return null;
  return {
    waveHeight: c.wave_height,                       // m
    wavePeriod: c.wave_period ?? c.swell_wave_period ?? 8, // s
    waveDirection: c.wave_direction ?? 0,            // deg (from)
    swellHeight: c.swell_wave_height ?? 0,
    swellPeriod: c.swell_wave_period ?? null,
    seaSurfaceTemp: c.sea_surface_temperature ?? null,
    // Distance from the requested point to the sea cell, if the API moved us.
    gridOffsetKm: null,
  };
}

/** Resolves to undefined when the request failed (retry later), null when there's no sea here. */
export async function loadMarine({ lat, lng, fetchImpl }) {
  const raw = await fetchJson(buildMarineUrl(lat, lng), { fetchImpl });
  return raw == null ? undefined : normalizeMarine(raw);
}
