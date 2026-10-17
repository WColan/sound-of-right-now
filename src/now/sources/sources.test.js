import { describe, it, expect } from 'vitest';
import { normalizeWeather, buildWeatherUrl } from './weather.js';
import { normalizeMarine } from './marine.js';
import { normalizeRiver } from './river.js';
import { normalizeAir } from './air.js';
import { normalizeSpace, geomagneticLatitude, auroraReach } from './space.js';
import { normalizeQuakes, isAudible, quakeIntensity } from './quakes.js';
import { normalizeIss } from './iss.js';
import { normalizeLife } from './life.js';
import { pickNearestPopulation, findHoliday } from './place.js';
import { normalizeTide } from './tide.js';

const NOW = Date.UTC(2026, 9, 17, 16, 30); // 12:30 local in Boston (UTC-4)

function weatherFixture() {
  const times = [];
  const pressure = [];
  for (let d of ['2026-10-16', '2026-10-17']) {
    for (let h = 0; h < 24; h++) {
      times.push(`${d}T${String(h).padStart(2, '0')}:00`);
      pressure.push(1010 + (d === '2026-10-17' && h >= 9 ? (h - 9) : 0));
    }
  }
  return {
    utc_offset_seconds: -4 * 3600,
    elevation: 12,
    timezone: 'America/New_York',
    current: {
      temperature_2m: 14, apparent_temperature: 12, relative_humidity_2m: 70, dew_point_2m: 8,
      surface_pressure: 1013, wind_speed_10m: 18, wind_gusts_10m: 35, wind_direction_10m: 250,
      weather_code: 61, cloud_cover: 90, precipitation: 1.2, rain: 1.2, showers: 0, snowfall: 0,
      is_day: 1, visibility: 9000, shortwave_radiation: 120,
    },
    hourly: {
      time: times,
      uv_index: times.map((_, i) => i % 24),
      cape: times.map(() => 250),
      snow_depth: times.map(() => 0),
      surface_pressure: pressure,
      visibility: times.map(() => 10000),
    },
    daily: {
      time: ['2026-10-16', '2026-10-17'],
      sunrise: ['2026-10-16T07:03', '2026-10-17T07:04'],
      sunset: ['2026-10-16T18:02', '2026-10-17T18:00'],
      daylight_duration: [39540, 39360],
    },
  };
}

describe('weather source', () => {
  it('builds a URL with current, hourly and daily fields', () => {
    const url = buildWeatherUrl(42.5, -71.07);
    expect(url).toContain('wind_gusts_10m');
    expect(url).toContain('cape');
    expect(url).toContain('past_days=1');
  });

  it('normalizes current conditions and picks the location-local hour', () => {
    const w = normalizeWeather(weatherFixture(), NOW);
    expect(w.temperature).toBe(14);
    expect(w.category).toBe('rain');
    expect(w.windGusts).toBe(35);
    expect(w.uvIndex).toBe(12); // local 12:00, not browser time
    expect(w.isDay).toBe(true);
  });

  it('derives a 3-hour pressure tendency', () => {
    const w = normalizeWeather(weatherFixture(), NOW);
    expect(w.pressureTendency).toBe(3); // 1013 → from 1010 three hours earlier
  });

  it('converts sunrise to a real UTC instant using the location offset', () => {
    const w = normalizeWeather(weatherFixture(), NOW);
    expect(w.sunrise.toISOString()).toBe('2026-10-17T11:04:00.000Z');
  });

  it('returns null for a malformed response', () => {
    expect(normalizeWeather(null)).toBeNull();
    expect(normalizeWeather({})).toBeNull();
  });
});

describe('marine source', () => {
  it('normalizes waves and returns null inland', () => {
    expect(normalizeMarine({ current: { wave_height: 1.4, wave_period: 9, sea_surface_temperature: 15 } }))
      .toMatchObject({ waveHeight: 1.4, wavePeriod: 9, seaSurfaceTemp: 15 });
    expect(normalizeMarine({ current: { wave_height: null } })).toBeNull();
  });
});

describe('river source', () => {
  it('computes flow ratio against the median', () => {
    const r = normalizeRiver({ daily: { river_discharge: [80, 120], river_discharge_median: [60, 60] } });
    expect(r.ratio).toBe(2);
  });

  it('ignores trickles', () => {
    expect(normalizeRiver({ daily: { river_discharge: [1], river_discharge_median: [1] } })).toBeNull();
  });
});

describe('air source', () => {
  it('sums pollen where modelled, null elsewhere', () => {
    expect(normalizeAir({ current: { us_aqi: 40, pm2_5: 8, grass_pollen: 10, birch_pollen: 5 } }).pollen).toBe(15);
    expect(normalizeAir({ current: { us_aqi: 40, pm2_5: 8 } }).pollen).toBeNull();
  });
});

