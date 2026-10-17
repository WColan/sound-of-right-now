/**
 * NOAA CO-OPS tides — water level at the nearest coastal station and whether
 * it's flooding (rising) or ebbing (falling).
 * https://api.tidesandcurrents.noaa.gov (free, keyless, CORS; US coasts)
 */
import { fetchJson, query } from '../http.js';
import { haversineKm } from '../util.js';

export const TIDE_STATIONS_URL = 'https://api.tidesandcurrents.noaa.gov/mdapi/prod/webapi/stations.json?type=waterlevels&units=english';
export const TIDE_DATA_URL = 'https://api.tidesandcurrents.noaa.gov/api/prod/datagetter';

function fmt(date) {
  const p = (n) => String(n).padStart(2, '0');
  return `${date.getUTCFullYear()}${p(date.getUTCMonth() + 1)}${p(date.getUTCDate())} ${p(date.getUTCHours())}:${p(date.getUTCMinutes())}`;
}

/** Pure: NOAA water_level rows (last ~hour) → { level, trend }. */
export function normalizeTide(data, station) {
  const rows = (data?.data ?? []).map((r) => Number(r.v)).filter(Number.isFinite);
  if (rows.length === 0) return null;
  const level = rows[rows.length - 1];
  // feet per hour; ±1 ft/h is a strong tide
  const trend = rows.length > 1 ? (level - rows[0]) / Math.max(1, rows.length / 10) : 0;
  return {
    level,                                  // ft above MLLW
    trend,                                  // + rising (flood), − falling (ebb)
    stationName: station?.name ?? null,
    stationKm: station?.distanceKm ?? null,
  };
}

let stationCache = null;

/** Nearest water-level station within maxKm, or null (inland / outside US). */
export function nearestStation(stations, lat, lng, maxKm = 80) {
  let best = null;
  for (const s of stations ?? []) {
    const distanceKm = haversineKm(lat, lng, s.lat, s.lng);
    if (distanceKm <= maxKm && (!best || distanceKm < best.distanceKm)) best = { id: s.id, name: s.name, distanceKm };
  }
  return best;
}

export async function loadTide({ lat, lng, station, now = Date.now(), fetchImpl }) {
  if (!station && !stationCache) {
    stationCache = (await fetchJson(TIDE_STATIONS_URL, { fetchImpl }))?.stations ?? null;
    // Station list unreachable: unknown, not "inland" — the caller retries
    if (!stationCache) return { station: null, tide: null, failed: true };
  }
  const st = station ?? nearestStation(stationCache, lat, lng);
  if (!st) return { station: null, tide: null };
  const data = await fetchJson(`${TIDE_DATA_URL}?${query({
    begin_date: fmt(new Date(now - 3600000)),
    end_date: fmt(new Date(now)),
    station: st.id,
    product: 'water_level',
    datum: 'MLLW',
    units: 'english',
    time_zone: 'gmt',
    format: 'json',
  })}`, { fetchImpl });
  return { station: st, tide: normalizeTide(data, st) };
}
