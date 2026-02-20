import { categorizeWeatherCode } from '../weather/codes.js';
import { getMoonPhase, getMoonFullness } from '../weather/moon.js';
import { getSeasonalFactor } from '../weather/season.js';
import { MODE_SPECTRUM } from './scale.js';
import { CATEGORY_TO_MOOD } from './constants.js';

/**
 * Pure function: WeatherState → MusicalParams.
 *
 * Maps environmental conditions to musical parameters.
 * All creative decisions about how weather becomes sound live here.
 *
 * @param {import('../weather/fetcher.js').WeatherState} weather
 * @param {object} [options]
 * @param {number} [options.tideLevel] - Water level in feet (null if inland)
 * @param {number} [options.aqiLevel] - US AQI value (null if unavailable)
 * @param {number} [options.latitude] - For seasonal + hemisphere awareness
 * @param {number} [options.pressureTrend] - -1 (falling) to +1 (rising); 0 = stable
 * @returns {object} MusicalParams
 */
export function mapWeatherToMusic(weather, options = {}) {
  const category = categorizeWeatherCode(weather.weatherCode);
  const now = new Date();
  const moonPhase = getMoonPhase(now);
  const moonFullness = getMoonFullness(now);
  const timeOfDay = mapTimeOfDay(now, weather.sunrise, weather.sunset);
  const sunTransition = mapSunTransition(now, weather.sunrise, weather.sunset);
  const palette = WEATHER_PALETTES[category] || WEATHER_PALETTES.clear;

  // ── Seasonal awareness ──
  const seasonalFactor = getSeasonalFactor(now, options.latitude ?? 40);

  // Temperature → mode + tempo + root
  // Harmonic mode/root use apparent temperature (feels-like) — wind chill and heat index
  // reflect the body's actual experience, which is what the music should match.
  // BPM stays tied to the physical thermometer: physical pace, not perceived comfort.
  const { rootNote, scaleType } = mapTemperature(weather.apparentTemperature ?? weather.temperature);
  const bpm = clamp(55 + weather.temperature * 0.8, 50, 110);

  // Humidity → reverb + pad brightness
  // Thick humid air feels heavier/murkier; dry air feels crisp and open.
  const humNorm = weather.humidity / 100;
  let reverbDecay = lerp(1.5, 10, humNorm);
  let reverbWet = lerp(0.1, 0.65, humNorm);
  // Subtle brightness shift: dry (0%) = +0.08 brighter; very humid (100%) = −0.08 darker
  const humidityBrightnessMod = lerp(0.08, -0.08, humNorm);

  // Pressure → bass depth (980-1050 hPa range)
  const pressNorm = inverseLerp(980, 1050, clamp(weather.pressure, 980, 1050));
  const bassCutoff = lerp(150, 800, pressNorm);
  const bassVolume = lerp(-10, -18, pressNorm);

  // Pressure + category → drone filter cutoff
  // The drone's sub-bass filter (normally 200 Hz) opens/closes with conditions:
  // fog = wide open (drone becomes an audible hum), snow = very narrow (cold, distant),
  // storm = open (rumble bleeds through), high pressure = tight (felt, not heard).
  const droneCutoff = (() => {
    if (category === 'fog')   return 350;
    if (category === 'snow')  return 100;
    if (category === 'storm') return 300;
    return lerp(120, 250, 1 - pressNorm); // low pressure → 250 Hz, high pressure → 120 Hz
  })();

  // Wind speed → rhythmic density + texture sweep
  const windNorm = clamp(weather.windSpeed / 50, 0, 1);
  const noteInterval = selectFromRange(['1m', '2n', '4n', '8n', '16n'], windNorm);
  const rhythmDensity = lerp(0.05, 0.6, windNorm);
  const arpeggioVolume = lerp(-26, -14, windNorm);
  // Windier conditions create faster, more dramatic atmospheric texture sweeps.
  // Calm (windNorm=0): 0.05 Hz slow drift, 0.3 depth (gentle)
  // Gusty (windNorm=1): 0.4 Hz fast churn, 0.9 depth (dramatic)
  const textureAutoFilterRate  = lerp(0.05, 0.4, windNorm);
  const textureAutoFilterDepth = lerp(0.3,  0.9, windNorm);

  // Wind direction → panning + pattern type
  const percussionPan = Math.sin((weather.windDirection * Math.PI) / 180);
  const arpeggioPattern = mapWindDirectionToPattern(weather.windDirection);

  // Time of day → brightness (with seasonal modulation)
  let masterFilterCutoff = lerp(1500, 12000, timeOfDay.brightness);
  let padBrightness = lerp(0.15, 0.85, timeOfDay.brightness);
  let textureFilterCutoff = palette.textureFilterCutoff || 2000;

  // Seasonal modulation: brighter in summer, darker in winter
  const seasonalShift = (seasonalFactor - 0.5) * 2; // -1 to +1
  padBrightness = clamp(padBrightness + seasonalShift * 0.1, 0.05, 0.95);
  masterFilterCutoff = clamp(masterFilterCutoff + seasonalShift * 1000, 1000, 14000);
  textureFilterCutoff = clamp(textureFilterCutoff + seasonalShift * 300, 200, 8000);

  // Cloud cover → brightness dimming
  // Previously fetched but unused. Full overcast dims pad brightness by up to 0.25
  // and cuts the master filter by up to 30% — making overcast days audibly greyer.
  const cloudNorm = clamp((weather.cloudCover ?? 0) / 100, 0, 1);
  const cloudDimming = cloudNorm * 0.25;
  padBrightness = clamp(padBrightness - cloudDimming, 0.05, 0.95);
  masterFilterCutoff = clamp(masterFilterCutoff * (1 - cloudDimming * 0.3), 1000, 14000);

  // Moon phase → modulation
  const lfoDepth = lerp(0.1, 0.9, moonFullness);
  const lfoRate = lerp(0.02, 0.12, moonFullness);
  const chorusDepth = lerp(0.1, 0.7, moonFullness);

  // Weather condition → sound palette
  // Pad spread is base from the palette, boosted by wind speed.
  // Gusty winds create a shimmery, unstable feel — audible as wider oscillator detune.
  const basePadSpread = palette.padSpread ?? 15;
  const windPadBoost = lerp(0, 8, windNorm); // up to +8 cents in strong wind
  const padSpread = clamp(basePadSpread + windPadBoost, 8, 38);
  const textureVolume = palette.textureVolume;
  const noiseType = palette.noiseType;
  const arpeggioOctave = palette.arpeggioOctave || 4;
  const percussionVolume = palette.percussionVolume || -24;

  // ── Sunrise/sunset transition shimmer + filter warmth ──
  const filterWarmth = sunTransition.transitionIntensity;
  let finalChorusDepth = chorusDepth;
  let finalPadBrightness = padBrightness;

  if (filterWarmth > 0) {
    finalChorusDepth = Math.min(1, chorusDepth + filterWarmth * 0.3);
    finalPadBrightness = Math.min(1, padBrightness + filterWarmth * 0.15);
    // Golden-hour warmth: reduce high frequencies
    masterFilterCutoff *= (1 - filterWarmth * 0.2);
  }

  // Humidity brightness: apply after all other brightness modifiers
  finalPadBrightness = clamp(finalPadBrightness + humidityBrightnessMod, 0.05, 0.95);

  // ── AQI haze effect ──
  const aqiNorm = options.aqiLevel != null
    ? clamp((options.aqiLevel - 50) / 250, 0, 1)  // Below 50 = no effect
    : 0;

  if (aqiNorm > 0) {
    // Muffle the sound: reduce high frequencies, increase reverb
    masterFilterCutoff *= (1 - aqiNorm * 0.4);
    reverbWet = Math.min(0.85, reverbWet + aqiNorm * 0.2);
    reverbDecay = Math.min(15, reverbDecay + aqiNorm * 3);
  }

  // ── UV index shimmer ──
  const uvNorm = clamp((weather.uvIndex ?? 0) / 11, 0, 1);
  const arpeggioFilterCutoff = lerp(2000, 8000, uvNorm);

  // ── Dynamic velocity (time-of-day volume) ──
  const velocityBase = lerp(0.4, 1.0, timeOfDay.brightness);
  const seasonalVelocityMod = lerp(0.85, 1.0, seasonalFactor);
  const globalVelocityScale = velocityBase * seasonalVelocityMod;

  // Tide → bass swell (optional)
  let finalBassVolume = bassVolume;
  if (options.tideLevel != null) {
    const tideNorm = clamp(inverseLerp(-1, 8, options.tideLevel), 0, 1);
    finalBassVolume = lerp(bassVolume, bassVolume + 4, tideNorm);
  }

  // Rain effects
  const isRaining = ['rain', 'drizzle', 'storm'].includes(category);
  const rainIntensity = category === 'storm' ? 0.8 : category === 'rain' ? 0.5 : category === 'drizzle' ? 0.2 : 0;

  // ── Progression-driving params ──
  const arpeggioRhythmPattern = mapWeatherToArpeggioRhythm(category);
  const percussionPattern = mapWeatherToPercussionPattern(category);

  // ── Timbre profile ──
  // Drives oscillator type, harmonic count, and envelope character across voices.
  // Warm sunny days bloom slowly with rich harmonics; cold days are crystalline;
  // storms are raw and agitated. Uses apparent temperature for felt experience.
  const timbreProfile = (() => {
    const felt = weather.apparentTemperature ?? weather.temperature;
    if (category === 'storm' || (category === 'rain' && felt < 10)) return 'stormy';
    if (felt >= 18 && (category === 'clear' || category === 'cloudy')) return 'warm';
    if (felt < 5) return 'cold';
    return 'cool';
  })();

  // ── Drone volume (always present, louder at low pressure) ──
  const droneVolume = lerp(-34, -26, 1 - pressNorm);

  // ── Sub-bass gain (parallel bus physical impact) ──
  // Low pressure systems carry more sub energy; stormy conditions maximize rumble.
  // Range 0.1–0.55 is conservative — sub buses can easily overwhelm a mix.
  const subBassGain = (() => {
    const base = lerp(0.2, 0.45, 1 - pressNorm); // Low pressure → more sub
    const categoryBoost = {
      storm: 0.2, rain: 0.1, drizzle: 0.05, fog: 0.05,
      cloudy: 0, clear: -0.05, snow: 0.05,
    };
    return clamp(base + (categoryBoost[category] ?? 0), 0.1, 0.55);
  })();

  // ── Percussion reverb wet — category-driven short reverb tail ──
  // Storm/rain: drier (snappy hits); fog: wetter (distant smear)
  const percussionReverbWet = ({ storm: 0.12, rain: 0.15, drizzle: 0.2, fog: 0.35, snow: 0.28, cloudy: 0.22, clear: 0.18 })[category] ?? 0.22;

  // ── Delay feedback — pressure-driven echo smear ──
  // Low pressure → more feedback (unstable, swirling); high pressure → crisp echo
  const delayFeedback = (() => {
    const base = lerp(0.15, 0.35, 1 - pressNorm);
    return category === 'storm' ? Math.min(base + 0.1, 0.45) : base;
  })();

  // ── Stereo width — wind-driven spatial expansion ──
  // Calm = intimate (narrow); gusty = wide and spacious
  const arpeggioWidth = lerp(0.25, 0.75, windNorm);
  const melodyWidth = lerp(0.2, 0.6, windNorm);

  // ── Pressure trend — barometric change modulation ──
  const pressureTrend = clamp(options.pressureTrend ?? 0, -1, 1);
  // Falling barometer: darken filter, boost sub for anticipation/tension
  // Rising barometer: slight brightness, clean reverb
  if (pressureTrend < 0) {
    const fallStrength = Math.abs(pressureTrend);
    masterFilterCutoff = clamp(masterFilterCutoff - 500 * fallStrength, 1000, 14000);
  } else if (pressureTrend > 0) {
    // Rising pressure: gentle brightness boost (applied to pre-final brightness)
    padBrightness = clamp(padBrightness + 0.05 * pressureTrend, 0.05, 0.95);
  }

  // ── Melody params ──
  const melodyMood = mapWeatherToMelodyMood(category);
  const melodyBaseVolume = lerp(-22, -12, timeOfDay.brightness);
  const melodyVolume = melodyBaseVolume + (palette.melodyVolumeOffset || 0);

  // ── Binaural panning ──
  const arpeggioPan = -percussionPan * 0.4;
  const melodyPan = Math.sin(now.getTime() / 60000) * 0.3;

  return {
    rootNote,
    scaleType,
    bpm: Math.round(bpm),
    padVolume: palette.padVolume || -14,
    arpeggioVolume,
    bassVolume: finalBassVolume,
    textureVolume,
    percussionVolume,
    droneVolume,
    melodyVolume,
    padBrightness: finalPadBrightness,
    padSpread,
    bassCutoff,
    noteInterval,
    arpeggioPattern,
    arpeggioOctave,
    arpeggioFilterCutoff,
    reverbDecay,
    reverbWet,
    chorusDepth: finalChorusDepth,
    masterFilterCutoff,
    noiseType,
    textureFilterCutoff,
    lfoRate,
    lfoDepth,
    rhythmDensity,
    percussionPan,
    arpeggioPan,
    melodyPan,
    globalVelocityScale,
    isRaining,
    rainIntensity,
    // Texture atmosphere modulation
    textureAutoFilterRate,
    textureAutoFilterDepth,
    // Drone filter
    droneCutoff,
    // Sub-bass parallel bus
    subBassGain,
    // Percussion reverb wet level
    percussionReverbWet,
    // Delay feedback
    delayFeedback,
    // Stereo width
    arpeggioWidth,
    melodyWidth,
    timbreProfile,
    // Progression-driving params
    weatherCategory: category,
    pressureNorm: pressNorm,
    arpeggioRhythmPattern,
    percussionPattern,
    melodyMood,
    // Pass through for display
    _meta: {
      category,
      moonPhase,
      moonFullness,
      timeOfDay: timeOfDay.label,
      sunTransition: sunTransition.transitionIntensity,
      filterWarmth,
      aqiNorm,
      seasonalFactor,
    },
  };
}

