import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as Tone from 'tone';
import { createOrchestra, entrancePlan } from './engine.js';
import { composeScore, SECTION_IDS } from '../score.js';
import { arrangeStage, createStageState } from '../stage.js';
import { makeSnapshot } from '../../test/now-fixtures.js';
import { levelToDb, dbToGain, pitchesInRange, nearestPitch } from './toolkit.js';
import { voicePart, chordPalette } from './sections/strings.js';
import { spherePitch } from './sections/sky.js';
import { birdCast } from './sections/life.js';
import { dueStrike, quakeDelaySeconds } from './sections/town.js';

vi.mock('tone', async () => (await import('../../test/fake-tone.js')).createFakeToneModule());

function fakeLibrary() {
  const waiters = new Map();
  return {
    onReady: (name, fn) => waiters.set(name, [...(waiters.get(name) ?? []), fn]),
    load: vi.fn(async () => true),
    fire(name, notes = ['C4', 'G4']) {
      const buffers = { get: (k) => ({ key: k }) };
      (waiters.get(name) ?? []).forEach((fn) => fn({ buffers, notes, unpitched: false }));
    },
  };
}

function scenario(overrides) {
  const score = composeScore(makeSnapshot(overrides), { rng: () => 0.3 });
  const stage = arrangeStage(score, createStageState(), 0);
  return { score, stage };
}

describe('toolkit', () => {
  it('maps levels to perceptual dB and back', () => {
    expect(levelToDb(0)).toBe(-80);
    expect(levelToDb(1)).toBe(0);
    expect(levelToDb(0.5)).toBeCloseTo(-6.02, 1);
    expect(dbToGain(-80)).toBe(0);
    expect(dbToGain(0)).toBe(1);
  });

  it('finds chord pitches in a range and the nearest one', () => {
    expect(pitchesInRange(['C4', 'E4', 'G4'], 60, 72)).toEqual([60, 64, 67, 72]);
    expect(nearestPitch(['C4', 'E4', 'G4'], 66)).toBe(67);
  });

  it('voices string parts smoothly and spaced', () => {
    const v = voicePart(['C4', 'E4', 'G4', 'B4'], [55, 72], [64, 67], 2);
    expect(v).toHaveLength(2);
    expect(Math.abs(v[1] - v[0])).toBeGreaterThanOrEqual(3);
    v.forEach((m) => expect(m).toBeGreaterThanOrEqual(55));
  });

  it('folds Kepler pitches into a singable register on the scale', () => {
    const scale = ['C4', 'D4', 'E4', 'F4', 'G4', 'A4', 'B4'];
    const venus = spherePitch('C', 8.4, scale);
    const mercury = spherePitch('C', 24.7, scale);
    expect(venus).toBeGreaterThanOrEqual(62);
    expect(venus).toBeLessThanOrEqual(96);
    expect(mercury).toBeGreaterThan(venus);
    expect([0, 2, 4, 5, 7, 9, 11]).toContain(venus % 12);
  });

  it('gives each place a stable cast of bird songs', () => {
    expect(birdCast(['Robin', 'Wren'])).toEqual(birdCast(['Robin', 'Wren']));
    expect(birdCast([], 'boston')).toHaveLength(4);
    expect(birdCast(['Robin'])[0].baseHz).toBeGreaterThan(1500);
  });

  it('strikes bells only on fresh quarter-hour boundaries', () => {
    expect(dueStrike(15.0, null)).toMatchObject({ quarter: 0, hourCount: 3 });
    expect(dueStrike(15.0, '15:0')).toBeNull();
    expect(dueStrike(15.25, '15:0')).toMatchObject({ quarter: 15 });
    expect(dueStrike(15.1, null)).toBeNull();
  });

  it('chord palette: bare fifths in thin air, added ninth in heavy air', () => {
    const chord = { notes: ['C4', 'E4', 'G4', 'B4'], scaleTones: ['C4', 'D4', 'E4', 'F4', 'G4', 'A4', 'B4'] };
    expect(chordPalette(chord, 0.9)).toEqual(['C4', 'G4']);
    expect(chordPalette(chord, 0.5)).toEqual(chord.notes);
    expect(chordPalette(chord, 0.1)).toEqual([...chord.notes, 'D4']);
  });

  it('quakes take longer to arrive from farther away', () => {
    expect(quakeDelaySeconds(30)).toBeLessThan(quakeDelaySeconds(3000));
    expect(quakeDelaySeconds(99999)).toBe(25);
  });
});