describe('space weather', () => {
  it('computes geomagnetic latitude (Boston ≈ 52°, equator ≈ low)', () => {
    expect(geomagneticLatitude(42.36, -71.06)).toBeGreaterThan(48);
    expect(geomagneticLatitude(42.36, -71.06)).toBeLessThan(56);
    expect(Math.abs(geomagneticLatitude(0, 30))).toBeLessThan(15);
  });

  it('aurora reaches lower latitudes as Kp rises', () => {
    expect(auroraReach(2, 52)).toBeLessThan(0.1);
    expect(auroraReach(8, 52)).toBeGreaterThan(0.8);
    expect(auroraReach(1, 68)).toBeGreaterThan(0.8);
  });

  it('reads the newest Kp and solar wind rows', () => {
    const s = normalizeSpace(
      [{ estimated_kp: 2 }, { estimated_kp: 5.33 }],
      [['time_tag', 'density', 'speed', 'temperature'], ['t1', '4', '410', '1'], ['t2', '6', '', '1']],
      64.8, -147.7,
    );
    expect(s.kp).toBeCloseTo(5.33);
    expect(s.solarWindSpeed).toBe(410);
    expect(s.auroraReach).toBeGreaterThan(0.9);
  });
});

describe('earthquakes', () => {
  it('decides audibility by magnitude and distance', () => {
    expect(isAudible({ mag: 3, distanceKm: 100 })).toBe(true);
    expect(isAudible({ mag: 3, distanceKm: 800 })).toBe(false);
    expect(isAudible({ mag: 6.5, distanceKm: 9000 })).toBe(true);
  });

  it('intensity grows with magnitude and falls with distance', () => {
    expect(quakeIntensity(5, 100)).toBeGreaterThan(quakeIntensity(3, 100));
    expect(quakeIntensity(5, 100)).toBeGreaterThan(quakeIntensity(5, 1000));
    expect(quakeIntensity(9, 0)).toBeLessThanOrEqual(1);
  });

  it('normalizes the USGS feed, newest audible first', () => {
    const geo = {
      features: [
        { id: 'a', properties: { mag: 3.1, place: 'near', time: NOW - 600000 }, geometry: { coordinates: [-71.5, 42.6, 5] } },
        { id: 'b', properties: { mag: 2.6, place: 'far', time: NOW - 60000 }, geometry: { coordinates: [140, 35, 10] } },
        { id: 'c', properties: { mag: 6.8, place: 'big', time: NOW - 120000 }, geometry: { coordinates: [140, 35, 10] } },
      ],
    };
    const q = normalizeQuakes(geo, 42.36, -71.06, NOW);
    expect(q.audible.map((x) => x.id)).toEqual(['c', 'a']);
    expect(q.regionalCount24h).toBe(1);
    expect(q.audible[1].ageMinutes).toBeCloseTo(10);
  });
});

describe('ISS', () => {
  it('computes range, elevation and radial velocity', () => {
    const prev = normalizeIss({ latitude: 40, longitude: -75, altitude: 420, timestamp: 1000 }, 42.36, -71.06);
    const now = normalizeIss({ latitude: 41, longitude: -73, altitude: 420, timestamp: 1010 }, 42.36, -71.06, prev);
    expect(now.inRange).toBe(true);
    expect(now.elevation).toBeGreaterThan(20);
    expect(now.radialKmS).toBeLessThan(0); // approaching
  });

  it('is out of range on the far side of the planet', () => {
    expect(normalizeIss({ latitude: -40, longitude: 110, altitude: 420 }, 42.36, -71.06).inRange).toBe(false);
  });
});

describe('life', () => {
  it('splits observations into birds, singing insects and amphibians', () => {
    const l = normalizeLife({
      results: [
        { count: 30, taxon: { iconic_taxon_name: 'Aves', preferred_common_name: 'American Robin' } },
        { count: 50, taxon: { iconic_taxon_name: 'Aves', preferred_common_name: 'Blue Jay' } },
        { count: 4, taxon: { iconic_taxon_name: 'Insecta', preferred_common_name: 'Fall Field Cricket' } },
        { count: 9, taxon: { iconic_taxon_name: 'Insecta', preferred_common_name: 'Monarch' } },
        { count: 2, taxon: { iconic_taxon_name: 'Amphibia', preferred_common_name: 'Spring Peeper' } },
      ],
    });
    expect(l).toMatchObject({ birdSpecies: 2, insectSpecies: 2, singingInsects: 1, amphibianSpecies: 1 });
    expect(l.topBirds[0]).toBe('Blue Jay');
    expect(l.topSingers).toEqual(['Fall Field Cricket']);
  });
});

describe('place', () => {
  it('picks the nearest geocoding result for population', () => {
    const p = pickNearestPopulation({ results: [
      { latitude: 51.5, longitude: 0, population: 1 },
      { latitude: 42.5, longitude: -71.07, population: 27000, country_code: 'US' },
    ] }, 42.5, -71.06);
    expect(p).toMatchObject({ population: 27000, countryCode: 'US' });
  });

  it('finds today\'s national holiday', () => {
    const list = [{ date: '2026-07-04', name: 'Independence Day', localName: 'Independence Day', global: true }];
    expect(findHoliday(list, '2026-07-04').name).toBe('Independence Day');
    expect(findHoliday(list, '2026-07-05')).toBeNull();
  });
});

describe('tide', () => {
  it('reads level and rising/falling trend', () => {
    const t = normalizeTide({ data: Array.from({ length: 11 }, (_, i) => ({ v: String(3 + i * 0.05) })) }, { name: 'Boston', distanceKm: 5 });
    expect(t.level).toBeCloseTo(3.5);
    expect(t.trend).toBeGreaterThan(0);
  });
});
