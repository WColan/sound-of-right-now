/**
 * Tests for fetchWeather — specifically the timezone bug where sunrise/sunset
 * were parsed in the browser's local timezone instead of the queried location's.
 *
 * Regression test for: switching location to a different timezone (e.g. Delhi)
 * showed the wrong time of day (night sky during daytime).
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fetchWeather } from './fetcher.js';

// ── Helpers ────────────────────────────────────────────────────────────────

/**
 * Build a minimal Open-Meteo API response for a given location.
 * @param {object} opts
 * @param {number} opts.utcOffsetSeconds - UTC offset for the location
 * @param {string} opts.sunriseLocal - "YYYY-MM-DDTHH:MM" in location's local time
 * @param {string} opts.sunsetLocal  - "YYYY-MM-DDTHH:MM" in location's local time
 * @param {string} opts.currentTime  - "YYYY-MM-DDTHH:MM" in location's local time
 */
function makeApiResponse({ utcOffsetSeconds, sunriseLocal, sunsetLocal, currentTime }) {
  return {
    utc_offset_seconds: utcOffsetSeconds,
    current: {
      time: currentTime,
      temperature_2m: 28,
      apparent_temperature: 30,
      relative_humidity_2m: 55,
      surface_pressure: 1010,
      wind_speed_10m: 10,
      wind_direction_10m: 180,
      weather_code: 0,
      cloud_cover: 10,
    },
    daily: {
      sunrise: [sunriseLocal],
      sunset: [sunsetLocal],
    },
    hourly: {
      // 24 placeholder UV values; index by local hour
      uv_index: Array.from({ length: 24 }, (_, i) => i),
    },
  };
}

function mockFetch(responseBody) {
  global.fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: () => Promise.resolve(responseBody),
  });
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

// ── Tests ──────────────────────────────────────────────────────────────────

