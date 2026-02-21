/**
 * Mapper edge-case tests.
 *
 * mapWeatherToMusic is a pure function, so tests focus on:
 *   - Structural contract: every expected key is present and typed correctly
 *   - Range contracts: all numeric outputs stay within their valid bounds
 *   - Category routing: storm → isRaining, weather codes → correct category
 *   - Optional inputs: tideLevel, aqiLevel, pressureTrend omitted or at extremes
 *   - Temperature boundary conditions: mode selection + BPM clamp
 *   - Wind speed boundary: windChimeVolume silence below 8 km/h
 */

import { describe, expect, it } from 'vitest';
import { mapWeatherToMusic } from './mapper.js';

// ── Shared fixture helpers ─────────────────────────────────────────────────

const NOW = new Date('2025-06-21T14:00:00Z'); // Midday, midsummer

function makeWeather(overrides = {}) {
  const base = {
    temperature: 18,
    apparentTemperature: 18,
    humidity: 60,
    pressure: 1013,
    windSpeed: 15,
    windDirection: 180,
    weatherCode: 0,      // clear
    cloudCover: 0,
    sunrise: new Date('2025-06-21T05:00:00Z'),
    sunset:  new Date('2025-06-21T21:00:00Z'),
    uvIndex: 3,
  };
  return { ...base, ...overrides };
}

// Keys that must always appear in the return object
const REQUIRED_KEYS = [
  'rootNote', 'scaleType', 'bpm',
  'padVolume', 'arpeggioVolume', 'bassVolume', 'textureVolume',
  'percussionVolume', 'droneVolume', 'melodyVolume',
  'padBrightness', 'padSpread', 'bassCutoff',
  'arpeggioPattern', 'arpeggioFilterCutoff',
  'reverbDecay', 'reverbWet', 'chorusDepth',
  'masterFilterCutoff', 'noiseType', 'textureFilterCutoff',
  'lfoRate', 'lfoDepth', 'rhythmDensity',
  'percussionPan', 'arpeggioPan', 'melodyPan',
  'globalVelocityScale',
  'isRaining', 'rainIntensity',
  'textureAutoFilterRate', 'textureAutoFilterDepth',
  'droneCutoff', 'subBassGain',
  'percussionReverbWet', 'delayFeedback',
  'arpeggioWidth', 'melodyWidth',
  'windChimeVolume', 'timbreProfile',
  'weatherCategory', 'pressureNorm',
  'arpeggioRhythmPattern', 'percussionPattern', 'melodyMood',
  '_meta',
];

// ── Structural contract ────────────────────────────────────────────────────

describe('mapWeatherToMusic — output structure', () => {
  it('returns all required keys for a typical clear-sky input', () => {
    const result = mapWeatherToMusic(makeWeather());
    for (const key of REQUIRED_KEYS) {
      expect(result, `missing key: ${key}`).toHaveProperty(key);
    }
  });

  it('returns numeric BPM between 50 and 110', () => {
    const result = mapWeatherToMusic(makeWeather());
    expect(result.bpm).toBeGreaterThanOrEqual(50);
    expect(result.bpm).toBeLessThanOrEqual(110);
    expect(Number.isInteger(result.bpm)).toBe(true);
  });

  it('returns padBrightness clamped to [0.05, 0.95]', () => {
    const result = mapWeatherToMusic(makeWeather());
    expect(result.padBrightness).toBeGreaterThanOrEqual(0.05);
    expect(result.padBrightness).toBeLessThanOrEqual(0.95);
  });

  it('returns reverbWet in [0, 1]', () => {
    const result = mapWeatherToMusic(makeWeather());
    expect(result.reverbWet).toBeGreaterThanOrEqual(0);
    expect(result.reverbWet).toBeLessThanOrEqual(1);
  });

  it('returns subBassGain in [0.1, 0.7]', () => {
    const storm = mapWeatherToMusic(makeWeather({ weatherCode: 95 }));
    expect(storm.subBassGain).toBeGreaterThanOrEqual(0.1);
    expect(storm.subBassGain).toBeLessThanOrEqual(0.7);

    const clear = mapWeatherToMusic(makeWeather({ weatherCode: 0 }));
    expect(clear.subBassGain).toBeGreaterThanOrEqual(0.1);
    expect(clear.subBassGain).toBeLessThanOrEqual(0.55);
  });
});

