import { describe, it, expect, vi, afterEach } from 'vitest';
import { localClock, humanActivity, meteorActivity, solsticeProximity, computeCalendar } from './calendar.js';
import { computeSky, equatorialToHorizontal, twilightName, darkness } from './sky.js';
import { buildSnapshot } from './snapshot.js';
import { createNowFeed } from './feed.js';
import { azimuthToPan, elevationAngleDeg, haversineKm, createRng } from './util.js';

describe('util', () => {
  it('haversine: Boston → New York ≈ 306 km', () => {
    expect(haversineKm(42.36, -71.06, 40.71, -74.01)).toBeGreaterThan(295);
    expect(haversineKm(42.36, -71.06, 40.71, -74.01)).toBeLessThan(315);
  });

  it('elevation angle: overhead is 90°, far away is below horizon', () => {
    expect(elevationAngleDeg(0, 420)).toBeCloseTo(90);
    expect(elevationAngleDeg(3000, 420)).toBeLessThan(0);
  });

  it('pans east to the left and west to the right (facing south)', () => {
    expect(azimuthToPan(90)).toBeCloseTo(-1);
    expect(azimuthToPan(270)).toBeCloseTo(1);
    expect(azimuthToPan(180)).toBeCloseTo(0);
  });

  it('seeded rng is deterministic', () => {
    const a = createRng(7), b = createRng(7);
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
  });
});

describe('calendar', () => {
  it('computes the location-local clock from an offset', () => {
    const c = localClock(Date.UTC(2026, 9, 17, 3, 30), -4 * 3600);
    expect(c.hour).toBeCloseTo(23.5);
    expect(c.weekday).toBe(5); // Friday 16 Oct local
    expect(c.localDate).toBe('2026-10-16');
  });

  it('human activity: weekday rush hour > 3 am; weekends sleep in', () => {
    expect(humanActivity(17.5)).toBeGreaterThan(0.6);
    expect(humanActivity(3.5)).toBeLessThan(0.1);
    expect(humanActivity(8, { isWeekend: true })).toBeLessThan(humanActivity(8));
  });

  it('finds the Perseids in mid-August and sporadics otherwise', () => {
    expect(meteorActivity(224).shower.name).toBe('Perseids');
    expect(meteorActivity(224).zhr).toBeCloseTo(100);
    expect(meteorActivity(160).shower).toBeNull();
    expect(meteorActivity(160).zhr).toBeGreaterThan(0);
  });

  it('wraps showers across new year (Quadrantids)', () => {
    expect(meteorActivity(364).shower?.name).toBe('Quadrantids');
  });

  it('solstice proximity peaks near 21 June and is hemisphere-aware', () => {
    expect(solsticeProximity(172, 42).proximity).toBeGreaterThan(0.99);
    expect(solsticeProximity(172, 42).isSummerSolstice).toBe(true);
    expect(solsticeProximity(172, -33).isSummerSolstice).toBe(false);
    expect(solsticeProximity(80, 42).proximity).toBeLessThan(0.05);
  });

  it('computeCalendar bundles everything', () => {
    const c = computeCalendar({ nowMs: Date.UTC(2026, 9, 17, 16), utcOffsetSeconds: -14400, latitude: 42 });
    expect(c.season).toBe('autumn');
    expect(c.meteors.shower?.name).toBe('Orionids');
    expect(c.activity).toBeGreaterThan(0);
  });
});