describe('fetchWeather — timezone handling', () => {
  it('parses Delhi sunrise/sunset as UTC, not browser local time', async () => {
    // Delhi is UTC+5:30 (19800 seconds).
    // Sunrise in Delhi local time: 07:14 → UTC: 01:44
    // Sunset  in Delhi local time: 17:58 → UTC: 12:28
    mockFetch(makeApiResponse({
      utcOffsetSeconds: 19800,
      sunriseLocal: '2024-01-20T07:14',
      sunsetLocal:  '2024-01-20T17:58',
      currentTime:  '2024-01-20T12:00',
    }));

    const weather = await fetchWeather(28.6139, 77.209);

    // Sunrise should be 01:44 UTC
    expect(weather.sunrise.getUTCHours()).toBe(1);
    expect(weather.sunrise.getUTCMinutes()).toBe(44);

    // Sunset should be 12:28 UTC
    expect(weather.sunset.getUTCHours()).toBe(12);
    expect(weather.sunset.getUTCMinutes()).toBe(28);
  });

  it('identifies Delhi noon as daytime (not night)', async () => {
    // Fix "now" to 2024-01-20 06:30 UTC = 12:00 noon Delhi time
    vi.setSystemTime(new Date('2024-01-20T06:30:00Z'));

    mockFetch(makeApiResponse({
      utcOffsetSeconds: 19800,
      sunriseLocal: '2024-01-20T07:14',  // 01:44 UTC
      sunsetLocal:  '2024-01-20T17:58',  // 12:28 UTC
      currentTime:  '2024-01-20T12:00',
    }));

    const weather = await fetchWeather(28.6139, 77.209);
    const now = new Date();

    // now (06:30 UTC) is between sunrise (01:44 UTC) and sunset (12:28 UTC) → daytime
    expect(now.getTime()).toBeGreaterThan(weather.sunrise.getTime());
    expect(now.getTime()).toBeLessThan(weather.sunset.getTime());
  });

  it('would have incorrectly shown night for Delhi before the fix', () => {
    // This test documents the old (broken) behavior.
    // Without the fix: new Date("2024-01-20T07:14") is parsed as browser local time.
    // If the browser is in UTC-8 (PST), "07:14" becomes 15:14 UTC — far off.
    //
    // We simulate the broken parsing by forcing UTC offset to 0 in the conversion:
    const brokenSunrise = new Date('2024-01-20T07:14Z'); // parsed as UTC (wrong)
    const brokenSunset  = new Date('2024-01-20T17:58Z'); // parsed as UTC (wrong)

    // "now" at Delhi noon = 06:30 UTC
    const now = new Date('2024-01-20T06:30:00Z');

    // now (06:30 UTC) is BEFORE broken sunrise (07:14 UTC) → incorrectly "night"
    expect(now.getTime()).toBeLessThan(brokenSunrise.getTime());

    // With the fix: subtract utcOffsetMs (5.5h) from those UTC-parsed times
    const utcOffsetMs = 19800 * 1000;
    const fixedSunrise = new Date(brokenSunrise.getTime() - utcOffsetMs); // 01:44 UTC
    const fixedSunset  = new Date(brokenSunset.getTime()  - utcOffsetMs); // 12:28 UTC

    // now (06:30 UTC) is between fixed sunrise (01:44) and sunset (12:28) → daytime ✓
    expect(now.getTime()).toBeGreaterThan(fixedSunrise.getTime());
    expect(now.getTime()).toBeLessThan(fixedSunset.getTime());
  });

  it('works correctly for a location west of UTC (Los Angeles, UTC-8)', async () => {
    // Los Angeles sunrise: 06:58 local → 14:58 UTC
    // Los Angeles sunset:  17:02 local → 01:02 UTC next day
    mockFetch(makeApiResponse({
      utcOffsetSeconds: -28800,
      sunriseLocal: '2024-01-20T06:58',
      sunsetLocal:  '2024-01-20T17:02',
      currentTime:  '2024-01-20T12:00',
    }));

    const weather = await fetchWeather(34.0522, -118.2437);

    // Sunrise: 06:58 local = 14:58 UTC
    expect(weather.sunrise.getUTCHours()).toBe(14);
    expect(weather.sunrise.getUTCMinutes()).toBe(58);

    // Sunset: 17:02 local = 01:02 UTC next day
    expect(weather.sunset.getUTCHours()).toBe(1);
    expect(weather.sunset.getUTCMinutes()).toBe(2);
  });

  it('works for UTC+0 (London in winter)', async () => {
    // UTC+0: local times equal UTC
    mockFetch(makeApiResponse({
      utcOffsetSeconds: 0,
      sunriseLocal: '2024-01-20T07:59',
      sunsetLocal:  '2024-01-20T16:08',
      currentTime:  '2024-01-20T12:00',
    }));

    const weather = await fetchWeather(51.5074, -0.1278);

    expect(weather.sunrise.getUTCHours()).toBe(7);
    expect(weather.sunrise.getUTCMinutes()).toBe(59);
    expect(weather.sunset.getUTCHours()).toBe(16);
    expect(weather.sunset.getUTCMinutes()).toBe(8);
  });

  it('selects UV index from the location local hour, not the browser hour', async () => {
    // Delhi is UTC+5:30. Fix "now" to 2024-01-20T06:30Z = 12:00 noon Delhi time.
    vi.setSystemTime(new Date('2024-01-20T06:30:00Z'));

    // UV array indexed 0-23 by local hour; hour 12 → value 12
    mockFetch(makeApiResponse({
      utcOffsetSeconds: 19800,
      sunriseLocal: '2024-01-20T07:14',
      sunsetLocal:  '2024-01-20T17:58',
      currentTime:  '2024-01-20T12:00',
    }));

    const weather = await fetchWeather(28.6139, 77.209);

    // Local hour in Delhi at 06:30 UTC = 12:00, so UV index should be 12
    expect(weather.uvIndex).toBe(12);
  });
});
