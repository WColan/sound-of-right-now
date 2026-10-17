import { describe, it, expect } from 'vitest';
import {
  composeScore, temperatureToRoot, temperatureToMode, temperatureToBpm, dolbearChirpsPerMinute,
  keplerSemitones, chorusCurve, SECTION_IDS, ZONE_OF,
} from './score.js';
import { makeSnapshot } from '../test/now-fixtures.js';

const fixedRng = () => 0.1;

describe('harmony mappings', () => {
  it('warmer air → sharper keys, brighter modes, faster pulse', () => {
    expect(temperatureToRoot(-20)).toBe('C#');
    expect(temperatureToRoot(14)).toBe('C');
    expect(temperatureToRoot(35)).toBe('E');
    expect(temperatureToMode(-15)).toBe('locrian');
    expect(temperatureToMode(25)).toBe('ionian');
    expect(temperatureToBpm(30)).toBeGreaterThan(temperatureToBpm(0));
  });

  it('every 6 °C is one step on the circle of fifths (closely related keys)', () => {
    expect(temperatureToRoot(14)).toBe('C');
    expect(temperatureToRoot(20)).toBe('G');
    expect(temperatureToRoot(8)).toBe('F');
  });
});

describe('physics-honest helpers', () => {
  it("Dolbear's law: 20 °C ≈ 112 chirps/min; cold crickets are silent", () => {
    expect(dolbearChirpsPerMinute(20)).toBeCloseTo(112);
    expect(dolbearChirpsPerMinute(0)).toBe(0);
  });

  it('Kepler: inner planets sing higher than outer planets', () => {
    expect(keplerSemitones('Mercury')).toBeGreaterThan(keplerSemitones('Venus'));
    expect(keplerSemitones('Venus')).toBeGreaterThan(0);
    expect(keplerSemitones('Jupiter')).toBeLessThan(keplerSemitones('Mars'));
    expect(keplerSemitones('Saturn')).toBeCloseTo(-58.5, 0);
  });

  it('dawn chorus peaks just after sunrise and is silent at night', () => {
    expect(chorusCurve(3, true)).toBeGreaterThan(0.9);
    expect(chorusCurve(-20, true)).toBe(0);
    expect(chorusCurve(3, true)).toBeGreaterThan(chorusCurve(3, false));
  });
});

