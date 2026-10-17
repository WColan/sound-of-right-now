/**
 * NOAA Space Weather Prediction Center — the sun's wind and the planet's
 * magnetic field. Kp (0–9) measures geomagnetic disturbance; when it rises,
 * aurora reach lower latitudes.
 * https://services.swpc.noaa.gov (free, keyless, CORS)
 */
import { fetchJson } from '../http.js';
import { clamp, smoothstep, toRad, toDeg } from '../util.js';

export const KP_URL = 'https://services.swpc.noaa.gov/json/planetary_k_index_1m.json';
export const PLASMA_URL = 'https://services.swpc.noaa.gov/products/solar-wind/plasma-5-minute.json';

// Geomagnetic north pole (IGRF-13 dipole, 2025-ish)
const POLE_LAT = 80.8;
const POLE_LNG = -72.6;

/** Approximate geomagnetic latitude (centred dipole), degrees. */
export function geomagneticLatitude(lat, lng) {
  const φ = toRad(lat), λ = toRad(lng), φp = toRad(POLE_LAT), λp = toRad(POLE_LNG);
  return toDeg(Math.asin(Math.sin(φ) * Math.sin(φp) + Math.cos(φ) * Math.cos(φp) * Math.cos(λ - λp)));
}

/**
 * How likely aurora is overhead-ish (0–1), ignoring darkness and clouds.
 * Rule of thumb: the oval's equatorward edge sits near 66° − 2·Kp geomagnetic.
 */
export function auroraReach(kp, geomagLat) {
  const edge = 66 - 2 * clamp(kp, 0, 9);
  return smoothstep(edge - 6, edge + 2, Math.abs(geomagLat));
}

export function normalizeSpace(kpRows, plasmaRows, lat, lng) {
  if (!Array.isArray(kpRows) || kpRows.length === 0) return null;
  const last = kpRows[kpRows.length - 1];
  const kp = Number(last.estimated_kp ?? last.kp_index ?? 0);
  let solarWindSpeed = null;
  let solarWindDensity = null;
  if (Array.isArray(plasmaRows) && plasmaRows.length > 1) {
    for (let i = plasmaRows.length - 1; i > 0; i--) {
      const [, density, speed] = plasmaRows[i];
      if (speed != null && speed !== '') {
        solarWindSpeed = Number(speed);
        solarWindDensity = Number(density);
        break;
      }
    }
  }
  const geomagLat = geomagneticLatitude(lat, lng);
  return {
    kp,
    solarWindSpeed,    // km/s, ~300 quiet → 800 storm
    solarWindDensity,  // p/cm³
    geomagLat,
    auroraReach: auroraReach(kp, geomagLat),
  };
}

export async function loadSpace({ lat, lng, fetchImpl }) {
  const [kp, plasma] = await Promise.all([
    fetchJson(KP_URL, { fetchImpl }),
    fetchJson(PLASMA_URL, { fetchImpl }),
  ]);
  return normalizeSpace(kp, plasma, lat, lng);
}
