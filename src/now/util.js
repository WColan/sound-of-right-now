/**
 * Small numeric + geodesy helpers shared by the data layer, score and visuals.
 * Pure functions only.
 */

export const clamp = (v, lo = 0, hi = 1) => Math.min(hi, Math.max(lo, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const invLerp = (a, b, v) => (b === a ? 0 : clamp((v - a) / (b - a)));
export const smoothstep = (a, b, v) => {
  const t = invLerp(a, b, v);
  return t * t * (3 - 2 * t);
};
export const toRad = (deg) => (deg * Math.PI) / 180;
export const toDeg = (rad) => (rad * 180) / Math.PI;

const EARTH_RADIUS_KM = 6371;

/** Great-circle distance in km. */
export function haversineKm(lat1, lng1, lat2, lng2) {
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return EARTH_RADIUS_KM * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** Initial bearing from point 1 to point 2, degrees clockwise from north. */
export function bearingDeg(lat1, lng1, lat2, lng2) {
  const y = Math.sin(toRad(lng2 - lng1)) * Math.cos(toRad(lat2));
  const x = Math.cos(toRad(lat1)) * Math.sin(toRad(lat2))
    - Math.sin(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.cos(toRad(lng2 - lng1));
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

/**
 * Elevation angle (degrees) of an object at `altKm` above a ground point
 * `groundKm` away along the surface, as seen by an observer at sea level.
 */
export function elevationAngleDeg(groundKm, altKm) {
  const R = EARTH_RADIUS_KM;
  const theta = groundKm / R;
  const r = R + altKm;
  // Observer at (R, 0); object at (r cosθ, r sinθ). Angle above local horizon.
  const dx = r * Math.cos(theta) - R;
  const dy = r * Math.sin(theta);
  return toDeg(Math.atan2(dx, dy));
}

/** Azimuth (deg) → stereo pan (−1 left … +1 right) for a listener facing south. */
export function azimuthToPan(azDeg) {
  // Facing south (180°): east (90°) is on the left, west (270°) on the right.
  return clamp(-Math.sin(toRad(azDeg)), -1, 1);
}

/** Deterministic PRNG (mulberry32) for reproducible tests and seeded visuals. */
export function createRng(seed = 1) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
