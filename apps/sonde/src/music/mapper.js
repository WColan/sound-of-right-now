/**
 * Sky → music mapper (pure).
 *
 * The musical philosophy is "music of the spheres," and it is deliberately
 * unlike SONAR's diatonic mood-progressions:
 *
 *   • PITCH is FIXED by orbital geometry. Each body's sidereal period becomes a
 *     just-intonation interval relative to Earth's year (the fundamental). The
 *     solar system is therefore a single, perpetually-sounding consonant chord —
 *     the "tuning" of the heavens. This never changes; it IS the harmony.
 *
 *   • MOTION is what the listener hears evolve: heliocentric longitude pans each
 *     body around the field, heliocentric distance opens/closes its filter,
 *     orbital speed sets its shimmer (tremolo) rate, and retrograde motion bends
 *     it flat. Alignments (aspects) bloom as events, handled by the engine.
 *
 * This module imports no audio library and has no side effects, so the whole
 * mapping is unit-testable in isolation.
 */
import { quantizeRatioToJust, ratioToCents } from '@son/core/scale';
import { BODY_DATA, SOUNDING_BODIES, FUNDAMENTAL_PERIOD_YEARS } from '../sky/ephemeris.js';

/** Earth-fundamental anchor: the 1/1 sounds at this frequency (≈ C1). */
export const ROOT_FREQ = 32.703; // Hz

/** Whole-octave register per body so the chord spreads across the spectrum. */
const REGISTER = {
  Mercury: 3, Venus: 2, Mars: 2, Jupiter: 1, Saturn: 1, Uranus: 0, Neptune: 0, Pluto: 0,
};

/** Baseline voice level per body (dB). Outer bodies underpin; inner bodies glint. */
const BASE_VOLUME = {
  Mercury: -20, Venus: -15, Mars: -17, Jupiter: -13, Saturn: -13, Uranus: -16, Neptune: -16, Pluto: -22,
};

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
function lerp(a, b, t) { return a + (b - a) * clamp(t, 0, 1); }

/** Map x from [inLo, inHi] to [outLo, outHi], clamped. */
function mapRange(x, inLo, inHi, outLo, outHi) {
  if (inHi === inLo) return outLo;
  return lerp(outLo, outHi, (x - inLo) / (inHi - inLo));
}

/**
 * Fixed tuning of the solar system. Computed once from orbital periods:
 * freq ∝ 1/period, octave-reduced, snapped to the nearest just interval, then
 * placed in the body's register. Exported so the engine can build voices at the
 * right pitches; the per-tick mapper only modulates around these.
 */
export const BODY_TUNING = (() => {
  const out = {};
  for (const name of SOUNDING_BODIES) {
    const rawRatio = FUNDAMENTAL_PERIOD_YEARS / BODY_DATA[name].period; // frequency ∝ 1/period
    const just = quantizeRatioToJust(rawRatio);
    const freq = ROOT_FREQ * just * Math.pow(2, REGISTER[name]);
    out[name] = { freq, justRatio: just, register: REGISTER[name], cents: ratioToCents(just) };
  }
  return out;
})();

/** The Sun is the gravitational centre — a constant root drone at the fundamental. */
export const SUN_TUNING = { freq: ROOT_FREQ, subFreq: ROOT_FREQ / 2 };

/**
 * Map a sky snapshot (+ detected aspects) to time-varying musical parameters.
 *
 * @param {object} snapshot - from getSkySnapshot()
 * @param {Array} aspects - from getAspects()
 * @param {object} [opts]
 * @returns {object} musical params (keys classified by the interpolator config below)
 */