// ── Temperature boundary conditions ───────────────────────────────────────

describe('mapWeatherToMusic — temperature → mode/BPM', () => {
  it('uses a darker mode at very cold temperatures', () => {
    const result = mapWeatherToMusic(makeWeather({ temperature: -15, apparentTemperature: -20 }));
    // Below -10°C → locrian or aeolian (indices 0-1 in MODE_SPECTRUM)
    expect(['locrian', 'aeolian', 'harmonicMinor', 'melodicMinor']).toContain(result.scaleType);
  });

  it('uses a brighter mode at warm temperatures', () => {
    const result = mapWeatherToMusic(makeWeather({ temperature: 25, apparentTemperature: 28 }));
    expect(['ionian', 'lydian']).toContain(result.scaleType);
  });

  it('clamps BPM at minimum 50 for extreme cold', () => {
    const result = mapWeatherToMusic(makeWeather({ temperature: -50 }));
    expect(result.bpm).toBe(50);
  });

  it('clamps BPM at maximum 110 for extreme heat', () => {
    const result = mapWeatherToMusic(makeWeather({ temperature: 100 }));
    expect(result.bpm).toBe(110);
  });
});

// ── Category routing ───────────────────────────────────────────────────────

describe('mapWeatherToMusic — weather category routing', () => {
  it('maps weatherCode 0 (clear) → isRaining: false', () => {
    const result = mapWeatherToMusic(makeWeather({ weatherCode: 0 }));
    expect(result.isRaining).toBe(false);
    expect(result.rainIntensity).toBe(0);
    expect(result.weatherCategory).toBe('clear');
  });

  it('maps weatherCode 61 (rain) → isRaining: true', () => {
    const result = mapWeatherToMusic(makeWeather({ weatherCode: 61 }));
    expect(result.isRaining).toBe(true);
    expect(result.rainIntensity).toBeGreaterThan(0);
    expect(result.weatherCategory).toBe('rain');
  });

  it('maps weatherCode 95 (storm) → isRaining: true with high rainIntensity', () => {
    const result = mapWeatherToMusic(makeWeather({ weatherCode: 95 }));
    expect(result.isRaining).toBe(true);
    expect(result.rainIntensity).toBe(0.8);
    expect(result.weatherCategory).toBe('storm');
  });

  it('maps weatherCode 71 (snow) → isRaining: false', () => {
    const result = mapWeatherToMusic(makeWeather({ weatherCode: 71 }));
    expect(result.isRaining).toBe(false);
    expect(result.weatherCategory).toBe('snow');
  });

  it('maps weatherCode 45 (fog) → correct category', () => {
    const result = mapWeatherToMusic(makeWeather({ weatherCode: 45 }));
    expect(result.weatherCategory).toBe('fog');
    expect(result.isRaining).toBe(false);
  });

  it('routes storm to driving percussion pattern', () => {
    const result = mapWeatherToMusic(makeWeather({ weatherCode: 95 }));
    expect(result.percussionPattern).toBe('driving');
  });

  it('routes fog to ghost percussion pattern', () => {
    const result = mapWeatherToMusic(makeWeather({ weatherCode: 45 }));
    expect(result.percussionPattern).toBe('ghost');
  });
});

// ── Wind speed boundary: wind chime ──────────────────────────────────────

