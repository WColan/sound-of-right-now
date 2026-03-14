import { categorizeWeatherCode } from '../weather/codes.js';
import { getMoonPhase, getMoonFullness } from '../weather/moon.js';
import { getSeasonalFactor, getSeasonName } from '../weather/season.js';
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
 * @param {number} [options.pm25] - PM2.5 concentration in μg/m³ (null if unavailable)
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
  const seasonName = getSeasonName(now, options.latitude ?? 40);

  // Temperature → mode + tempo + root
  // Harmonic mode/root use apparent temperature (feels-like) — wind chill and heat index
  // reflect the body's actual experience, which is what the music should match.
  // BPM stays tied to the physical thermometer: physical pace, not perceived comfort.
  let { rootNote, scaleType } = mapTemperature(weather.apparentTemperature ?? weather.temperature);

  // Contextual minor-mode override: cold snow and stormy aeolian benefit from
  // the raised 7th in harmonic minor (leading tone tension) or the brighter 6th
  // in melodic minor (ascending drive). Only triggers in specific conditions.
  if ((category === 'snow' && (weather.apparentTemperature ?? weather.temperature) < 0) ||
      (category === 'storm' && scaleType === 'aeolian')) {
    scaleType = Math.random() < 0.5 ? 'harmonicMinor' : 'melodicMinor';
  }
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
  const rhythmDensity = lerp(0.05, 0.6, windNorm);
  const arpeggioVolume = lerp(-26, -14, windNorm);
  // Wind chime activates above 3 km/h (light breeze). Volume is wind-driven —
  // stronger wind = louder chimes. Humidity controls decay time (via
  // windChimeDecayMod): dry air = shorter, crisper ring; humid air = longer,
  // damped resonance. Wind controls strike *frequency* via setWindSpeed().
  const windChimeVolume = weather.windSpeed > 3 ? lerp(-20, -10, windNorm) : -80;
  // 0.75 = dry/crisp, 1.4 = humid/sustained
  const windChimeDecayMod = lerp(0.75, 1.4, humNorm);
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
  // Chorus depth: moon (60%) + humidity (40%).
  // Full moon = lush shimmer; humid air = thick, blurred wash (chorus is a
  // blurring effect, making humid/muggy the more direct physical analog).
  const chorusDepth = lerp(0.1, 0.7, clamp(moonFullness * 0.6 + humNorm * 0.4, 0, 1));

  // Weather condition → sound palette
  // Pad spread is base from the palette, boosted by wind speed.
  // Gusty winds create a shimmery, unstable feel — audible as wider oscillator detune.
  const basePadSpread = palette.padSpread ?? 15;
  const windPadBoost = lerp(0, 8, windNorm); // up to +8 cents in strong wind
  let padSpread = clamp(basePadSpread + windPadBoost, 8, 38);
  const textureVolume = palette.textureVolume;
  const noiseType = palette.noiseType;
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

  // ── PM2.5 particulate grain intensity ──
  // Fine particulate matter (smoke, smog, dust) has a distinct gritty quality
  // separate from general AQI haze. No effect below 35 μg/m³ (US "moderate"
  // threshold); full crackle at 150 μg/m³ (US "unhealthy").
  const pm25GrainIntensity = options.pm25 != null
    ? clamp((options.pm25 - 35) / 115, 0, 1)
    : 0;

  // ── Seasonal instrument palette ──
  // Multiplicative modifiers on reverb + chorus; additive brightness floor.
  const sPal = SEASONAL_PALETTES[seasonName] || SEASONAL_PALETTES.summer;
  reverbDecay = clamp(reverbDecay * sPal.reverbDecayMod, 1.5, 15);
  reverbWet = clamp(reverbWet * sPal.reverbWetMod, 0.1, 0.85);
  finalChorusDepth = clamp(finalChorusDepth * sPal.chorusWetMod, 0.05, 1);
  finalPadBrightness = Math.max(sPal.brightnessFloor, finalPadBrightness);

  // ── Biome timbre modulation ──
  // Shifts reverb, master filter, and pad spread based on terrain type.
  const biomeId = options.biome ?? 'grassland';
  const bt = BIOME_TIMBRES[biomeId] || BIOME_TIMBRES.grassland;
  reverbWet = clamp(reverbWet + bt.reverbWetAdd, 0.1, 0.85);
  masterFilterCutoff = clamp(masterFilterCutoff + bt.filterShift, 1000, 14000);
  padSpread = clamp(padSpread + bt.spreadMod, 8, 38);

  // ── UV index → heat shimmer (pad detune spread) ──
  // UV is redundant with time-of-day + cloud cover for brightness, but maps
  // naturally to heat shimmer: intense solar radiation creates pitch instability
  // (visible haze has an auditory analog — a widened, shimmering detune).
  // The arpeggio filter instead tracks overall scene brightness so it dims
  // at night and stays coherent with the master filter.
  const uvNorm = clamp((weather.uvIndex ?? 0) / 11, 0, 1);
  padSpread = clamp(padSpread + uvNorm * 15, 8, 45); // up to +15 cents of heat shimmer
  const arpeggioFilterCutoff = lerp(2000, 6000, timeOfDay.brightness);

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
  // Storm ceiling raised to 0.7 for genuine sub rumble; other categories stay ≤0.55
  // to avoid overwhelming the mix. The sub bus has a Chebyshev saturator so the
  // extra gain creates harmonic content on speakers that can not reproduce sub-bass.
  const subBassGain = (() => {
    const base = lerp(0.2, 0.45, 1 - pressNorm); // Low pressure → more sub
    const categoryBoost = {
      storm: 0.25, rain: 0.1, drizzle: 0.05, fog: 0.05,
      cloudy: 0, clear: -0.05, snow: 0.05,
    };
    const ceiling = category === 'storm' ? 0.7 : 0.55;
    return clamp(base + (categoryBoost[category] ?? 0), 0.1, ceiling);
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

  // ── Choir volume ──
  // The formant choir is driven by humidity (moist air = fuller, more present voice)
  // and moonfulness (full moon brings the choir forward in the mix).
  const choirVolume = lerp(-24, -12, clamp(humNorm * 0.5 + moonFullness * 0.5, 0, 1));

  // ── Binaural panning ──
  const arpeggioPan = -percussionPan * 0.4;
  // Melody slowly orbits left/right over ~1 minute. Moon fullness widens the
  // arc: a full moon extends the range to ±0.45, a new moon narrows to ±0.2.
  // This couples the moon modulation (already driving LFO/chorus) to spatial position.
  const melodyPanRange = lerp(0.2, 0.45, moonFullness);
  const melodyPan = Math.sin(now.getTime() / 60000) * melodyPanRange;

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
    choirVolume,
    padBrightness: finalPadBrightness,
    padSpread,
    bassCutoff,
    arpeggioPattern,
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
    // Wind chime
    windChimeVolume,
    windChimeDecayMod,
    // PM2.5 particulate grain texture
    pm25GrainIntensity,
    timbreProfile,
    seasonalPalette: seasonName,
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
      seasonName,
      biome: biomeId,
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

  // Step size ÷10 (was ÷3): root changes every 10 °C rather than every 3 °C,
  // reducing arbitrary key modulations from small temperature fluctuations.
  const rootIndex = Math.abs(Math.floor(tempC / 10)) % ROOT_NOTES.length;

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
    padVolume: -16,
    percussionVolume: -22,
    melodyVolumeOffset: 0,
  },
  cloudy: {
    padSpread: 18,
    textureVolume: -32,
    noiseType: null,
    padVolume: -15,
    percussionVolume: -21,
    melodyVolumeOffset: -2,
  },
  fog: {
    padSpread: 25,
    textureVolume: -22,
    noiseType: 'pink',
    textureFilterCutoff: 600,
    padVolume: -14,
    percussionVolume: -24,
    melodyVolumeOffset: -6,
  },
  drizzle: {
    padSpread: 18,
    textureVolume: -24,
    noiseType: 'pink',
    textureFilterCutoff: 3000,
    padVolume: -15,
    percussionVolume: -20,
    melodyVolumeOffset: -2,
  },
  rain: {
    padSpread: 22,
    textureVolume: -16,
    noiseType: 'pink',
    textureFilterCutoff: 4500,
    padVolume: -15,
    percussionVolume: -19,
    melodyVolumeOffset: -3,
  },
  snow: {
    padSpread: 20,
    textureVolume: -20,
    noiseType: 'white',
    textureFilterCutoff: 800,
    padVolume: -14,
    percussionVolume: -24,
    melodyVolumeOffset: -4,
  },
  storm: {
    padSpread: 30,
    textureVolume: -10,
    noiseType: 'brown',
    padVolume: -13,
    percussionVolume: -14,
    melodyVolumeOffset: -2,
  },
};

