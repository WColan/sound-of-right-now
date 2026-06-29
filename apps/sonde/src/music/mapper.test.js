import { describe, it, expect } from 'vitest';
import {
  mapSkyToMusic,
  BODY_TUNING,
  SUN_TUNING,
  ROOT_FREQ,
  SONDE_RAMP_DURATIONS,
  SONDE_META_PARAMS,
} from './mapper.js';
import { getSkySnapshot, getAspects, SOUNDING_BODIES } from '../sky/ephemeris.js';

describe('BODY_TUNING (music of the spheres)', () => {
  it('tunes every sounding body to an audible frequency', () => {
    for (const name of SOUNDING_BODIES) {
      expect(BODY_TUNING[name].freq).toBeGreaterThan(20);
      expect(BODY_TUNING[name].freq).toBeLessThan(2000);
    }
  });

  it('derives pitch from a just-intonation interval (ratio in [1, 2))', () => {
    for (const name of SOUNDING_BODIES) {
      expect(BODY_TUNING[name].justRatio).toBeGreaterThanOrEqual(1);
      expect(BODY_TUNING[name].justRatio).toBeLessThan(2);
    }
  });

  it('places Pluto at the Earth fundamental (1/1 = ROOT_FREQ)', () => {
    expect(BODY_TUNING.Pluto.justRatio).toBeCloseTo(1, 6);
    expect(BODY_TUNING.Pluto.freq).toBeCloseTo(ROOT_FREQ, 3);
  });

  it('voices Mercury (innermost) above Jupiter (register spread)', () => {
    expect(BODY_TUNING.Mercury.freq).toBeGreaterThan(BODY_TUNING.Jupiter.freq);
  });

  it('anchors the Sun drone at the fundamental', () => {
    expect(SUN_TUNING.freq).toBeCloseTo(ROOT_FREQ, 3);
    expect(SUN_TUNING.subFreq).toBeCloseTo(ROOT_FREQ / 2, 3);
  });
});

describe('mapSkyToMusic', () => {
  const date = new Date('2022-12-01T00:00:00Z');
  const snapshot = getSkySnapshot(date);
  const aspects = getAspects(snapshot);
  const params = mapSkyToMusic(snapshot, aspects);

  it('emits a pan in [-1, 1] for every body', () => {
    for (const name of SOUNDING_BODIES) {
      expect(params[`${name}Pan`]).toBeGreaterThanOrEqual(-1);
      expect(params[`${name}Pan`]).toBeLessThanOrEqual(1);
    }
  });

  it('opens inner-planet filters brighter than outer-planet filters', () => {
    expect(params.MercuryCutoff).toBeGreaterThan(params.NeptuneCutoff);
  });

  it('shimmers fast inner planets and steadies slow outer planets', () => {
    expect(params.MercuryPulseHz).toBeGreaterThan(params.NeptunePulseHz);
    expect(params.MercuryPulseDepth).toBeGreaterThan(params.NeptunePulseDepth);
  });

  it('bends retrograde bodies flat and leaves prograde bodies in tune', () => {
    // Mars is retrograde on this date.
    expect(params.MarsDetune).toBeLessThan(0);
    expect(params._meta.retrogradeBodies).toContain('Mars');
    // Mercury is prograde on this date.
    expect(params.MercuryDetune).toBe(0);
  });

  it('keeps aspect tension within [0, 1]', () => {
    expect(params.aspectTension).toBeGreaterThanOrEqual(0);
    expect(params.aspectTension).toBeLessThanOrEqual(1);
  });

  it('scales the lunar voice with moon illumination', () => {
    const newMoon = mapSkyToMusic({ ...snapshot, moon: { ...snapshot.moon, illumination: 0 } }, []);
    const fullMoon = mapSkyToMusic({ ...snapshot, moon: { ...snapshot.moon, illumination: 1 } }, []);
    expect(fullMoon.lunarVolume).toBeGreaterThan(newMoon.lunarVolume);
    expect(fullMoon.lunarCutoff).toBeGreaterThan(newMoon.lunarCutoff);
  });

  it('classifies every non-meta param it emits (no orphan params)', () => {
    for (const key of Object.keys(params)) {
      if (SONDE_META_PARAMS.has(key)) continue;
      expect(key in SONDE_RAMP_DURATIONS).toBe(true);
    }
  });

  it('attaches display metadata without leaking it to the engine', () => {
    expect(params._meta).toBeDefined();
    expect(params._meta.simTime).toBe(date);
    expect(Array.isArray(params._meta.aspects)).toBe(true);
  });

  it('is pure: same input → identical output, input untouched', () => {
    const before = JSON.stringify(snapshot);
    const a = mapSkyToMusic(snapshot, aspects);
    const b = mapSkyToMusic(snapshot, aspects);
    expect(a).toEqual(b);
    expect(JSON.stringify(snapshot)).toBe(before);
  });
});
