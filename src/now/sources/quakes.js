/**
 * USGS earthquake feed — the ground beneath us, and the planet's restlessness.
 * https://earthquake.usgs.gov/earthquakes/feed/v1.0/geojson.php (free, keyless, CORS)
 */
import { fetchJson } from '../http.js';
import { haversineKm, bearingDeg } from '../util.js';

export const QUAKES_URL = 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/2.5_day.geojson';

/** A quake is "heard" if it's regional and noticeable, or globally major. */
export function isAudible({ mag, distanceKm }) {
  if (mag >= 6) return true;
  if (distanceKm <= 300) return mag >= 2.5;
  if (distanceKm <= 1500) return mag >= 4;
  return false;
}

/**
 * Felt intensity 0–1: magnitude is logarithmic energy; geometric spreading
 * and attenuation reduce it with distance.
 */
export function quakeIntensity(mag, distanceKm) {
  const energy = Math.pow(10, 1.5 * (mag - 2.5));      // relative to M2.5
  const spread = 1 / (1 + (distanceKm / 150) ** 1.6);  // fades over ~hundreds of km
  return Math.min(1, Math.log10(1 + energy * spread) / 4);
}

export function normalizeQuakes(geojson, lat, lng, nowMs = Date.now()) {
  if (!Array.isArray(geojson?.features)) return null;
  const all = geojson.features.map((f) => {
    const [qLng, qLat, depthKm] = f.geometry?.coordinates ?? [0, 0, 0];
    const distanceKm = haversineKm(lat, lng, qLat, qLng);
    const mag = f.properties?.mag ?? 0;
    return {
      id: f.id,
      mag,
      place: f.properties?.place ?? '',
      time: f.properties?.time ?? 0,
      ageMinutes: (nowMs - (f.properties?.time ?? 0)) / 60000,
      depthKm: depthKm ?? 0,
      distanceKm,
      bearing: bearingDeg(lat, lng, qLat, qLng),
      intensity: quakeIntensity(mag, distanceKm),
    };
  });
  const audible = all.filter(isAudible).sort((a, b) => b.time - a.time);
  const regional = all.filter((q) => q.distanceKm <= 1000);
  return {
    audible,                               // newest first
    regionalCount24h: regional.length,     // local seismic restlessness
    globalCount24h: all.length,
    strongestRegional: regional.reduce((m, q) => (!m || q.mag > m.mag ? q : m), null),
  };
}

export async function loadQuakes({ lat, lng, now = Date.now(), fetchImpl }) {
  return normalizeQuakes(await fetchJson(QUAKES_URL, { fetchImpl }), lat, lng, now);
}