// --- Biome Timbre Modifiers ---
// Each biome applies additive/multiplicative adjustments to reverb, filter, and spread.
// These are post-processed in mapWeatherToMusic() after weather-driven calculations.
const BIOME_TIMBRES = {
  coastal:   { reverbWetAdd: 0.15, filterShift: 500,   spreadMod: 3  },
  desert:    { reverbWetAdd: -0.1, filterShift: -800,  spreadMod: -5 },
  forest:    { reverbWetAdd: 0.08, filterShift: -300,  spreadMod: 2  },
  mountain:  { reverbWetAdd: 0.25, filterShift: 1000,  spreadMod: 5  },
  urban:     { reverbWetAdd: -0.05, filterShift: -200, spreadMod: -3 },
  grassland: { reverbWetAdd: 0,    filterShift: 0,     spreadMod: 0  },
  arctic:    { reverbWetAdd: 0.2,  filterShift: -500,  spreadMod: -8 },
  wetland:   { reverbWetAdd: 0.12, filterShift: -400,  spreadMod: 4  },
  tropical:  { reverbWetAdd: 0.05, filterShift: 600,   spreadMod: 6  },
};

// --- Seasonal Instrument Palettes ---
// Each season modulates reverb, chorus, and brightness as multiplicative/additive
// adjustments on top of the weather-driven base. Applied in mapWeatherToMusic().
const SEASONAL_PALETTES = {
  winter: {
    reverbDecayMod: 1.3,    // Longer tails — icy reflections
    reverbWetMod: 1.1,
    chorusWetMod: 0.7,      // Less chorus — crystalline clarity
    brightnessFloor: 0.08,  // Allow very dark
  },
  spring: {
    reverbDecayMod: 0.9,    // Shorter, crisper
    reverbWetMod: 0.95,
    chorusWetMod: 1.0,
    brightnessFloor: 0.2,   // Brighter minimum
  },
  summer: {
    reverbDecayMod: 1.0,
    reverbWetMod: 1.0,
    chorusWetMod: 1.2,      // Lush, wide chorus
    brightnessFloor: 0.2,
  },
  autumn: {
    reverbDecayMod: 1.15,   // Slightly longer — muted decay
    reverbWetMod: 1.05,
    chorusWetMod: 0.85,     // Narrower
    brightnessFloor: 0.12,
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