describe('composeScore', () => {
  it('always keeps the harmonic bed and produces every section key', () => {
    const s = composeScore(makeSnapshot(), { rng: fixedRng });
    expect(s.sections.strings.on).toBe(true);
    expect(s.sections.basses.on).toBe(true);
    SECTION_IDS.forEach((id) => expect(s.sections[id]).toBeDefined());
    SECTION_IDS.forEach((id) => expect(ZONE_OF[id]).toBeDefined());
  });

  it('every active section explains itself in the legend', () => {
    const s = composeScore(makeSnapshot({
      weather: { precipitation: 3, category: 'rain', windSpeed: 30, windGusts: 55 },
      marine: { waveHeight: 2, wavePeriod: 11, waveDirection: 90, seaSurfaceTemp: 14 },
    }), { rng: fixedRng });
    for (const id of SECTION_IDS) {
      if (s.sections[id].on) expect(s.legend.some((l) => l.section === id)).toBe(true);
    }
    s.legend.forEach((l) => expect(l.why.length).toBeGreaterThan(10));
  });

  it('unavailable sources stay silent: inland → no ocean, no ISS when far', () => {
    const s = composeScore(makeSnapshot(), { rng: fixedRng });
    expect(s.sections.ocean.on).toBe(false);
    expect(s.sections.iss.on).toBe(false);
    expect(s.sections.aurora.on).toBe(false);
  });

  it('the ocean breathes at the real wave period', () => {
    const s = composeScore(makeSnapshot({ marine: { waveHeight: 1.2, wavePeriod: 12, waveDirection: 90, seaSurfaceTemp: 18 } }));
    expect(s.sections.ocean.on).toBe(true);
    expect(s.sections.ocean.period).toBe(12);
    expect(s.sections.ocean.pan).toBeLessThan(0); // waves from the east → left
  });

  it('rain density follows precipitation; snow switches to bells', () => {
    const light = composeScore(makeSnapshot({ weather: { category: 'rain', precipitation: 0.5 } }));
    const heavy = composeScore(makeSnapshot({ weather: { category: 'rain', precipitation: 8 } }));
    const snow = composeScore(makeSnapshot({ weather: { category: 'snow', precipitation: 0.5, snowfall: 1 } }));
    expect(heavy.sections.rain.density).toBeGreaterThan(light.sections.rain.density);
    expect(snow.sections.rain.instrument).toBe('snow');
    expect(composeScore(makeSnapshot()).sections.rain.on).toBe(false);
  });

  it('horns: a dawn call at sunrise, a chorale at dusk, silent at night', () => {
    expect(composeScore(makeSnapshot({ sun: { altitude: 1, rising: true } })).sections.horns.mode).toBe('dawn');
    expect(composeScore(makeSnapshot({ sun: { altitude: 1, rising: false } })).sections.horns.mode).toBe('dusk');
    expect(composeScore(makeSnapshot({ sun: { altitude: -30 } })).sections.horns.on).toBe(false);
  });

  it('the moon only sings when it is up, louder when full', () => {
    const night = { sun: { altitude: -30 } };
    const down = composeScore(makeSnapshot({ ...night, moon: { altitude: -10, illumination: 1 } }));
    const half = composeScore(makeSnapshot({ ...night, moon: { altitude: 40, illumination: 0.5 } }));
    const full = composeScore(makeSnapshot({ ...night, moon: { altitude: 40, illumination: 1 } }));
    expect(down.sections.moon.on).toBe(false);
    expect(full.sections.moon.level).toBeGreaterThan(half.sections.moon.level);
  });

  it('planets: only those above the horizon, fuller once the listener has stayed 20 minutes', () => {
    const snap = makeSnapshot({
      sun: { altitude: -25 },
      weather: { cloudCover: 0 },
      planets: [
        { name: 'Venus', altitude: 20, azimuth: 250, magnitude: -4.2 },
        { name: 'Saturn', altitude: -5, azimuth: 90, magnitude: 0.8 },
      ],
    });
    const early = composeScore(snap, { listenMinutes: 2 });
    const later = composeScore(snap, { listenMinutes: 25 });
    expect(early.sections.spheres.tones.map((t) => t.planet)).toEqual(['Venus']);
    expect(later.sections.spheres.level).toBeGreaterThan(early.sections.spheres.level);
    expect(later.sections.spheres.unlocked).toBe(true);
  });

  it('aurora needs geomagnetic reach, darkness and clear sky', () => {
    const space = { kp: 7, auroraReach: 1, solarWindSpeed: 650, geomagLat: 60 };
    expect(composeScore(makeSnapshot({ sun: { altitude: -25 }, weather: { cloudCover: 0 }, space })).sections.aurora.on).toBe(true);
    expect(composeScore(makeSnapshot({ sun: { altitude: 30 }, space })).sections.aurora.on).toBe(false);
    expect(composeScore(makeSnapshot({ sun: { altitude: -25 }, weather: { cloudCover: 100 }, space })).sections.aurora.on).toBe(false);
  });

  it('crickets follow Dolbear on warm summer nights, never in the cold', () => {
    const warm = composeScore(makeSnapshot({ sun: { altitude: -20 }, weather: { temperature: 24 }, calendar: { season: 'summer' } }));
    const cold = composeScore(makeSnapshot({ sun: { altitude: -20 }, weather: { temperature: 4 }, calendar: { season: 'summer' } }));
    expect(warm.sections.life.crickets).toBeGreaterThan(0.5);
    expect(warm.sections.life.chirpRate).toBeCloseTo(dolbearChirpsPerMinute(24));
    expect(cold.sections.life.crickets).toBe(0);
  });

  it('ISS in range becomes a highly salient voice with Doppler', () => {
    const s = composeScore(makeSnapshot({ iss: { inRange: true, groundKm: 400, elevation: 45, azimuth: 270, radialKmS: -5, sunlit: true } }));
    expect(s.sections.iss.on).toBe(true);
    expect(s.sections.iss.salience).toBeGreaterThan(0.8);
    expect(s.sections.iss.doppler).toBeGreaterThan(0); // approaching → pitch up
    expect(s.sections.iss.pan).toBeGreaterThan(0.9);   // west → right
  });

  it('people: busier city at rush hour than a village at 4 am', () => {
    const city = composeScore(makeSnapshot({ calendar: { activity: 0.9 }, location: { population: 2_000_000 } }));
    const village = composeScore(makeSnapshot({ calendar: { activity: 0.05 }, location: { population: 800, biome: 'grassland' } }));
    expect(city.sections.pulse.level).toBeGreaterThan(village.sections.pulse.level);
  });

  it('fog pushes the orchestra into the distance; a desert dries the hall', () => {
    const fog = composeScore(makeSnapshot({ weather: { visibility: 300, category: 'fog', humidity: 98 } }));
    const desert = composeScore(makeSnapshot({ weather: { humidity: 10 }, location: { biome: 'desert' } }));
    expect(fog.hall.distance).toBeGreaterThan(0.8);
    expect(fog.hall.wet).toBeGreaterThan(desert.hall.wet);
    expect(desert.hall.decay).toBeLessThan(fog.hall.decay);
  });

  it('storm mode choice is stable across updates', () => {
    const snap = makeSnapshot({ weather: { category: 'storm', temperature: -3, apparentTemperature: -3, cape: 2000 } });
    const a = composeScore(snap, { rng: () => 0.9 });
    const b = composeScore(snap, { rng: () => 0.1, previousMode: a.harmony.mode });
    expect(a.harmony.mode).toBe(b.harmony.mode);
    expect(a.sections.storm.on).toBe(true);
    expect(a.sections.storm.salience).toBeGreaterThan(a.sections.winds.salience);
  });
});