describe('orchestra', () => {
  let lib;
  beforeEach(() => {
    lib = fakeLibrary();
    Tone.__scheduled.clear();
    Tone.__transport.seconds = 0;
  });

  it('builds every section and satisfies the voice contract', () => {
    const o = createOrchestra({ library: lib, rng: () => 0.4 });
    expect(Object.keys(o.sections).sort()).toEqual([...SECTION_IDS].sort());
    for (const s of Object.values(o.sections)) {
      for (const m of ['update', 'onChord', 'start', 'stop', 'pause', 'resume', 'dispose', 'play', 'playChord']) {
        expect(typeof s[m]).toBe('function');
      }
      expect(s.output).toBeDefined();
    }
    o.dispose();
  });

  it('starts, plays chords through every section and loads samples', () => {
    const o = createOrchestra({ library: lib, rng: () => 0.4 });
    const chords = [];
    o.onChordChange((c) => chords.push(c));
    const { score, stage } = scenario({ weather: { category: 'rain', precipitation: 4 } });
    o.start(score, stage);
    expect(lib.load).toHaveBeenCalled();
    expect(chords.length).toBe(1);
    expect(chords[0].scaleTones.length).toBeGreaterThan(0);
    expect(o.harmony.root).toBe(score.harmony.root);
    o.dispose();
  });

  it('a place introduces itself: strings first, then what is featured here', () => {
    const { score, stage } = scenario({ weather: { windSpeed: 35, windGusts: 60 }, marine: { waveHeight: 3, wavePeriod: 12, waveDirection: 90 } });
    const plan = entrancePlan(score, stage);
    expect(plan[0].id).toBe('strings');
    const at = Object.fromEntries(plan.map((p) => [p.id, p.at]));
    stage.foreground.filter((id) => id !== 'strings').forEach((id) => expect(at[id]).toBeLessThan(at.basses ?? Infinity));
  });

  it('starts silent and fades sections in on their entrance', () => {
    const o = createOrchestra({ library: lib, rng: () => 0.4 });
    const { score, stage } = scenario({});
    o.start(score, stage);
    expect(o.sections.strings.base.state.entryDb).toBe(-60);
    Tone.__advance(1);
    expect(o.sections.strings.base.state.entryDb).toBe(0);
    expect(o.sections.basses.base.state.entryDb).toBe(-60);
    Tone.__advance(40);
    expect(o.sections.basses.base.state.entryDb).toBe(0);
    o.dispose();
  });

  it('silent sections are gated to zero gain; active ones are audible', () => {
    const o = createOrchestra({ library: lib, rng: () => 0.4 });
    const { score, stage } = scenario({});
    o.start(score, stage, { entrance: false });
    expect(o.sections.iss.base.output.gain.value).toBe(0);
    expect(o.sections.strings.base.output.gain.value).toBeGreaterThan(0);
    o.dispose();
  });

  it('muting a section silences it and unmuting restores it', () => {
    const o = createOrchestra({ library: lib, rng: () => 0.4 });
    const { score, stage } = scenario({});
    o.start(score, stage, { entrance: false });
    o.setSectionMuted('strings', true);
    expect(o.sections.strings.base.output.gain.value).toBe(0);
    o.setSectionMuted('strings', false);
    expect(o.sections.strings.base.output.gain.value).toBeGreaterThan(0);
    o.dispose();
  });

  it('switches from synth fallback to samples when buffers arrive', () => {
    const o = createOrchestra({ library: lib, rng: () => 0.4 });
    const before = Tone.__created.filter((n) => n.ctorName === 'Sampler').length;
    lib.fire('violins', ['A3', 'A4']);
    const after = Tone.__created.filter((n) => n.ctorName === 'Sampler').length;
    expect(after).toBe(before + 1);
    o.dispose();
  });

  it('rain droplets are scheduled at a rate that follows precipitation', () => {
    const o = createOrchestra({ library: lib, rng: () => 0.5 });
    const { score, stage } = scenario({ weather: { category: 'rain', precipitation: 8 } });
    o.start(score, stage);
    const harps = () => Tone.__created
      .filter((n) => n.ctorName === 'PolySynth')
      .reduce((a, n) => a + n.triggers.length, 0);
    const t0 = harps();
    Tone.__advance(20);
    expect(harps()).toBeGreaterThan(t0 + 10);
    o.dispose();
  });

  it('a storm emits lightning before its thunder', () => {
    const o = createOrchestra({ library: lib, rng: () => 0.5 });
    const events = [];
    o.onEvent((e) => events.push(e));
    const { score, stage } = scenario({ weather: { category: 'storm', cape: 2500, precipitation: 10 } });
    o.start(score, stage);
    o.triggerThunder();
    const lightning = events.find((e) => e.type === 'lightning');
    expect(lightning).toBeDefined();
    expect(lightning.delay).toBeCloseTo(lightning.distanceKm * 2.9);
    o.dispose();
  });

  it('a quake arrives after its travel delay and reports itself', () => {
    const o = createOrchestra({ library: lib, rng: () => 0.5 });
    const events = [];
    o.onEvent((e) => events.push(e));
    const { score, stage } = scenario({});
    o.start(score, stage);
    const delay = o.triggerQuake({ mag: 4.8, distanceKm: 600, intensity: 0.6 });
    expect(delay).toBeCloseTo(4);
    Tone.__advance(delay - 0.5);
    expect(events.some((e) => e.type === 'quake-arrival')).toBe(false);
    Tone.__advance(1);
    expect(events.some((e) => e.type === 'quake-arrival')).toBe(true);
    o.dispose();
  });

  it('rings the hour on the boundary, not on arrival', () => {
    const o = createOrchestra({ library: lib, rng: () => 0.5 });
    const { score, stage } = scenario({});
    o.start(score, stage);
    o.primeClock(14.99);
    expect(o.tickClock(14.995)).toBe(0);
    expect(o.tickClock(15.001)).toBeGreaterThan(10); // quarters + 3 strikes
    expect(o.tickClock(15.002)).toBe(0);
    o.dispose();
  });

  it('conductor stillness pulls non-bed sections down more than the bed', () => {
    const o = createOrchestra({ library: lib, rng: () => 0.4 });
    const { score, stage } = scenario({ weather: { windSpeed: 30, windGusts: 50 } });
    o.start(score, stage, { entrance: false });
    const strings0 = o.sections.strings.base.output.gain.value;
    const winds0 = o.sections.winds.base.output.gain.value;
    o.setExpression({ dynamicSwell: 0 }, 1);
    expect(o.sections.winds.base.output.gain.value / winds0).toBeLessThan(o.sections.strings.base.output.gain.value / strings0);
    o.dispose();
  });

  it('pause and resume without throwing, then dispose cleanly', () => {
    const o = createOrchestra({ library: lib, rng: () => 0.4 });
    const { score, stage } = scenario({ sun: { altitude: -30 }, moon: { altitude: 40, illumination: 1 } });
    o.start(score, stage);
    o.stop();
    expect(Tone.__transport.state).toBe('paused');
    o.resume();
    expect(Tone.__transport.state).toBe('started');
    o.playRecap(['moon', 'winds', 'horns']);
    o.dispose();
  });
});
