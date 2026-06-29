/**
 * Ephemeris — a thin, pure wrapper over astronomy-engine that turns a moment in
 * time into a normalized snapshot of the solar system's geometry.
 *
 * No Tone.js, no DOM: everything here is deterministic and unit-testable. The
 * mapper consumes these snapshots; the engine never sees astronomy-engine.
 *
 * All positions are computed locally (VSOP87-based, ±1 arcmin) — no network,
 * no API keys, offline-capable.
 */
import {
  Body,
  EclipticLongitude,
  HelioDistance,
  GeoVector,
  Ecliptic,
  Illumination,
  JupiterMoons,
} from 'astronomy-engine';

/**
 * The bodies SONDE listens to, with their sidereal orbital periods in (Earth)
 * years. Earth is the harmonic reference (period 1.0) and is the listener's
 * vantage point — it is intentionally NOT in the sounding set. The Sun is the
 * gravitational centre and is voiced as a constant root drone by the mapper.
 *
 * Periods are astronomical facts; how they become pitch lives in the mapper.
 */
export const BODY_DATA = {
  Mercury: { period: 0.240846, body: Body.Mercury },
  Venus:   { period: 0.615198, body: Body.Venus },
  Earth:   { period: 1.000000, body: Body.Earth },
  Mars:    { period: 1.880848, body: Body.Mars },
  Jupiter: { period: 11.862615, body: Body.Jupiter },
  Saturn:  { period: 29.447498, body: Body.Saturn },
  Uranus:  { period: 84.016846, body: Body.Uranus },
  Neptune: { period: 164.79132, body: Body.Neptune },
  Pluto:   { period: 247.92065, body: Body.Pluto },
};

/** Bodies that actually sound (Earth excluded — it is "us"). */
export const SOUNDING_BODIES = ['Mercury', 'Venus', 'Mars', 'Jupiter', 'Saturn', 'Uranus', 'Neptune', 'Pluto'];

/** Reference period for the harmonic fundamental (Earth's year). */
export const FUNDAMENTAL_PERIOD_YEARS = BODY_DATA.Earth.period;

const MS_PER_DAY = 86400000;

/** Signed shortest angular difference a−b, folded into (−180, 180]. */
export function circularDiffDeg(a, b) {
  return ((((a - b) % 360) + 540) % 360) - 180;
}

/** Smallest unsigned separation between two ecliptic longitudes, in [0, 180]. */
export function angularSeparationDeg(a, b) {
  return Math.abs(circularDiffDeg(a, b));
}

/** Geocentric ecliptic longitude of a body (degrees, 0–360). */
function geoLongitude(body, date) {
  const ecl = Ecliptic(GeoVector(body, date, true));
  return ecl.elon;
}

/**
 * Build a full sky snapshot for a given Date.
 *
 * @param {Date} date
 * @returns {{
 *   date: Date,
 *   bodies: Record<string, {
 *     lonHelio: number, lonGeo: number, distanceAU: number,
 *     angularVelDegPerDay: number, retrograde: boolean
 *   }>,
 *   moon: { illumination: number, phaseAngle: number, lonGeo: number }
 * }}
 */
export function getSkySnapshot(date) {
  const dtDays = 0.5; // finite-difference half-step for velocity/retrograde
  const before = new Date(date.getTime() - dtDays * MS_PER_DAY);
  const after = new Date(date.getTime() + dtDays * MS_PER_DAY);

  const bodies = {};
  for (const name of SOUNDING_BODIES) {
    const { body } = BODY_DATA[name];

    const lonHelio = EclipticLongitude(body, date);
    const distanceAU = HelioDistance(body, date);

    // Heliocentric angular velocity (always prograde) via central difference.
    const helioRate =
      circularDiffDeg(EclipticLongitude(body, after), EclipticLongitude(body, before)) /
      (2 * dtDays);

    // Retrograde is a geocentric phenomenon: apparent longitude moving backward.
    const lonGeo = geoLongitude(body, date);
    const geoRate =
      circularDiffDeg(geoLongitude(body, after), geoLongitude(body, before)) /
      (2 * dtDays);

    bodies[name] = {
      lonHelio,
      lonGeo,
      distanceAU,
      angularVelDegPerDay: helioRate,
      retrograde: geoRate < 0,
    };
  }

  const moonIll = Illumination(Body.Moon, date);
  const moon = {
    illumination: moonIll.phase_fraction, // 0 (new) → 1 (full)
    phaseAngle: moonIll.phase_angle,       // 0–180°
    lonGeo: geoLongitude(Body.Moon, date),
  };

  // Earth is the listener's vantage, not a sounding voice — but the orrery
  // draws it so you can see where "you" are in the system.
  const earth = {
    lonHelio: EclipticLongitude(Body.Earth, date),
    distanceAU: HelioDistance(Body.Earth, date),
  };

  return { date, bodies, earth, moon };
}

/** The five classical "major" aspects, in degrees. */
export const ASPECT_ANGLES = [
  { name: 'conjunction', angle: 0, harmony: 'consonant' },
  { name: 'sextile', angle: 60, harmony: 'consonant' },
  { name: 'square', angle: 90, harmony: 'tense' },
  { name: 'trine', angle: 120, harmony: 'consonant' },
  { name: 'opposition', angle: 180, harmony: 'tense' },
];

/**
 * Detect aspects between sounding bodies using their heliocentric longitudes —
 * the real geometric alignments of the solar system. Returns the strongest
 * aspect per pair within `orbDeg`.
 *
 * @param {object} snapshot - from getSkySnapshot
 * @param {number} orbDeg - tolerance around each exact angle (default 6°)
 */
export function getAspects(snapshot, orbDeg = 6) {
  const names = SOUNDING_BODIES.filter((n) => snapshot.bodies[n]);
  const aspects = [];

  for (let i = 0; i < names.length; i++) {
    for (let j = i + 1; j < names.length; j++) {
      const a = snapshot.bodies[names[i]];
      const b = snapshot.bodies[names[j]];
      const sep = angularSeparationDeg(a.lonHelio, b.lonHelio);

      let best = null;
      for (const asp of ASPECT_ANGLES) {
        const delta = Math.abs(sep - asp.angle);
        if (delta <= orbDeg && (!best || delta < best.delta)) {
          best = { ...asp, delta, strength: 1 - delta / orbDeg };
        }
      }
      if (best) {
        aspects.push({
          a: names[i],
          b: names[j],
          name: best.name,
          angle: best.angle,
          harmony: best.harmony,
          separation: sep,
          strength: best.strength, // 1 = exact, → 0 at the edge of orb
        });
      }
    }
  }

  // Strongest (most exact) first.
  aspects.sort((x, y) => y.strength - x.strength);
  return aspects;
}

/** Galilean moon periods (days) — the Laplace 1:2:4 resonance lives here. */
export const GALILEAN_PERIODS = { io: 1.769, europa: 3.551, ganymede: 7.155, callisto: 16.689 };

/**
 * Orbital phase (0–1) of each Galilean moon, derived from its jovicentric
 * position vector. Io:Europa:Ganymede phases advance in a locked 4:2:1 rate —
 * the source of SONDE's polyrhythm.
 */
export function getGalileanPhases(date) {
  const jm = JupiterMoons(date);
  const phase = (v) => {
    const p = (Math.atan2(v.y, v.x) / (2 * Math.PI)) % 1;
    return p < 0 ? p + 1 : p;
  };
  return {
    io: phase(jm.io),
    europa: phase(jm.europa),
    ganymede: phase(jm.ganymede),
    callisto: phase(jm.callisto),
  };
}
