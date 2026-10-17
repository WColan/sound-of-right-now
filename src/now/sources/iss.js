/**
 * International Space Station — position from wheretheiss.at.
 * https://wheretheiss.at/w/developer (free, keyless, CORS, ~1 req/s limit)
 */
import { fetchJson } from '../http.js';
import { haversineKm, bearingDeg, elevationAngleDeg } from '../util.js';

export const ISS_URL = 'https://api.wheretheiss.at/v1/satellites/25544';

/** Within this ground distance the station is "passing over" (≈ horizon at 420 km altitude). */
export const ISS_RANGE_KM = 2200;

export function normalizeIss(data, lat, lng, previous = null) {
  if (data?.latitude == null) return null;
  const altitudeKm = data.altitude ?? 420;
  const groundKm = haversineKm(lat, lng, data.latitude, data.longitude);
  const slantKm = Math.sqrt(groundKm ** 2 + altitudeKm ** 2);
  const timestamp = (data.timestamp ?? Date.now() / 1000) * 1000;
  // Radial velocity from successive samples (km/s, + = receding)
  let radialKmS = 0;
  if (previous?.slantKm != null && previous.timestamp && timestamp > previous.timestamp) {
    radialKmS = (slantKm - previous.slantKm) / ((timestamp - previous.timestamp) / 1000);
  }
  return {
    latitude: data.latitude,
    longitude: data.longitude,
    altitudeKm,
    velocityKmh: data.velocity ?? 27600,
    groundKm,
    slantKm,
    radialKmS,
    azimuth: bearingDeg(lat, lng, data.latitude, data.longitude),
    elevation: elevationAngleDeg(groundKm, altitudeKm),
    sunlit: data.visibility === 'daylight',
    inRange: groundKm <= ISS_RANGE_KM,
    timestamp,
  };
}

export async function loadIss({ lat, lng, previous, fetchImpl }) {
  return normalizeIss(await fetchJson(ISS_URL, { fetchImpl, timeoutMs: 8000 }), lat, lng, previous);
}
