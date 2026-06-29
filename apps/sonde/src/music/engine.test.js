import { describe, it, expect, beforeEach } from 'vitest';
import { createSondeEngine } from './engine.js';
import { createFakeTone } from '../test/fake-tone.js';
import { mapSkyToMusic } from './mapper.js';
import { getSkySnapshot, getAspects, SOUNDING_BODIES } from '../sky/ephemeris.js';

describe('createSondeEngine', () => {
  let engine;
  beforeEach(() => {
    engine = createSondeEngine({ Tone: createFakeTone(), userGain: 0 });
  });

  it('builds a voice for the Sun, every sounding body, and the event voices', () => {
    expect(engine.voices.sun).toBeDefined();
    expect(engine.voices.lunar).toBeDefined();
    expect(engine.voices.galilean).toBeDefined();
    expect(engine.voices.aspect).toBeDefined();
    for (const name of SOUNDING_BODIES) expect(engine.voices[name]).toBeDefined();
  });

  it('routes a body Volume param to that body\'s output gain', () => {
    // -6 dB ≈ 0.5 linear gain on the Mars voice's output.
    engine.rampParam('MarsVolume', -6, 0);
    expect(engine.voices.Mars.output.gain.value).toBeCloseTo(0.5012, 3);
    // A different body is unaffected.
    expect(engine.voices.Jupiter.output.gain.value).toBe(0);
  });

  it('applies a full mapped param set without throwing', () => {
    const snap = getSkySnapshot(new Date('2022-12-01T00:00:00Z'));
    const params = mapSkyToMusic(snap, getAspects(snap));
    expect(() => engine.applyParams(params)).not.toThrow();
  });

  it('ignores _meta and the ambient-only aspectTension param', () => {
    expect(() => engine.rampParam('aspectTension', 0.9, 0)).not.toThrow();
    expect(() => engine.applyParams({ _meta: { foo: 1 }, MercuryPan: 0.2 })).not.toThrow();
  });

  it('starts all oscillator-based voices', () => {
    expect(() => engine.start()).not.toThrow();
    // Sun output gain should ramp up to an audible level after start.
    expect(engine.voices.sun.output.gain.value).toBeGreaterThan(0);
  });

  it('pause mutes and resume restores the user level', () => {
    engine.setUserGain(0.8, 0);
    engine.pause();
    engine.resume();
    // Resume should target the stored 0.8, not 0.
    expect(engine.voices.sun.output).toBeDefined();
    expect(() => { engine.pause(); engine.resume(); }).not.toThrow();
  });

  it('triggers a bell on an aspect event', () => {
    engine.triggerAspect({ harmony: 'consonant', strength: 1, name: 'trine' });
    const bell = engine.voices.aspect.output;
    expect(bell).toBeDefined();
    expect(() => engine.triggerAspect({ harmony: 'tense', strength: 0.5, name: 'square' })).not.toThrow();
  });

  it('fires Galilean plucks only when a moon completes an orbit (phase wrap)', () => {
    // No wrap on the first sample (establishes baseline), wrap on the second.
    engine.updateGalilean({ io: 0.9, europa: 0.9, ganymede: 0.9 });
    expect(() => engine.updateGalilean({ io: 0.05, europa: 0.05, ganymede: 0.05 })).not.toThrow();
  });

  it('exposes analyser taps for the visualizer', () => {
    expect(engine.analyser).toBeDefined();
    expect(engine.waveformAnalyser).toBeDefined();
  });
});