export function mapSkyToMusic(snapshot, aspects = [], opts = {}) {
  const params = {};
  const retrogradeBodies = [];

  for (const name of SOUNDING_BODIES) {
    const b = snapshot.bodies[name];
    if (!b) continue;

    // Longitude → pan: project the orbital angle onto the stereo field (an
    // audible orrery). sin() gives a smooth left↔right sweep over one orbit.
    const pan = Math.sin((b.lonHelio * Math.PI) / 180);

    // Heliocentric distance → low-pass cutoff: near the Sun = bright, far = dark.
    // Log scale spans Mercury (~0.39 AU) to Pluto (~39 AU).
    const distNorm = clamp((Math.log10(b.distanceAU) - Math.log10(0.3)) / (Math.log10(40) - Math.log10(0.3)), 0, 1);
    const cutoff = mapRange(distNorm, 0, 1, 6000, 380);

    // Orbital angular velocity → shimmer (tremolo) rate + depth. Fast inner
    // planets glint; slow outer planets are near-steady drones. Log-mapped.
    const velNorm = clamp((Math.log10(Math.max(b.angularVelDegPerDay, 1e-4)) - Math.log10(0.005)) / (Math.log10(4) - Math.log10(0.005)), 0, 1);
    const pulseHz = lerp(0.05, 6, velNorm);
    const pulseDepth = lerp(0.12, 0.6, velNorm);

    // Retrograde → bend flat (the planet "turns back").
    const detune = b.retrograde ? -28 : 0;
    if (b.retrograde) retrogradeBodies.push(name);

    // Distance also subtly trims level so eccentric orbits breathe.
    const volume = BASE_VOLUME[name] - distNorm * 3;

    params[`${name}Pan`] = pan;
    params[`${name}Cutoff`] = cutoff;
    params[`${name}PulseHz`] = pulseHz;
    params[`${name}PulseDepth`] = pulseDepth;
    params[`${name}Detune`] = detune;
    params[`${name}Volume`] = volume;
  }

  // ── Aspect tension → ambient colour ──
  // Tense aspects (squares/oppositions) darken and wetten the whole field;
  // consonant ones leave it open. Weighted by aspect strength (exactness).
  let tension = 0;
  let consonance = 0;
  for (const a of aspects) {
    if (a.harmony === 'tense') tension = Math.max(tension, a.strength);
    else consonance = Math.max(consonance, a.strength);
  }
  params.aspectTension = tension;
  params.masterCutoff = mapRange(tension, 0, 1, 9000, 3200);
  params.reverbWet = mapRange(consonance - tension * 0.5, -1, 1, 0.22, 0.5);

  // ── Moon → lunar shimmer voice: dark at new, radiant at full ──
  params.lunarVolume = lerp(-44, -15, snapshot.moon.illumination);
  params.lunarCutoff = lerp(700, 5200, snapshot.moon.illumination);

  // ── Metadata (display only; never reaches the audio engine) ──
  params._meta = {
    simTime: snapshot.date,
    retrogradeBodies,
    moonIllumination: snapshot.moon.illumination,
    aspects: aspects.slice(0, 4).map((a) => ({
      a: a.a, b: a.b, name: a.name, strength: a.strength,
    })),
    tension,
    consonance,
  };

  return params;
}

// ─────────────────────────────────────────────────────────────────────────────
// Interpolator classification for SONDE's params.
// ─────────────────────────────────────────────────────────────────────────────

/** Per-key ramp durations (seconds). Short enough to keep up under time-warp. */
export const SONDE_RAMP_DURATIONS = (() => {
  const d = {
    aspectTension: 1.0,
    masterCutoff: 1.5,
    reverbWet: 2.0,
    lunarVolume: 1.5,
    lunarCutoff: 1.5,
  };
  for (const name of SOUNDING_BODIES) {
    d[`${name}Pan`] = 0.4;
    d[`${name}Cutoff`] = 0.6;
    d[`${name}PulseHz`] = 0.6;
    d[`${name}PulseDepth`] = 0.6;
    d[`${name}Detune`] = 0.5;
    d[`${name}Volume`] = 0.8;
  }
  return d;
})();

/** SONDE has no snap-at-boundary discrete params: pitch is fixed, motion is smooth. */
export const SONDE_DISCRETE_PARAMS = new Set();

/** Display-only keys ignored by the engine. */
export const SONDE_META_PARAMS = new Set(['_meta']);
