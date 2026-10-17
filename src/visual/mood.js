/**
 * Visual mood — pure: (NowSnapshot, Score) → everything the renderer needs.
 *
 * The picture is not a weather icon. It is the true sky over the listener
 * (sun, moon, planets and stars where they really are), the land they stand
 * on, and a colour grade that follows the *music*: bright modes warm the
 * light, tension sharpens it, stillness lets it fade.
 */
import { clamp, lerp, smoothstep, toRad } from '../now/util.js';

// Mode → light character (−1 cold/dark … +1 warm/bright)
const MODE_WARMTH = {
  locrian: -1, aeolian: -0.6, harmonicMinor: -0.55, dorian: -0.25, melodicMinor: -0.2,
  mixolydian: 0.2, ionian: 0.5, lydian: 0.9,
};

export const TERRAIN = { grassland: 0, forest: 1, mountain: 2, urban: 3, desert: 4, coastal: 5, arctic: 6, wetland: 7, tropical: 8 };

/** Physically-motivated sky colours from sun altitude (deg). Returns { zenith, horizon, sunGlow } in linear RGB 0–1. */
export function skyColors(sunAlt) {
  const day = smoothstep(-4, 20, sunAlt);
  const golden = smoothstep(-6, -0.5, sunAlt) * (1 - smoothstep(4, 14, sunAlt));
  const twilight = smoothstep(-18, -4, sunAlt) * (1 - day);
  const night = [0.008, 0.012, 0.03];
  const zenith = [
    lerp(lerp(night[0], 0.05, twilight), 0.16, day),
    lerp(lerp(night[1], 0.07, twilight), 0.36, day),
    lerp(lerp(night[2], 0.2, twilight), 0.78, day),
  ];
  const horizon = [
    lerp(lerp(0.02, 0.32, twilight), 0.62, day) + golden * 0.55,
    lerp(lerp(0.025, 0.2, twilight), 0.76, day) + golden * 0.18,
    lerp(lerp(0.05, 0.3, twilight), 0.92, day) - golden * 0.25,
  ];
  const sunGlow = [1, lerp(0.55, 0.92, day), lerp(0.25, 0.8, day)];
  return { zenith: zenith.map((v) => clamp(v)), horizon: horizon.map((v) => clamp(v)), sunGlow, golden, day, twilight };
}

/** Horizontal (y up, x east, z north) → equatorial rotation, for real stars and the Milky Way. */
export function horizonToEquatorialMatrix(lstHours, latDeg) {
  const lst = toRad(lstHours * 15);
  const lat = toRad(latDeg);
  // Horizontal basis vectors expressed in equatorial (x→RA 0h, y→RA 6h, z→NCP)
  const sl = Math.sin(lat), cl = Math.cos(lat), ss = Math.sin(lst), cs = Math.cos(lst);
  const zenith = [cl * cs, cl * ss, sl];
  const north = [-sl * cs, -sl * ss, cl];
  const east = [-ss, cs, 0];
  // Column-major mat3 mapping (east, up, north) → equatorial
  return [...east, ...zenith, ...north];
}

function vec(alt, az) {
  const a = toRad(alt), z = toRad(az);
  return [Math.sin(z) * Math.cos(a), Math.sin(a), Math.cos(z) * Math.cos(a)];
}

/** Where the camera should drift toward: the most meaningful thing in the sky. */
export function focusAzimuth(snapshot, score) {
  const { sky } = snapshot;
  const south = snapshot.location.lat >= 0 ? 180 : 0;
  const pulls = [[south, 0.6]];
  if (sky.sun.altitude > -8 && sky.sun.altitude < 15) pulls.push([sky.sun.azimuth, 2.2]);
  else if (sky.sun.altitude >= 15) pulls.push([sky.sun.azimuth, 0.5]);
  if (sky.moon.altitude > 3 && sky.darkness > 0.4) pulls.push([sky.moon.azimuth, 1 + sky.moon.illumination]);
  if (score?.sections.aurora.on) pulls.push([snapshot.location.lat >= 0 ? 0 : 180, 5 * score.sections.aurora.level]);
  if (snapshot.iss?.inRange) pulls.push([snapshot.iss.azimuth, 3]);
  // Circular weighted mean
  let x = 0, y = 0;
  for (const [az, w] of pulls) { x += Math.sin(toRad(az)) * w; y += Math.cos(toRad(az)) * w; }
  return ((Math.atan2(x, y) * 180) / Math.PI + 360) % 360;
}

/**
 * @param {object} snapshot
 * @param {object} score
 * @param {object} [extra] - { stillness, tension, listenMinutes }
 */