// --- Temperature Mapping ---

const ROOT_NOTES = ['C', 'G', 'D', 'A', 'E', 'B', 'F#', 'C#', 'G#', 'D#', 'A#', 'F'];

function mapTemperature(tempC) {
  let modeIndex;
  if (tempC < -10) modeIndex = 0;       // locrian
  else if (tempC < 0) modeIndex = 1;    // aeolian
  else if (tempC < 10) modeIndex = 2;   // dorian
  else if (tempC < 20) modeIndex = 3;   // mixolydian
  else if (tempC < 30) modeIndex = 4;   // ionian
  else modeIndex = 5;                    // lydian

  const rootIndex = Math.abs(Math.floor(tempC / 3)) % ROOT_NOTES.length;

  return {
    rootNote: ROOT_NOTES[rootIndex],
    scaleType: MODE_SPECTRUM[modeIndex],
  };
}

// --- Time of Day Mapping ---

function mapTimeOfDay(now, sunrise, sunset) {
  const nowMs = now.getTime();
  const sunriseMs = sunrise.getTime();
  const sunsetMs = sunset.getTime();
  const dayLength = sunsetMs - sunriseMs;
  const midday = sunriseMs + dayLength / 2;

  if (nowMs < sunriseMs || nowMs > sunsetMs) {
    return { brightness: 0.1, label: 'night' };
  }

  const distFromMidday = Math.abs(nowMs - midday) / (dayLength / 2);
  const brightness = clamp(1 - distFromMidday * distFromMidday, 0.1, 1.0);

  let label;
  if (brightness < 0.3) label = nowMs < midday ? 'dawn' : 'dusk';
  else label = nowMs < midday ? 'morning' : 'afternoon';

  return { brightness, label };
}