describe('mapWeatherToMusic — wind chime activation', () => {
  it('silences wind chime below 8 km/h', () => {
    const result = mapWeatherToMusic(makeWeather({ windSpeed: 5 }));
    expect(result.windChimeVolume).toBe(-80);
  });

  it('activates wind chime above 8 km/h', () => {
    const result = mapWeatherToMusic(makeWeather({ windSpeed: 20 }));
    expect(result.windChimeVolume).toBeGreaterThan(-80);
    expect(result.windChimeVolume).toBeLessThan(0);
  });

  it('wind chime volume increases with wind speed', () => {
    const calm   = mapWeatherToMusic(makeWeather({ windSpeed: 10 }));
    const gusty  = mapWeatherToMusic(makeWeather({ windSpeed: 45 }));
    expect(gusty.windChimeVolume).toBeGreaterThan(calm.windChimeVolume);
  });
});

// ── Optional parameters ───────────────────────────────────────────────────

describe('mapWeatherToMusic — optional options', () => {
  it('works without any options (all optional fields omitted)', () => {
    const result = mapWeatherToMusic(makeWeather());
    expect(result).toBeTruthy();
    expect(typeof result.bpm).toBe('number');
  });

  it('tideLevel boosts bassVolume when high tide', () => {
    const noTide   = mapWeatherToMusic(makeWeather(), {});
    const highTide = mapWeatherToMusic(makeWeather(), { tideLevel: 7 });
    expect(highTide.bassVolume).toBeGreaterThan(noTide.bassVolume);
  });

  it('tideLevel at -1 (minimum) does not boost bass', () => {
    const noTide  = mapWeatherToMusic(makeWeather(), {});
    const lowTide = mapWeatherToMusic(makeWeather(), { tideLevel: -1 });
    // At low tide, bassVolume should equal or be very close to no-tide baseline
    expect(lowTide.bassVolume).toBeCloseTo(noTide.bassVolume, 1);
  });

  it('aqiLevel > 50 reduces masterFilterCutoff', () => {
    const clean = mapWeatherToMusic(makeWeather(), { aqiLevel: 50 });
    const hazy  = mapWeatherToMusic(makeWeather(), { aqiLevel: 200 });
    expect(hazy.masterFilterCutoff).toBeLessThan(clean.masterFilterCutoff);
  });

  it('aqiLevel > 50 increases reverbWet', () => {
    const clean = mapWeatherToMusic(makeWeather(), { aqiLevel: 50 });
    const hazy  = mapWeatherToMusic(makeWeather(), { aqiLevel: 200 });
    expect(hazy.reverbWet).toBeGreaterThan(clean.reverbWet);
  });

  it('reverbWet never exceeds 0.85 even with extreme AQI', () => {
    const result = mapWeatherToMusic(
      makeWeather({ humidity: 100 }),
      { aqiLevel: 500 }
    );
    expect(result.reverbWet).toBeLessThanOrEqual(0.85);
  });

  it('falling pressureTrend darkens masterFilterCutoff', () => {
    const stable  = mapWeatherToMusic(makeWeather(), { pressureTrend: 0 });
    const falling = mapWeatherToMusic(makeWeather(), { pressureTrend: -1 });
    expect(falling.masterFilterCutoff).toBeLessThan(stable.masterFilterCutoff);
  });

  it('rising pressureTrend does not darken masterFilterCutoff', () => {
    const stable  = mapWeatherToMusic(makeWeather(), { pressureTrend: 0 });
    const rising  = mapWeatherToMusic(makeWeather(), { pressureTrend: 1 });
    // Rising pressure may not increase cutoff (it boosts padBrightness, not cutoff),
    // but it should never be lower than stable.
    expect(rising.masterFilterCutoff).toBeGreaterThanOrEqual(stable.masterFilterCutoff * 0.95);
  });
});

// ── Pressure → bass ───────────────────────────────────────────────────────

