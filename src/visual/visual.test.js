import { describe, it, expect } from 'vitest';
import { computeMood, skyColors, horizonToEquatorialMatrix, focusAzimuth, cssAccent, TERRAIN } from './mood.js';
import { cameraBasis, equatorialVector, bvToRgb } from './renderer.js';
import { composeScore } from '../music/score.js';
import { makeSnapshot } from '../test/now-fixtures.js';
import { equatorialToHorizontal } from '../now/sky.js';

const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
function mulT(m, v) { // transpose(M) * v for column-major mat3
  return [dot(m.slice(0, 3), v), dot(m.slice(3, 6), v), dot(m.slice(6, 9), v)];
}

describe('sky colours', () => {
  it('day is bright blue overhead, night is near-black, sunset is warm at the horizon', () => {
    const day = skyColors(50), night = skyColors(-30), sunset = skyColors(-1);
    expect(day.zenith[2]).toBeGreaterThan(day.zenith[0]);
    expect(Math.max(...night.zenith)).toBeLessThan(0.05);
    expect(sunset.horizon[0]).toBeGreaterThan(sunset.horizon[2]);
    expect(sunset.golden).toBeGreaterThan(0.5);
  });
});

describe('true-sky projection', () => {
  it('matches the analytic equatorial → horizontal conversion for a star', () => {
    const lst = 7.3, lat = 42.4;
    const m = horizonToEquatorialMatrix(lst, lat);
    // Sirius
    const ra = 101.29, dec = -16.72;
    const h = mulT(m, equatorialVector(ra, dec));
    const alt = Math.asin(h[1]) * 180 / Math.PI;
    const az = (Math.atan2(h[0], h[2]) * 180 / Math.PI + 360) % 360;
    const ref = equatorialToHorizontal(ra, dec, lst, lat);
    expect(alt).toBeCloseTo(ref.altitude, 1);
    expect(az).toBeCloseTo(ref.azimuth, 1);
  });

  it('camera basis is orthonormal and faces its yaw', () => {
    const c = cameraBasis(90, 10);
    expect(dot(c.right, c.up)).toBeCloseTo(0);
    expect(dot(c.fwd, c.up)).toBeCloseTo(0);
    expect(c.fwd[0]).toBeGreaterThan(0.9); // east
    expect(c.fwd[1]).toBeGreaterThan(0);   // pitched up
  });

  it('star colours run blue-white to orange with B−V', () => {
    expect(bvToRgb(-0.3)[2]).toBeGreaterThan(bvToRgb(1.8)[2]);
    expect(bvToRgb(1.8)[0]).toBeGreaterThan(0.9);
  });
});

describe('mood', () => {
  it('faces the sun at sunset and south at midday', () => {
    const sunset = makeSnapshot({ sun: { altitude: 2, azimuth: 250 } });
    const noon = makeSnapshot({ sun: { altitude: 50, azimuth: 180 } });
    expect(Math.abs(focusAzimuth(sunset, composeScore(sunset)) - 250)).toBeLessThan(40);
    expect(Math.abs(focusAzimuth(noon, composeScore(noon)) - 180)).toBeLessThan(10);
  });

  it('dark adaptation: more stars appear the longer you listen', () => {
    const snap = makeSnapshot({ sun: { altitude: -30 }, weather: { cloudCover: 0 } });
    const score = composeScore(snap);
    expect(computeMood(snap, score, { listenMinutes: 15 }).limitingMag)
      .toBeGreaterThan(computeMood(snap, score, { listenMinutes: 0 }).limitingMag + 1);
  });

  it('bright modes warm the grade; tension raises contrast; stillness fades', () => {
    const warm = makeSnapshot({ weather: { temperature: 32, apparentTemperature: 32 } });
    const cold = makeSnapshot({ weather: { temperature: -15, apparentTemperature: -15 } });
    const mw = computeMood(warm, composeScore(warm));
    const mc = computeMood(cold, composeScore(cold));
    expect(mw.grade.warmth).toBeGreaterThan(mc.grade.warmth);
    const tense = computeMood(warm, composeScore(warm), { tension: 1 });
    expect(tense.grade.contrast).toBeGreaterThan(mw.grade.contrast);
    expect(computeMood(warm, composeScore(warm), { stillness: 1 }).grade.exposure).toBeLessThan(mw.grade.exposure);
  });

  it('weather becomes visual: rain, snow, fog, sea, terrain', () => {
    const rain = computeMood(makeSnapshot({ weather: { category: 'rain', precipitation: 5 } }), null);
    const snow = computeMood(makeSnapshot({ weather: { category: 'snow', snowfall: 1 } }), null);
    const fog = computeMood(makeSnapshot({ weather: { category: 'fog', visibility: 200 } }), null);
    const sea = computeMood(makeSnapshot({ marine: { waveHeight: 2, wavePeriod: 10, waveDirection: 90 }, location: { biome: 'coastal' } }), null);
    expect(rain.rain).toBeGreaterThan(0.5);
    expect(snow.snow).toBeGreaterThan(0.2);
    expect(snow.rain).toBe(0);
    expect(fog.fog).toBeGreaterThan(0.8);
    expect(sea.water.present).toBe(true);
    expect(sea.water.wavePeriod).toBe(10);
    expect(sea.terrain.kind).toBe(TERRAIN.coastal);
  });

  it('produces CSS accent variables', () => {
    const m = computeMood(makeSnapshot(), null);
    const css = cssAccent(m);
    expect(css['--accent']).toMatch(/^rgba\(/);
  });
});