// --- Sun Transition Mapping ---

function mapSunTransition(now, sunrise, sunset) {
  const WINDOW = 30 * 60 * 1000;
  const nowMs = now.getTime();
  const sunriseProximity = 1 - clamp(Math.abs(nowMs - sunrise.getTime()) / WINDOW, 0, 1);
  const sunsetProximity = 1 - clamp(Math.abs(nowMs - sunset.getTime()) / WINDOW, 0, 1);

  return {
    transitionIntensity: Math.max(sunriseProximity, sunsetProximity),
  };
}

// --- Wind Direction → Pattern ---

function mapWindDirectionToPattern(degrees) {
  if (degrees < 90) return 'up';
  if (degrees < 180) return 'upDown';
  if (degrees < 270) return 'down';
  return 'random';
}

// --- Weather Palettes ---

const WEATHER_PALETTES = {
  clear: {
    padSpread: 10,
    textureVolume: -40,
    noiseType: null,
    padVolume: -14,
    arpeggioOctave: 4,
    percussionVolume: -26,
    melodyVolumeOffset: 0,
  },
  cloudy: {
    padSpread: 18,
    textureVolume: -32,
    noiseType: null,
    padVolume: -13,
    arpeggioOctave: 4,
    percussionVolume: -24,
    melodyVolumeOffset: -2,
  },
  fog: {
    padSpread: 25,
    textureVolume: -22,
    noiseType: 'pink',
    textureFilterCutoff: 600,
    padVolume: -12,
    arpeggioOctave: 4,
    percussionVolume: -28,
    melodyVolumeOffset: -6,
  },
  drizzle: {
    padSpread: 18,
    textureVolume: -24,
    noiseType: 'pink',
    padVolume: -13,
    arpeggioOctave: 5,
    percussionVolume: -24,
    melodyVolumeOffset: -2,
  },
  rain: {
    padSpread: 22,
    textureVolume: -16,
    noiseType: 'pink',
    padVolume: -13,
    arpeggioOctave: 5,
    percussionVolume: -22,
    melodyVolumeOffset: -3,
  },
  snow: {
    padSpread: 20,
    textureVolume: -20,
    noiseType: 'white',
    textureFilterCutoff: 800,
    padVolume: -12,
    arpeggioOctave: 5,
    percussionVolume: -28,
    melodyVolumeOffset: -4,
  },
  storm: {
    padSpread: 30,
    textureVolume: -10,
    noiseType: 'brown',
    padVolume: -11,
    arpeggioOctave: 3,
    percussionVolume: -16,
    melodyVolumeOffset: -2,
  },
};