describe('sky', () => {
  it('sun is high at local noon in summer and below horizon at midnight', () => {
    const noon = computeSky({ lat: 42.36, lng: -71.06, date: new Date(Date.UTC(2026, 5, 21, 16, 40)) });
    const midnight = computeSky({ lat: 42.36, lng: -71.06, date: new Date(Date.UTC(2026, 5, 21, 4, 40)) });
    expect(noon.sun.altitude).toBeGreaterThan(65);
    expect(noon.twilight).toBe('day');
    expect(midnight.sun.altitude).toBeLessThan(-18);
    expect(midnight.darkness).toBe(1);
  });

  it('reports five planets with magnitudes', () => {
    const s = computeSky({ lat: 0, lng: 0, date: new Date(Date.UTC(2026, 0, 1)) });
    expect(s.planets.map((p) => p.name)).toEqual(['Mercury', 'Venus', 'Mars', 'Jupiter', 'Saturn']);
    s.planets.forEach((p) => expect(Number.isFinite(p.magnitude)).toBe(true));
  });

  it('Polaris sits at altitude ≈ latitude, due north', () => {
    const h = equatorialToHorizontal(37.95, 89.26, 5, 42);
    expect(h.altitude).toBeGreaterThan(41);
    expect(h.altitude).toBeLessThan(43.5);
    expect(Math.min(h.azimuth, 360 - h.azimuth)).toBeLessThan(2);
  });

  it('names twilight and darkness', () => {
    expect(twilightName(-3)).toBe('civil');
    expect(twilightName(2)).toBe('golden');
    expect(darkness(30)).toBe(0);
    expect(darkness(-20)).toBe(1);
  });
});

describe('snapshot', () => {
  it('marks missing sources unavailable and falls back to a longitude timezone', () => {
    const s = buildSnapshot({ lat: 42, lng: -71 }, Date.UTC(2026, 9, 17, 16));
    expect(s.availability.weather).toBe(false);
    expect(s.calendar.hour).toBeCloseTo(11);
    expect(s.location.biome).toBe('grassland');
    expect(s.sky.sun).toBeDefined();
  });
});

describe('feed', () => {
  afterEach(() => vi.useRealTimers());

  it('emits a snapshot after the weather arrives and announces a recent nearby quake once', async () => {
    vi.useFakeTimers();
    const now = Date.UTC(2026, 9, 17, 16);
    vi.setSystemTime(now);
    const fetchImpl = vi.fn(async (url) => {
      const json = (body) => ({ ok: true, json: async () => body });
      if (url.includes('api.open-meteo.com')) {
        return json({ utc_offset_seconds: -14400, current: { temperature_2m: 10, relative_humidity_2m: 50, surface_pressure: 1012, weather_code: 0 }, daily: {} });
      }
      if (url.includes('earthquake.usgs.gov')) {
        return json({ features: [{ id: 'q1', properties: { mag: 3.5, time: now - 5 * 60000 }, geometry: { coordinates: [-71.1, 42.1, 4] } }] });
      }
      return { ok: false, json: async () => null };
    });
    const feed = createNowFeed({ lat: 42, lng: -71, fetchImpl, classify: async () => 'urban' });
    const snapshots = [];
    const events = [];
    feed.onSnapshot((s) => snapshots.push(s));
    feed.onEvent((e) => events.push(e));
    feed.start();
    await vi.advanceTimersByTimeAsync(500);
    expect(snapshots.length).toBeGreaterThan(0);
    const last = snapshots.at(-1);
    expect(last.weather.temperature).toBe(10);
    expect(last.location.biome).toBe('urban');
    expect(events).toHaveLength(1);
    expect(events[0].quake.id).toBe('q1');

    // Same quake on the next poll is not re-announced
    await vi.advanceTimersByTimeAsync(3 * 60000 + 500);
    expect(events).toHaveLength(1);
    feed.stop();
  });

  it('drops responses that arrive after stop()', async () => {
    vi.useFakeTimers();
    let resolveWeather;
    const fetchImpl = vi.fn((url) => {
      if (url.includes('api.open-meteo.com/v1/forecast')) {
        return new Promise((r) => { resolveWeather = r; });
      }
      return Promise.resolve({ ok: false });
    });
    const feed = createNowFeed({ lat: 1, lng: 1, fetchImpl, classify: async () => 'forest' });
    const snapshots = [];
    feed.onSnapshot((s) => snapshots.push(s));
    feed.start();
    await vi.advanceTimersByTimeAsync(10);
    feed.stop();
    resolveWeather({ ok: true, json: async () => ({ current: { temperature_2m: 30 } }) });
    await vi.advanceTimersByTimeAsync(1000);
    expect(feed.state.weather).toBeNull();
    expect(snapshots).toHaveLength(0);
  });
});
