import { describe, it, expect } from 'vitest';
import { describeBody, findBodyAt, justIntervalName } from './influence.js';
import { mapSkyToMusic } from '../music/mapper.js';
import { getSkySnapshot } from '../sky/ephemeris.js';

const snapshot = getSkySnapshot(new Date('2022-12-01T00:00:00Z')); // Mars retrograde
const params = mapSkyToMusic(snapshot, []);

describe('justIntervalName', () => {
  it('maps cents to the nearest just interval', () => {
    expect(justIntervalName(0)).toBe('unison');
    expect(justIntervalName(112)).toBe('minor 2nd');
    expect(justIntervalName(702)).toBe('perfect 5th');
    expect(justIntervalName(690)).toBe('perfect 5th'); // nearest, not exact
    expect(justIntervalName(1190)).toBe('octave');
  });
});

describe('describeBody', () => {
  it('describes a planet with pitch, position, pan and motion', () => {
    const d = describeBody('Mars', snapshot, params);
    expect(d.title).toBe('Mars');
    const labels = d.lines.map((l) => l.label);
    expect(labels).toEqual(expect.arrayContaining(['Pitch', 'Position', 'Pan', 'Motion']));
  });

  it('reports retrograde motion for a retrograde planet', () => {
    const motion = describeBody('Mars', snapshot, params).lines.find((l) => l.label === 'Motion');
    expect(motion.value.toLowerCase()).toContain('retrograde');
  });

  it('reports prograde motion for a prograde planet', () => {
    const motion = describeBody('Mercury', snapshot, params).lines.find((l) => l.label === 'Motion');
    expect(motion.value.toLowerCase()).toContain('prograde');
  });

  it('notes the Galilean polyrhythm only for Jupiter', () => {
    expect(describeBody('Jupiter', snapshot, params).lines.some((l) => /galilean/i.test(l.value))).toBe(true);
    expect(describeBody('Saturn', snapshot, params).lines.some((l) => /galilean/i.test(l.value))).toBe(false);
  });

  it('frames the Sun as the fundamental drone', () => {
    const d = describeBody('Sun', snapshot, params);
    expect(d.title).toBe('Sun');
    expect(JSON.stringify(d).toLowerCase()).toContain('fundamental');
  });

  it('frames Earth as the silent vantage point', () => {
    const d = describeBody('Earth', snapshot, params);
    expect(d.subtitle.toLowerCase()).toContain('vantage');
    expect(JSON.stringify(d).toLowerCase()).toContain("doesn't sound");
  });

  it('reports the Moon illumination percentage', () => {
    const d = describeBody('Moon', snapshot, params);
    const pct = Math.round(snapshot.moon.illumination * 100);
    expect(JSON.stringify(d)).toContain(`${pct}%`);
  });

  it('survives a null params (before the first audio sample)', () => {
    const d = describeBody('Mars', snapshot, null);
    expect(d.title).toBe('Mars');
    expect(d.lines.some((l) => l.label === 'Pitch')).toBe(true); // pitch needs no params
  });
});

describe('findBodyAt', () => {
  const targets = [
    { name: 'Sun', x: 100, y: 100, hitR: 20 },
    { name: 'Mars', x: 200, y: 100, hitR: 14 },
  ];

  it('returns the body under the point', () => {
    expect(findBodyAt(105, 102, targets).name).toBe('Sun');
  });

  it('returns the nearest when two are in range', () => {
    const close = [
      { name: 'A', x: 100, y: 100, hitR: 50 },
      { name: 'B', x: 110, y: 100, hitR: 50 },
    ];
    expect(findBodyAt(108, 100, close).name).toBe('B');
  });

  it('returns null when no target is within its radius', () => {
    expect(findBodyAt(160, 100, targets)).toBeNull();
  });
});