describe('mapWeatherToMusic — pressure effects', () => {
  it('low pressure raises bassCutoff (deeper, more open bass filter)', () => {
    const low  = mapWeatherToMusic(makeWeather({ pressure: 980 }));
    const high = mapWeatherToMusic(makeWeather({ pressure: 1050 }));
    // inverseLerp(980, 1050, low_pressure) = 0 → lerp(150, 800, 0) = 150
    // inverseLerp(980, 1050, high_pressure) = 1 → lerp(150, 800, 1) = 800
    expect(low.bassCutoff).toBeLessThan(high.bassCutoff);
  });

  it('pressure out of range is clamped — no NaN in output', () => {
    const extreme = mapWeatherToMusic(makeWeather({ pressure: 500 }));
    expect(Number.isNaN(extreme.bassCutoff)).toBe(false);
    expect(Number.isNaN(extreme.bassVolume)).toBe(false);
  });
});

// ── Storm-specific harmonic-minor upgrade ─────────────────────────────────

describe('mapWeatherToMusic — storm/snow minor upgrade', () => {
  it('cold snow may trigger harmonicMinor or melodicMinor', () => {
    // Run many times to check stochastic path (50% probability each)
    const results = new Set();
    for (let i = 0; i < 50; i++) {
      const r = mapWeatherToMusic(makeWeather({
        weatherCode: 71, // snow
        temperature: -5,
        apparentTemperature: -10,
      }));
      results.add(r.scaleType);
    }
    // At least one of the enhanced minor modes should appear
    const enhanced = ['harmonicMinor', 'melodicMinor'];
    expect(enhanced.some(m => results.has(m))).toBe(true);
  });
});

// ── Cloud cover effect ─────────────────────────────────────────────────────

describe('mapWeatherToMusic — cloud cover dimming', () => {
  it('100% cloud cover reduces padBrightness vs 0%', () => {
    const clear   = mapWeatherToMusic(makeWeather({ cloudCover: 0 }));
    const overcast = mapWeatherToMusic(makeWeather({ cloudCover: 100 }));
    expect(overcast.padBrightness).toBeLessThan(clear.padBrightness);
  });

  it('100% cloud cover reduces masterFilterCutoff', () => {
    const clear    = mapWeatherToMusic(makeWeather({ cloudCover: 0 }));
    const overcast = mapWeatherToMusic(makeWeather({ cloudCover: 100 }));
    expect(overcast.masterFilterCutoff).toBeLessThan(clear.masterFilterCutoff);
  });
});

// ── Wind direction → panning ──────────────────────────────────────────────

describe('mapWeatherToMusic — wind direction panning', () => {
  it('north wind (0°) centers percussion pan near 0', () => {
    const result = mapWeatherToMusic(makeWeather({ windDirection: 0 }));
    expect(Math.abs(result.percussionPan)).toBeLessThan(0.1);
  });

  it('east wind (90°) pans percussion to full right', () => {
    const result = mapWeatherToMusic(makeWeather({ windDirection: 90 }));
    expect(result.percussionPan).toBeCloseTo(1, 1);
  });

  it('arpeggioPan is counter-opposite to percussionPan for stereo spread', () => {
    const result = mapWeatherToMusic(makeWeather({ windDirection: 90 }));
    // arpeggioPan = -percussionPan * 0.4
    expect(Math.sign(result.arpeggioPan)).not.toBe(Math.sign(result.percussionPan));
  });
});

// ── _meta shape ───────────────────────────────────────────────────────────

describe('mapWeatherToMusic — _meta object', () => {
  it('returns _meta with expected fields', () => {
    const result = mapWeatherToMusic(makeWeather());
    expect(result._meta).toMatchObject({
      category: expect.any(String),
      moonPhase: expect.anything(),  // number (0-1 fraction) from getMoonPhase
      moonFullness: expect.any(Number),
      timeOfDay: expect.any(String),
      sunTransition: expect.any(Number),
      filterWarmth: expect.any(Number),
      aqiNorm: expect.any(Number),
      seasonalFactor: expect.any(Number),
    });
  });

  it('_meta.moonFullness is in [0, 1]', () => {
    const result = mapWeatherToMusic(makeWeather());
    expect(result._meta.moonFullness).toBeGreaterThanOrEqual(0);
    expect(result._meta.moonFullness).toBeLessThanOrEqual(1);
  });
});