// --- Arpeggio Rhythm Pattern Mapping ---

function mapWeatherToArpeggioRhythm(category) {
  switch (category) {
    case 'clear':   return 'ethereal';
    case 'fog':     return 'ethereal';
    case 'snow':    return 'ethereal';
    case 'cloudy':  return 'flowing';
    case 'drizzle': return 'flowing';
    case 'rain':    return 'rippling';
    case 'storm':   return 'cascading';
    default:        return 'flowing';
  }
}

// --- Percussion Pattern Mapping ---

function mapWeatherToPercussionPattern(category) {
  switch (category) {
    case 'clear':   return 'minimal';
    case 'cloudy':  return 'pulse';
    case 'fog':     return 'ghost';
    case 'drizzle': return 'dripping';
    case 'rain':    return 'dripping';
    case 'snow':    return 'ghost';
    case 'storm':   return 'driving';
    default:        return 'pulse';
  }
}

// --- Melody Mood Mapping ---

function mapWeatherToMelodyMood(category) {
  return CATEGORY_TO_MOOD[category] || 'calm';
}

// --- Utility Functions ---

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function inverseLerp(a, b, value) {
  return (value - a) / (b - a);
}

function selectFromRange(items, t) {
  const index = Math.min(Math.floor(t * items.length), items.length - 1);
  return items[index];
}
