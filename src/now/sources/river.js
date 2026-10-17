/**
 * Open-Meteo Flood API (GloFAS) — the nearest river's discharge vs. its norm.
 * https://open-meteo.com/en/docs/flood-api (free, keyless, CORS)
 */
import { fetchJson, query } from '../http.js';

export const FLOOD_URL = 'https://flood-api.open-meteo.com/v1/flood';

export function buildRiverUrl(lat, lng) {
  return `${FLOOD_URL}?${query({
    latitude: lat.toFixed(4),
    longitude: lng.toFixed(4),
    daily: 'river_discharge,river_discharge_median',
    past_days: 1,
    forecast_days: 1,
  })}`;
}

/** Discharge below this (m³/s) is a ditch, not a river — stay silent. */
export const MIN_RIVER_DISCHARGE = 5;

export function normalizeRiver(data) {
  const q = data?.daily?.river_discharge;
  const med = data?.daily?.river_discharge_median;
  if (!Array.isArray(q) || q.length === 0) return null;
  const discharge = q[q.length - 1] ?? q[0];
  const median = (Array.isArray(med) ? med[med.length - 1] : null) ?? discharge;
  if (discharge == null || discharge < MIN_RIVER_DISCHARGE) return null;
  return {
    discharge,                                 // m³/s
    median,
    ratio: median > 0 ? discharge / median : 1, // 1 = normal flow, 3 = in flood
  };
}

/** Resolves to undefined when the request failed (retry later), null when there's no river here. */
export async function loadRiver({ lat, lng, fetchImpl }) {
  const raw = await fetchJson(buildRiverUrl(lat, lng), { fetchImpl });
  return raw == null ? undefined : normalizeRiver(raw);
}
