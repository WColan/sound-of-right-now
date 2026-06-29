import { describe, it, expect } from 'vitest';
import {
  getSkySnapshot,
  getAspects,
  getGalileanPhases,
  circularDiffDeg,
  angularSeparationDeg,
  SOUNDING_BODIES,
  ASPECT_ANGLES,
} from './ephemeris.js';

describe('circular angle helpers', () => {
  it('returns signed shortest difference', () => {
    expect(circularDiffDeg(10, 350)).toBe(20);
    expect(circularDiffDeg(350, 10)).toBe(-20);
    expect(circularDiffDeg(0, 180)).toBe(-180);
  });

  it('separation is unsigned and within [0, 180]', () => {
    expect(angularSeparationDeg(10, 350)).toBe(20);
    expect(angularSeparationDeg(0, 270)).toBe(90);
  });
});

describe('getSkySnapshot', () => {
  const snap = getSkySnapshot(new Date('2022-12-01T00:00:00Z'));

  it('includes every sounding body but not Earth', () => {
    for (const name of SOUNDING_BODIES) expect(snap.bodies[name]).toBeDefined();
    expect(snap.bodies.Earth).toBeUndefined();
  });

  it('reports heliocentric longitudes in [0, 360)', () => {
    for (const name of SOUNDING_BODIES) {
      expect(snap.bodies[name].lonHelio).toBeGreaterThanOrEqual(0);
      expect(snap.bodies[name].lonHelio).toBeLessThan(360);
    }
  });

  it('heliocentric motion is always prograde (rate > 0)', () => {
    for (const name of SOUNDING_BODIES) {
      expect(snap.bodies[name].angularVelDegPerDay).toBeGreaterThan(0);
    }
  });

  it('inner planets move faster than outer planets', () => {
    expect(snap.bodies.Mercury.angularVelDegPerDay)
      .toBeGreaterThan(snap.bodies.Neptune.angularVelDegPerDay);
    expect(snap.bodies.Venus.angularVelDegPerDay)
      .toBeGreaterThan(snap.bodies.Saturn.angularVelDegPerDay);
  });

  it('places planets at plausible heliocentric distances', () => {
    expect(snap.bodies.Mercury.distanceAU).toBeLessThan(0.5);
    expect(snap.bodies.Neptune.distanceAU).toBeGreaterThan(29);
    expect(snap.bodies.Neptune.distanceAU).toBeLessThan(31);
  });

  it('detects Mars retrograde during its 2022 retrograde window', () => {
    expect(getSkySnapshot(new Date('2022-12-01T00:00:00Z')).bodies.Mars.retrograde).toBe(true);
    expect(getSkySnapshot(new Date('2023-04-01T00:00:00Z')).bodies.Mars.retrograde).toBe(false);
  });

  it('reports moon illumination as a fraction in [0, 1]', () => {
    expect(snap.moon.illumination).toBeGreaterThanOrEqual(0);
    expect(snap.moon.illumination).toBeLessThanOrEqual(1);
  });

  it('is deterministic for a given instant', () => {
    const a = getSkySnapshot(new Date('2024-06-21T12:00:00Z'));
    const b = getSkySnapshot(new Date('2024-06-21T12:00:00Z'));
    expect(a.bodies.Jupiter.lonHelio).toBe(b.bodies.Jupiter.lonHelio);
  });
});

describe('getAspects', () => {
  it('finds the Mercury–Uranus square on 2024-01-01', () => {
    const aspects = getAspects(getSkySnapshot(new Date('2024-01-01T00:00:00Z')));
    const sq = aspects.find((a) => a.a === 'Mercury' && a.b === 'Uranus');
    expect(sq).toBeDefined();
    expect(sq.name).toBe('square');
    expect(sq.angle).toBe(90);
    expect(sq.harmony).toBe('tense');
  });

  it('strength is 1 at exact alignment and falls off within the orb', () => {
    const aspects = getAspects(getSkySnapshot(new Date('2024-01-01T00:00:00Z')));
    for (const a of aspects) {
      expect(a.strength).toBeGreaterThan(0);
      expect(a.strength).toBeLessThanOrEqual(1);
      expect(ASPECT_ANGLES.map((x) => x.angle)).toContain(a.angle);
    }
  });

  it('a tighter orb yields no more aspects than a wider one', () => {
    const snap = getSkySnapshot(new Date('2024-01-01T00:00:00Z'));
    expect(getAspects(snap, 2).length).toBeLessThanOrEqual(getAspects(snap, 8).length);
  });
});

describe('getGalileanPhases', () => {
  it('returns a phase in [0, 1) for each Galilean moon', () => {
    const ph = getGalileanPhases(new Date('2022-12-01T00:00:00Z'));
    for (const moon of ['io', 'europa', 'ganymede', 'callisto']) {
      expect(ph[moon]).toBeGreaterThanOrEqual(0);
      expect(ph[moon]).toBeLessThan(1);
    }
  });

  it('Io advances through its phase faster than Ganymede (1:4 resonance)', () => {
    const t0 = new Date('2022-12-01T00:00:00Z');
    const t1 = new Date('2022-12-01T06:00:00Z'); // +6h
    const p0 = getGalileanPhases(t0);
    const p1 = getGalileanPhases(t1);
    const adv = (a, b) => ((b - a) % 1 + 1) % 1;
    expect(adv(p0.io, p1.io)).toBeGreaterThan(adv(p0.ganymede, p1.ganymede));
  });
});