export function computeMood(snapshot, score, extra = {}) {
  const { sky, weather: w } = snapshot;
  const cat = w?.category ?? 'clear';
  const cloud = clamp((w?.cloudCover ?? 0) / 100);
  const colors = skyColors(sky.sun.altitude);
  const warmth = MODE_WARMTH[score?.harmony.mode] ?? 0;
  const stillness = extra.stillness ?? 0;
  const tension = extra.tension ?? 0;
  const listenMinutes = extra.listenMinutes ?? score?.listenMinutes ?? 0;
  const precip = w?.precipitation ?? 0;
  const snowing = cat === 'snow' || (w?.snowfall ?? 0) > 0;
  const visKm = (w?.visibility ?? 20000) / 1000;
  const storm = cat === 'storm' ? 1 : 0;
  const biome = snapshot.location.biome ?? 'grassland';
  const sea = snapshot.marine;
  const hasWater = Boolean(sea || snapshot.tide || biome === 'coastal');
  const river = snapshot.river;

  // Dark adaptation: the longer you look at a night sky, the fainter the
  // stars you can see — limiting magnitude 3.6 → 5.2 over ~12 minutes.
  const darkAdapt = smoothstep(0, 12, listenMinutes);
  const limitingMag = lerp(3.6, 5.2, darkAdapt) - (sky.moon.altitude > 0 ? sky.moon.illumination * 1.2 : 0) - (snapshot.air ? smoothstep(50, 200, snapshot.air.aqi) * 1.5 : 0);

  const kp = snapshot.space?.kp ?? 0;
  const aurora = score?.sections.aurora.on ? score.sections.aurora.level : 0;

  return {
    sun: { dir: vec(sky.sun.altitude, sky.sun.azimuth), altitude: sky.sun.altitude },
    moon: {
      dir: vec(sky.moon.altitude, sky.moon.azimuth),
      altitude: sky.moon.altitude,
      illumination: sky.moon.illumination,
      phaseDeg: sky.moon.phaseDeg,
    },
    planets: sky.planets.map((p) => ({ name: p.name, dir: vec(p.altitude, p.azimuth), altitude: p.altitude, magnitude: p.magnitude })),
    zenith: colors.zenith,
    horizon: colors.horizon,
    sunGlow: colors.sunGlow,
    golden: colors.golden,
    darkness: sky.darkness,
    equatorial: horizonToEquatorialMatrix(sky.lst, snapshot.location.lat),
    lst: sky.lst,
    latitude: snapshot.location.lat,
    limitingMag,
    starVisibility: clamp(sky.darkness * (1 - cloud * 0.92) * (1 - smoothstep(2, 0.2, visKm))),
    milkyWay: clamp(smoothstep(0.75, 1, sky.darkness) * (1 - cloud) * (1 - (sky.moon.altitude > 0 ? sky.moon.illumination * 0.8 : 0)) * (biome === 'urban' ? 0.25 : 1)),
    constellations: smoothstep(10, 12, listenMinutes) * sky.darkness * (1 - cloud),
    cloud: { cover: cloud, darkness: clamp(storm * 0.7 + smoothstep(0, 6, precip) * 0.5), speed: (w?.windSpeed ?? 5) / 3.6, direction: w?.windDirection ?? 0 },
    fog: clamp(1 - smoothstep(0.2, 8, visKm) + (cat === 'fog' ? 0.3 : 0)),
    rain: snowing ? 0 : clamp(smoothstep(0, 6, precip) + (cat === 'drizzle' ? 0.15 : 0)),
    snow: snowing ? clamp(0.25 + smoothstep(0, 3, w?.snowfall ?? 0) * 0.75) : 0,
    snowCover: smoothstep(0.01, 0.3, w?.snowDepth ?? 0),
    wind: { speed: w?.windSpeed ?? 0, direction: w?.windDirection ?? 0 },
    storm,
    aurora: { intensity: aurora, kp, hue: clamp(kp / 9) },
    terrain: { kind: TERRAIN[biome] ?? 0, seed: Math.abs(Math.sin(snapshot.location.lat * 12.9898 + snapshot.location.lng * 78.233)) * 1000 },
    water: {
      present: hasWater || Boolean(river),
      level: snapshot.tide ? clamp((snapshot.tide.level + 1) / 10) : 0.4,
      waveHeight: sea?.waveHeight ?? (river ? 0.1 : 0.4),
      wavePeriod: sea?.wavePeriod ?? 7,
      waveDirection: sea?.waveDirection ?? 0,
      river: Boolean(river) && !hasWater,
    },
    iss: snapshot.iss?.inRange ? { dir: vec(snapshot.iss.elevation, snapshot.iss.azimuth), visible: snapshot.iss.sunlit && sky.darkness > 0.4 && snapshot.iss.elevation > 0 } : null,
    fireflies: score?.sections.life.on && (w?.temperature ?? 0) > 16 && sky.darkness > 0.6 && ['summer'].includes(snapshot.calendar.season) ? clamp(score.sections.life.crickets) : 0,
    birds: score?.sections.life.birds ?? 0,
    haze: score?.master.haze ?? 0,
    grade: {
      warmth: clamp(warmth * 0.6 + colors.golden * 0.5, -1, 1),
      saturation: clamp(lerp(0.75, 1.15, (warmth + 1) / 2) * (1 - cloud * 0.35) * (1 - stillness * 0.35), 0.3, 1.3),
      contrast: 1 + tension * 0.18,
      exposure: lerp(0.95, 1.08, colors.day) * (1 - stillness * 0.18),
      vignette: 0.35 + tension * 0.2 + stillness * 0.15,
    },
    focusAzimuth: focusAzimuth(snapshot, score),
    southern: snapshot.location.lat < 0,
  };
}

/** CSS accent colours so the UI chrome belongs to the same light. */
export function cssAccent(mood) {
  const h = mood.horizon;
  const to255 = (v) => Math.round(clamp(v) * 255);
  const accent = [lerp(h[0], 1, 0.35), lerp(h[1], 1, 0.35), lerp(h[2], 1, 0.35)].map(to255);
  return {
    '--sky-top': `rgb(${mood.zenith.map(to255).join(', ')})`,
    '--sky-bottom': `rgb(${h.map(to255).join(', ')})`,
    '--accent': `rgba(${accent.join(', ')}, 0.6)`,
    '--accent-glow': `rgba(${accent.join(', ')}, 0.3)`,
  };
}
