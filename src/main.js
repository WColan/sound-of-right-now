import * as Tone from 'tone';
import { inject } from '@vercel/analytics';
import { createSoundEngine } from './music/engine.js';
import { mapWeatherToMusic } from './music/mapper.js';
import { createInterpolator } from './music/interpolator.js';
import { getBrowserLocation, formatLocation, reverseGeocode } from './weather/location.js';
import { buildShareSearch, parseSharedCoordinates } from './weather/share.js';
import { getMoonriseTime, getMoonsetTime, getMoonPhaseName } from './weather/moon.js';
import { describeWeatherCode } from './weather/codes.js';
import { getSeasonName } from './weather/season.js';
import { degreesToCompass } from './ui/display.js';
import { createWeatherFetcher } from './weather/fetcher.js';
import { createTideFetcher } from './weather/tides.js';
import { createAirQualityFetcher } from './weather/airquality.js';
import { createDisplay } from './ui/display.js';
import { createControls } from './ui/controls.js';
import { createVisualizer } from './ui/visualizer.js';
import { setupOverlayStartShortcuts, setupSecondaryMenu, showPrimaryControls } from './ui/shell.js';
import { classifyBiome } from './weather/biome.js';
import { createMovementConductor, CONDUCTOR_ENABLED } from './music/movement.js';
import { VERSION } from './version.js';

// Vercel Web Analytics (framework-agnostic integration for this vanilla JS app).
inject();

// Print version to console for quick production build identification
console.info(`[SONAR] v${VERSION}`);

// Stamp version into the landing overlay badge
const overlayVersion = document.getElementById('overlay-version');
if (overlayVersion) overlayVersion.textContent = `v${VERSION}`;

let engine = null;
let interpolator = null;
let weatherFetcher = null;
let tideFetcher = null;
let aqiFetcher = null;
let display = null;
let visualizer = null;
let movementConductor = null;
let conductorTickInterval = null;
let currentTideData = null;
let currentAqiData = null;
let currentLatitude = null;
let currentLongitude = null;
let currentBiome = 'grassland';
let isPlaying = true; // Track play/pause state for the pause button
let currentLocationRequestId = 0;
let userVolumeScale = 0.8;
let secondaryMenuController = null;

// ── Voice volume param mapping (module-level for applyExpression access) ──
const VOICE_VOLUME_PARAMS_MAP = {
  pad: 'padVolume', arpeggio: 'arpeggioVolume', bass: 'bassVolume',
  melody: 'melodyVolume', texture: 'textureVolume',
  percussion: 'percussionVolume', drone: 'droneVolume',
  windChime: 'windChimeVolume', choir: 'choirVolume',
};
let mutedVoiceTracker = null; // Set reference, assigned in boot()

// ── Pressure trend buffer ──
// Rolling window of the last 3 pressure readings (timestamp + value).
// Used to detect rising/falling barometer and modulate tension/brightness.
const pressureHistory = []; // [{ value: number, timestamp: number }, ...]

/**
 * Update the pressure history and return the normalized trend.
 * Returns a value in [-1, +1]: negative = falling, positive = rising, 0 = stable.
 */
function getPressureTrend(pressureHpa) {
  pressureHistory.push({ value: pressureHpa, timestamp: Date.now() });
  if (pressureHistory.length > 3) pressureHistory.shift();

  if (pressureHistory.length < 2) return 0;
  const delta = pressureHistory.at(-1).value - pressureHistory[0].value;
  return Math.max(-1, Math.min(1, delta / 5)); // Normalize: ±5 hPa = ±1.0
}

/**
 * Compute aurora intensity for high-latitude locations.
 * Returns 0-1: product of latitude factor, darkness factor, and sky clarity.
 *
 * Thresholds are intentionally generous — aurora is high-altitude light that
 * punches through moderate cloud cover and is faintly visible during late dusk:
 *   Cloud cover: visible up to ~65%, fading progressively (not a hard cutoff)
 *   Brightness:  faintly visible up to 0.3 (late dusk), peaks in full dark
 */
function computeAuroraIntensity(lat, brightness, cloudCover) {
  const latFactor = Math.max(0, Math.min(1, (Math.abs(lat) - 55) / 15));
  // Wider brightness window: faintly visible in late dusk (0.3), peaks at full dark
  const darkFactor = Math.max(0, Math.min(1, (0.3 - brightness) / 0.3));
  // Cloud cover: progressive dimming up to ~65%; quadratic for natural falloff
  const cloudNorm = Math.min(1, cloudCover / 65);
  const clearFactor = Math.max(0, 1 - cloudNorm * cloudNorm);
  return latFactor * darkFactor * clearFactor;
}

// ── Expression swell ranges (additive dB per voice at full intensity) ──
const SWELL_RANGES = {
  padVolume: 4, arpeggioVolume: 6, bassVolume: 3, textureVolume: 4,
  percussionVolume: 4, droneVolume: 3, melodyVolume: 5, choirVolume: 4,
  windChimeVolume: 3,
};

/**
 * Apply movement expression on top of weather baselines.
 * Reads the interpolator's currentParams for weather values and adds
 * expression offsets using the engine's rampParam API.
 *
 * When CONDUCTOR_ENABLED is false, this is a no-op.
 *
 * @param {object} expression - From movementConductor.getExpression()
 * @param {number} rampTime - Seconds to ramp (smooth transitions)
 */
function applyExpression(expression, rampTime = 5) {
  if (!CONDUCTOR_ENABLED || !engine || !interpolator) return;

  const params = interpolator.currentParams;
  if (!params) return;

  const { dynamicSwell, harmonicTension, rhythmicEnergy, melodicUrgency, effectDepth } = expression;

  // ── Voice volumes: additive dB swell ──
  const mutedVoicesSet = mutedVoiceTracker;
  for (const [paramKey, maxSwell] of Object.entries(SWELL_RANGES)) {
    const baseline = params[paramKey];
    if (baseline == null) continue;

    // Find voice name from param key
    const voiceName = Object.entries(VOICE_VOLUME_PARAMS_MAP).find(([, p]) => p === paramKey)?.[0];
    if (voiceName && mutedVoicesSet?.has(voiceName)) continue; // Don't swell muted voices

    const swellDb = dynamicSwell * maxSwell;
    engine.rampParam(paramKey, baseline + swellDb, rampTime);
  }

  // ── Melody: extra swell + probability scaling ──
  if (engine.voices?.melody) {
    engine.voices.melody.setProbabilityScale(1 + melodicUrgency * 0.6);
  }

  // ── Harmonic tension ──
  engine.setMovementTension(harmonicTension);

  // ── Rhythm: density boost ──
  const baseDensity = params.rhythmDensity ?? 0.2;
  const boostedDensity = Math.min(1, baseDensity * (1 + rhythmicEnergy * 0.8));
  engine.rampParam('rhythmDensity', boostedDensity, rampTime);

  // ── Effects: reverb, chorus, delay, filter ──
  const baseReverbWet = params.reverbWet ?? 0.3;
  engine.rampParam('reverbWet', Math.min(0.7, baseReverbWet + effectDepth * 0.15), rampTime);

  const baseChorusDepth = params.chorusDepth ?? 0.5;
  engine.rampParam('chorusDepth', Math.min(0.9, baseChorusDepth + effectDepth * 0.2), rampTime);

  const baseDelayFeedback = params.delayFeedback ?? 0.2;
  engine.rampParam('delayFeedback', Math.min(0.5, baseDelayFeedback + effectDepth * 0.1), rampTime);

  // Master filter opens during expression swell
  const baseMasterFilter = params.masterFilterCutoff ?? 8000;
  engine.rampParam('masterFilterCutoff', Math.min(16000, baseMasterFilter * (1 + effectDepth * 0.4)), rampTime);

  // Spatial width expands during swell
  const baseArpWidth = params.arpeggioWidth ?? 0.4;
  engine.rampParam('arpeggioWidth', Math.min(1, baseArpWidth + effectDepth * 0.2), rampTime);
  const baseMelWidth = params.melodyWidth ?? 0.3;
  engine.rampParam('melodyWidth', Math.min(1, baseMelWidth + effectDepth * 0.15), rampTime);

  // ── Microtonal: activate when harmonicTension is high ──
  if (harmonicTension > 0.6 && engine.updateMicrotonalContext) {
    // Force microtonal on during high tension regardless of weather
    engine.updateMicrotonalContext('fog', 0, 0); // 'fog' triggers microtonal
  }

  // Log expression state periodically
  const phase = movementConductor?.getCurrentPhase();
  if (phase) {
    console.log(
      `🎼 Expression: ${phase.name} (mvt #${phase.movementNumber} ${phase.personality}) ` +
      `intensity=${expression.intensity.toFixed(2)} swell=${dynamicSwell.toFixed(2)} ` +
      `tension=${harmonicTension.toFixed(2)} rhythm=${rhythmicEnergy.toFixed(2)} ` +
      `melody=${melodicUrgency.toFixed(2)} fx=${effectDepth.toFixed(2)}`
    );
  }
}

/**
 * Start the conductor tick interval.
 * Ticks every 8 seconds for smooth expression between 60s weather polls.
 */
function startConductorTick() {
  stopConductorTick();
  if (!CONDUCTOR_ENABLED || !movementConductor) return;

  conductorTickInterval = setInterval(() => {
    if (!isPlaying || !movementConductor) return;
    movementConductor.tick();
    applyExpression(movementConductor.getExpression(), 5);
  }, 8000);
}

function stopConductorTick() {
  if (conductorTickInterval) {
    clearInterval(conductorTickInterval);
    conductorTickInterval = null;
  }
}

// Clean up on HMR to prevent duplicate audio contexts
if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    if (engine) engine.dispose();
    if (weatherFetcher) weatherFetcher.stop();
    if (tideFetcher) tideFetcher.stop();
    if (aqiFetcher) aqiFetcher.stop();
    if (visualizer) visualizer.dispose();
    if (secondaryMenuController) secondaryMenuController.dispose();
    stopConductorTick();
  });
}

/**
 * Process a weather update: map to music, interpolate, update display + visuals.
 */
function onWeatherUpdate(weather) {
  if (!interpolator || !display || !visualizer) return;

  const pressureTrend = getPressureTrend(weather.pressure);

  const musicalParams = mapWeatherToMusic(weather, {
    tideLevel: currentTideData?.waterLevel ?? null,
    aqiLevel: currentAqiData?.aqi ?? null,
    latitude: currentLatitude ?? 40,
    pressureTrend,
    biome: currentBiome,
  });

  interpolator.update(musicalParams);
  display.update(weather, musicalParams, currentTideData, currentAqiData);

  // Update conductor weather context for personality selection
  if (CONDUCTOR_ENABLED && movementConductor) {
    movementConductor.setWeatherContext(musicalParams._meta.category);
  }

  // Compute moonrise/moonset from phase + today's sunrise/sunset
  const now = new Date();
  const moonrise = getMoonriseTime(now, weather.sunrise, weather.sunset);
  const moonset  = getMoonsetTime(now, weather.sunrise, weather.sunset);

  // ── Milky Way shimmer intensity ──
  // Progressive 0-1 value: dark night + low cloud cover + dim moon.
  // Instead of a binary clear/not-clear gate, cloud cover dims gradually:
  //   0% cloud  → full visibility
  //  25% cloud  → ~50% (still clearly visible through gaps)
  //  50% cloud  → ~12% (faint glow between clouds)
  //  70%+ cloud → effectively invisible
  // Precipitation categories (rain, snow, storm, fog) kill it outright.
  const mwBrightnessAlpha = Math.max(0, (0.35 - musicalParams.padBrightness) / 0.35);
  const mwMoonAlpha       = Math.max(0, (0.55 - (musicalParams._meta.moonFullness ?? 0)) / 0.55);
  const mwCategory = musicalParams._meta.category;
  const mwCloudPct = (weather.cloudCover ?? 0) / 100;
  // Precipitation/fog blocks starlight entirely; clouds dim progressively
  const mwPrecipBlock = (mwCategory === 'rain' || mwCategory === 'storm'
    || mwCategory === 'snow' || mwCategory === 'fog' || mwCategory === 'drizzle')
    ? 0 : 1;
  // Quadratic falloff: gentle at low cloud %, steepens toward overcast
  const mwCloudAlpha = Math.max(0, 1 - mwCloudPct * mwCloudPct * 2.0);
  const milkyWayIntensity = mwPrecipBlock
    * mwCloudAlpha
    * Math.min(mwBrightnessAlpha, mwMoonAlpha);
  // ── Aurora intensity — computed outside engine guard for visualizer use too ──
  const auroraIntensity = computeAuroraIntensity(
    currentLatitude ?? 0, musicalParams.padBrightness, weather.cloudCover ?? 0
  );

  // Update melody's golden-hour / full-moon probability boosts
  if (engine) {
    engine.updateCelestialContext(
      musicalParams._meta.sunTransition,
      musicalParams._meta.moonFullness,
    );

    // Update microtonal pitch drift (active for fog, high UV, or extreme heat)
    const uvNorm = Math.min(1, (weather.uvIndex ?? 0) / 11);
    engine.updateMicrotonalContext(
      musicalParams._meta.category,
      uvNorm,
      weather.apparentTemperature ?? weather.temperature,
    );

    // Update wind chime strike frequency from current wind speed
    engine.updateWindChime(weather.windSpeed);

    // ── Aurora shimmer — boost choir formant resonance during northern lights ──
    engine.updateAuroraShimmer(auroraIntensity);

    // ── Milky Way shimmer ──
    // Composite intensity (0-1) from progressive conditions:
    //  1. Dark night  — padBrightness proxy (< 0.35 ≈ night/deep-dusk)
    //  2. Low clouds  — progressive dimming with cloud cover (quadratic)
    //  3. Dim moon    — moonFullness < 0.55 (bright moon washes it out)
    //  4. No precip   — rain/snow/fog/drizzle blocks starlight
    engine.updateMilkyWayShimmer(milkyWayIntensity);
  }

  visualizer.updateState({
    timeOfDay: musicalParams._meta.timeOfDay,
    weatherCategory: musicalParams._meta.category,
    windSpeed: weather.windSpeed,
    windDirection: weather.windDirection,
    moonPhase: musicalParams._meta.moonPhase,
    moonFullness: musicalParams._meta.moonFullness,
    brightness: musicalParams.padBrightness,
    tideLevel: currentTideData?.waterLevel ?? null,
    sunTransition: musicalParams._meta.sunTransition,
    cloudCover: weather.cloudCover ?? 0,
    filterWarmth: musicalParams._meta.filterWarmth ?? 0,
    aqiNorm: musicalParams._meta.aqiNorm ?? 0,
    temperature: weather.temperature,
    latitude: currentLatitude,
    // Celestial positioning
    sunrise: weather.sunrise,
    sunset: weather.sunset,
    moonrise,
    moonset,
    // Milky Way + shooting star gating intensity (0-1)
    milkyWayIntensity,
    // Biome + elevation + terrain seed for terrain silhouette (Feature 1/5)
    biome: currentBiome,
    elevation: weather.elevation ?? 0,
    terrainSeed: Math.abs(Math.sin(currentLatitude * 1234.5 + currentLongitude * 6789.1)) * 10000,
    // Aurora intensity for northern lights (Feature 4)
    auroraIntensity,
  });

  // ── Detailed logging: data inputs → sound mappings ──
  console.groupCollapsed(
    `🌤 Weather Update: ${weather.temperature.toFixed(1)}°C ${musicalParams._meta.category} → ${musicalParams.rootNote} ${musicalParams.scaleType}`
  );

  console.log('%c── Environment Inputs ──', 'font-weight: bold; color: #7ba4ff');
  console.table({
    'Temperature':    { value: `${weather.temperature.toFixed(1)}°C`, effect: `→ ${musicalParams.rootNote} ${musicalParams.scaleType} (mode), ${musicalParams.bpm} BPM` },
    'Humidity':       { value: `${weather.humidity}%`, effect: `→ reverb decay ${musicalParams.reverbDecay.toFixed(1)}s, wet ${(musicalParams.reverbWet * 100).toFixed(0)}%` },
    'Pressure':       { value: `${weather.pressure.toFixed(0)} hPa`, effect: `→ bass cutoff ${musicalParams.bassCutoff.toFixed(0)}Hz, bass vol ${musicalParams.bassVolume.toFixed(1)}dB, drone vol ${musicalParams.droneVolume.toFixed(1)}dB` },
    'Wind':           { value: `${weather.windSpeed.toFixed(1)} km/h @ ${weather.windDirection}°`, effect: `→ rhythm ${musicalParams.rhythmDensity.toFixed(2)}, arp "${musicalParams.arpeggioPattern}", perc pan ${musicalParams.percussionPan.toFixed(2)}` },
    'UV Index':       { value: `${(weather.uvIndex ?? 0).toFixed(1)}`, effect: `→ arp filter ${musicalParams.arpeggioFilterCutoff.toFixed(0)}Hz` },
    'Weather Code':   { value: `${weather.weatherCode} (${musicalParams._meta.category})`, effect: `→ spread ${musicalParams.padSpread}¢, perc "${musicalParams.percussionPattern}", arp "${musicalParams.arpeggioRhythmPattern}"` },
    'Time of Day':    { value: musicalParams._meta.timeOfDay, effect: `→ brightness ${musicalParams.padBrightness.toFixed(2)}, master ${musicalParams.masterFilterCutoff.toFixed(0)}Hz, vel ${musicalParams.globalVelocityScale.toFixed(2)}x` },
    'Moon':           { value: `${(musicalParams._meta.moonFullness * 100).toFixed(0)}% full`, effect: `→ LFO ${musicalParams.lfoRate.toFixed(3)}Hz/${musicalParams.lfoDepth.toFixed(2)}, chorus ${musicalParams.chorusDepth.toFixed(2)}` },
    'Season':         { value: `factor ${musicalParams._meta.seasonalFactor.toFixed(2)}`, effect: `→ brightness/filter modulation` },
    'AQI':            { value: currentAqiData ? `${currentAqiData.aqi} (norm ${musicalParams._meta.aqiNorm.toFixed(2)})` : 'n/a', effect: currentAqiData ? `→ filter haze, reverb boost` : '→ no effect' },
    'Tide':           { value: currentTideData ? `${currentTideData.waterLevel.toFixed(1)}ft` : 'n/a', effect: currentTideData ? `→ bass swell` : '→ no effect' },
    'Golden Hour':    { value: `${(musicalParams._meta.filterWarmth * 100).toFixed(0)}%`, effect: musicalParams._meta.filterWarmth > 0 ? `→ warm filter reduction` : '→ no effect' },
  });

  console.log('%c── Sound Output ──', 'font-weight: bold; color: #ffba7a');
  console.table({
    'Key & Tempo':    `${musicalParams.rootNote} ${musicalParams.scaleType} @ ${musicalParams.bpm} BPM`,
    'Pad':            `vol ${musicalParams.padVolume}dB, bright ${musicalParams.padBrightness.toFixed(2)}, spread ${musicalParams.padSpread}¢`,
    'Arpeggio':       `vol ${musicalParams.arpeggioVolume.toFixed(1)}dB, filter ${musicalParams.arpeggioFilterCutoff.toFixed(0)}Hz, pan ${musicalParams.arpeggioPan.toFixed(2)}`,
    'Bass':           `vol ${musicalParams.bassVolume.toFixed(1)}dB, cutoff ${musicalParams.bassCutoff.toFixed(0)}Hz`,
    'Drone':          `vol ${musicalParams.droneVolume.toFixed(1)}dB`,
    'Melody':         `vol ${musicalParams.melodyVolume.toFixed(1)}dB, mood "${musicalParams.melodyMood}", pan ${musicalParams.melodyPan.toFixed(2)}`,
    'Texture':        `vol ${musicalParams.textureVolume}dB, noise "${musicalParams.noiseType || 'off'}", filter ${musicalParams.textureFilterCutoff.toFixed(0)}Hz`,
    'Percussion':     `vol ${musicalParams.percussionVolume}dB, "${musicalParams.percussionPattern}", pan ${musicalParams.percussionPan.toFixed(2)}`,
    'Master Filter':  `${musicalParams.masterFilterCutoff.toFixed(0)}Hz`,
    'Master Volume':  `${musicalParams.globalVelocityScale.toFixed(2)}x`,
    'Reverb':         `decay ${musicalParams.reverbDecay.toFixed(1)}s, wet ${(musicalParams.reverbWet * 100).toFixed(0)}%`,
    'Chorus/LFO':     `chorus ${musicalParams.chorusDepth.toFixed(2)}, LFO ${musicalParams.lfoRate.toFixed(3)}Hz/${musicalParams.lfoDepth.toFixed(2)}`,
  });

  console.groupEnd();
}

/**
 * Set up data fetching for a given location.
 * updateUrl = false for geolocation-based boots so stale coords don't persist
 * in the URL and get mistaken for a shared link on the next visit.
 */
async function startForLocation(latitude, longitude, locationName, { fadeIn = false, updateUrl = true } = {}) {
  const requestId = ++currentLocationRequestId;
  display.setLocation(locationName || 'Loading...');

  // Store lat/lng for seasonal awareness and permalink
  currentLatitude = latitude;
  currentLongitude = longitude;

  // Update URL so the current location is shareable.
  // Skip for geolocation-based loads: writing coords here would cause the next
  // page visit to parse them as a "shared link" and bypass fresh geolocation.
  if (updateUrl) {
    history.replaceState(null, '', buildShareSearch(latitude, longitude));
  } else {
    // Clear any leftover share params (e.g. from a previously visited shared link)
    history.replaceState(null, '', window.location.pathname);
  }

  // ── Tear down old audio engine ──
  // Tone.js audio nodes are permanently destroyed by dispose() and cannot be
  // restarted, so we recreate the engine from scratch on each location change.
  // This prevents accumulation of orphaned synths, sequences, and LFOs — the
  // source of the glitching heard after changing location more than once.
  if (engine) {
    engine.dispose();
    engine = createSoundEngine();
    engine.start({ bpm: 72 });
    engine.onChordChange((chordInfo) => visualizer.onChordChange(chordInfo));
    // First load: start silent and swell up; location changes: cut in immediately
    engine.setUserGainScale(fadeIn ? 0 : userVolumeScale, 0);
    if (fadeIn) engine.setUserGainScale(userVolumeScale, 3);
    engine.setSleepGainScale(1, 0);
    // Recreate interpolator too — it closes over the old (now-disposed) engine
    interpolator = createInterpolator(engine);
    // Reset conductor for fresh location — new movement arc begins
    if (CONDUCTOR_ENABLED && movementConductor) {
      movementConductor.reset();
      movementConductor.resume();
      startConductorTick();
    }
    // New engine always starts playing — reset pause button accordingly
    isPlaying = true;
    const pb = document.getElementById('pause-btn');
    if (pb) {
      const pauseIcon = pb.querySelector('.pause-icon');
      const playIcon = pb.querySelector('.play-icon');
      pauseIcon?.classList.remove('hidden');
      playIcon?.classList.add('hidden');
      pb.setAttribute('aria-label', 'pause');
    }
  }

  // Stop existing fetchers
  if (weatherFetcher) weatherFetcher.stop();
  if (tideFetcher) { tideFetcher.stop(); tideFetcher = null; }
  if (aqiFetcher) { aqiFetcher.stop(); aqiFetcher = null; }
  currentTideData = null;
  currentAqiData = null;

  // Classify biome for this location once weather provides elevation.
  // Fire-and-forget; result is used on a subsequent weather update.
  currentBiome = 'grassland'; // Reset to default while classifying
  let biomeClassificationStarted = false;

  // Set up weather fetching
  const nextWeatherFetcher = createWeatherFetcher(latitude, longitude);
  nextWeatherFetcher.onUpdate((weather) => {
    if (requestId !== currentLocationRequestId) return;
    if (!biomeClassificationStarted) {
      biomeClassificationStarted = true;
      classifyBiome(latitude, longitude, { elevation: weather.elevation ?? 0 })
        .then(b => { if (requestId === currentLocationRequestId) currentBiome = b; })
        .catch(() => { /* Biome classification failed — grassland fallback is fine */ });
    }
    onWeatherUpdate(weather);
  });
  weatherFetcher = nextWeatherFetcher;

  // Set up tide fetching (may return null for inland locations)
  try {
    const nextTideFetcher = await createTideFetcher(latitude, longitude);
    if (requestId !== currentLocationRequestId) return;
    if (nextTideFetcher) {
      tideFetcher = nextTideFetcher;
      tideFetcher.onUpdate((data) => {
        if (requestId !== currentLocationRequestId) return;
        currentTideData = data;
      });
      tideFetcher.start();
    }
  } catch {
    // Tides not available — that's fine
  }

  // Set up AQI fetching
  try {
    const nextAqiFetcher = createAirQualityFetcher(latitude, longitude);
    if (requestId !== currentLocationRequestId) return;
    aqiFetcher = nextAqiFetcher;
    aqiFetcher.onUpdate((data) => {
      if (requestId !== currentLocationRequestId) return;
      currentAqiData = data;
    });
    aqiFetcher.start();
  } catch {
    // AQI not available — that's fine
  }

  // Start weather polling (triggers first onWeatherUpdate)
  await nextWeatherFetcher.start();
  if (requestId !== currentLocationRequestId) {
    nextWeatherFetcher.stop();
    return;
  }

  // Resolve location name from coordinates if needed
  if (!locationName) {
    const name = await reverseGeocode(latitude, longitude);
    if (requestId !== currentLocationRequestId) return;
    display.setLocation(name);
  }
}

/**
 * Boot sequence: create engine with placeholder params, then connect to real weather.
 */
async function boot(latitude, longitude, locationName, { updateUrl = true } = {}) {
  const overlay = document.getElementById('overlay');
  const infoDisplay = document.getElementById('info-display');
  const controls = document.getElementById('controls');
  const canvas = document.getElementById('visualizer');

  // Create the sound engine and interpolator
  engine = createSoundEngine();
  interpolator = createInterpolator(engine);

  // Create movement conductor
  if (CONDUCTOR_ENABLED) {
    movementConductor = createMovementConductor();
  }

  // Create UI
  display = createDisplay();
  createControls(async (result) => {
    const name = formatLocation(result);
    await startForLocation(result.latitude, result.longitude, name);
  });

  // Wire pause/play button
  const pauseBtn = document.getElementById('pause-btn');

  function setPauseButtonState(playing) {
    const pauseIcon = pauseBtn.querySelector('.pause-icon');
    const playIcon = pauseBtn.querySelector('.play-icon');
    if (playing) {
      pauseIcon?.classList.remove('hidden');
      playIcon?.classList.add('hidden');
      pauseBtn.setAttribute('aria-label', 'pause');
    } else {
      pauseIcon?.classList.add('hidden');
      playIcon?.classList.remove('hidden');
      pauseBtn.setAttribute('aria-label', 'play');
    }
  }

  pauseBtn.addEventListener('click', () => {
    if (isPlaying) {
      engine.stop();
      if (CONDUCTOR_ENABLED && movementConductor) movementConductor.pause();
    } else {
      engine.resume();
      if (CONDUCTOR_ENABLED && movementConductor) movementConductor.resume();
    }
    isPlaying = !isPlaying;
    setPauseButtonState(isPlaying);
  });

  // Wire master volume slider
  const volSlider = document.getElementById('volume-slider');
  if (volSlider) {
    // Restore persisted value — guard against Number(null) === 0 footgun
    const savedItem = localStorage.getItem('masterVolume');
    const savedPercent = savedItem !== null ? Number(savedItem) : NaN;
    const safePercent = Number.isFinite(savedPercent) ? Math.max(0, Math.min(100, savedPercent)) : 80;
    volSlider.value = safePercent;
    userVolumeScale = safePercent / 100;
    // Don't set engine gain yet — fade-in happens after engine.start() below

    volSlider.addEventListener('input', () => {
      userVolumeScale = volSlider.value / 100;
      engine.setUserGainScale(userVolumeScale, 0.1);
    });

    // Persist preference
    volSlider.addEventListener('change', () => {
      localStorage.setItem('masterVolume', volSlider.value);
    });
  }

  // Secondary action menu
  const menuBtn = document.getElementById('menu-btn');
  const secondaryMenu = document.getElementById('secondary-menu');
  secondaryMenuController?.dispose();
  secondaryMenuController = setupSecondaryMenu({
    menuBtn,
    secondaryMenu,
    keepOpenItemIds: ['sleep-btn', 'share-btn'],
  });

  // Wire sleep timer — cycles off → 30 → 60 → 90 min
  const sleepBtn = document.getElementById('sleep-btn');
  const SLEEP_OPTIONS = [0, 30, 60, 90]; // 0 = off
  let sleepIndex = 0;
  let sleepTimeout = null;
  let sleepFadeTimeout = null;

  function clearSleepTimers() {
    clearTimeout(sleepTimeout);
    clearTimeout(sleepFadeTimeout);
    sleepTimeout = null;
    sleepFadeTimeout = null;
  }

  if (sleepBtn) {
    sleepBtn.addEventListener('click', () => {
      clearSleepTimers();
      if (engine) engine.setSleepGainScale(1, 0.3);
      sleepIndex = (sleepIndex + 1) % SLEEP_OPTIONS.length;
      const minutes = SLEEP_OPTIONS[sleepIndex];
      if (minutes === 0) {
        sleepBtn.textContent = 'sleep';
        if (engine) engine.setSleepGainScale(1, 2);
        return;
      }
      sleepBtn.textContent = `${minutes}m`;
      const totalMs = minutes * 60 * 1000;
      const fadeMs = totalMs - 60_000; // begin fade 60s before end
      sleepTimeout = setTimeout(() => {
        if (engine) engine.setSleepGainScale(0, 60);
        sleepFadeTimeout = setTimeout(() => {
          if (engine) engine.stop();
          if (engine) engine.setSleepGainScale(1, 0);
          if (CONDUCTOR_ENABLED && movementConductor) movementConductor.pause();
          isPlaying = false;
          setPauseButtonState(false);
          sleepIndex = 0;
          sleepBtn.textContent = 'sleep';
        }, 60_000);
      }, Math.max(0, fadeMs));
    });
  }

  // Wire mute panel — per-voice mute toggles
  const mutePanel = document.getElementById('mute-panel');
  const mixBtn = document.getElementById('mix-btn');
  const VOICE_VOLUME_PARAMS = VOICE_VOLUME_PARAMS_MAP;
  const mutedVoices = new Set();
  mutedVoiceTracker = mutedVoices; // Expose to module-level applyExpression

  if (mixBtn && mutePanel) {
    mixBtn.addEventListener('click', () => {
      mutePanel.classList.toggle('hidden');
      document.body.classList.toggle('mix-open', !mutePanel.classList.contains('hidden'));
    });
  }

  document.querySelectorAll('.mute-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      if (!engine) return;
      const voice = btn.dataset.voice;
      const param = VOICE_VOLUME_PARAMS[voice];
      if (!param) return;
      if (mutedVoices.has(voice)) {
        mutedVoices.delete(voice);
        btn.classList.remove('muted');
        let savedVol = interpolator.currentParams?.[param] ?? 0;
        // Add expression swell offset if conductor is active
        if (CONDUCTOR_ENABLED && movementConductor) {
          const expr = movementConductor.getExpression();
          const maxSwell = SWELL_RANGES[param] ?? 0;
          savedVol += expr.dynamicSwell * maxSwell;
        }
        engine.rampParam(param, savedVol, 1);
      } else {
        mutedVoices.add(voice);
        btn.classList.add('muted');
        engine.rampParam(param, -80, 1);
      }
    });
  });

  // ── Weather panel (W key) ──
  const weatherPanel = document.getElementById('weather-panel');
  const weatherContent = document.getElementById('weather-content');
  const weatherClose = weatherPanel?.querySelector('.panel-close');
  const weatherMenuBtn = document.getElementById('weather-btn');

  // ── Audio panel (A key) ──
  const audioPanel = document.getElementById('audio-panel');
  const audioContent = document.getElementById('audio-content');
  const audioClose = audioPanel?.querySelector('.panel-close');
  const audioMenuBtn = document.getElementById('audio-btn');

  function capitalizeFirst(str) {
    if (!str) return '';
    return str.charAt(0).toUpperCase() + str.slice(1);
  }

  function describeWeatherCategory(cat) {
    return { storm: 'Stormy', rain: 'Rainy', drizzle: 'Drizzling',
      fog: 'Foggy', snow: 'Snowing', cloudy: 'Cloudy', clear: 'Clear skies' }[cat] ?? cat;
  }

  /**
   * Format a Date as location-local time using a UTC offset.
   */
  function formatLocalTime(date, utcOffsetSeconds) {
    if (!date) return '\u2014';
    const localMs = date.getTime() + utcOffsetSeconds * 1000;
    const d = new Date(localMs);
    const h = d.getUTCHours() % 12 || 12;
    const m = String(d.getUTCMinutes()).padStart(2, '0');
    const period = d.getUTCHours() >= 12 ? 'PM' : 'AM';
    return `${h}:${m} ${period}`;
  }

  function buildWeatherText() {
    const w = weatherFetcher?.lastState;
    if (!w) return 'Loading\u2026';

    const tempF = Math.round(w.temperature * 9 / 5 + 32);
    const feelsF = Math.round((w.apparentTemperature ?? w.temperature) * 9 / 5 + 32);
    const condition = describeWeatherCode(w.weatherCode);
    const windDir = degreesToCompass(w.windDirection);
    const moonName = getMoonPhaseName();
    const season = capitalizeFirst(getSeasonName(new Date(), currentLatitude ?? 40));

    const lines = [
      `<strong>Temperature:</strong> ${tempF}\u00B0F (feels ${feelsF}\u00B0F)`,
      `<strong>Condition:</strong> ${condition}`,
      `<strong>Humidity:</strong> ${w.humidity}%`,
      `<strong>Wind:</strong> ${Math.round(w.windSpeed)} km/h ${windDir}`,
      `<strong>Pressure:</strong> ${Math.round(w.pressure)} hPa`,
      `<strong>Cloud Cover:</strong> ${w.cloudCover}%`,
    ];

    if (w.uvIndex != null && w.uvIndex > 0) {
      lines.push(`<strong>UV Index:</strong> ${w.uvIndex.toFixed(0)}`);
    }
    if (currentAqiData?.aqi != null) {
      lines.push(`<strong>AQI:</strong> ${currentAqiData.aqi}`);
    }

    const utcOff = w.utcOffsetSeconds ?? 0;
    lines.push(`<strong>Sunrise:</strong> ${formatLocalTime(w.sunrise, utcOff)}`);
    lines.push(`<strong>Sunset:</strong> ${formatLocalTime(w.sunset, utcOff)}`);
    lines.push(`<strong>Moon:</strong> ${moonName}`);
    lines.push(`<strong>Season:</strong> ${season}`);
    lines.push(`<strong>Biome:</strong> ${capitalizeFirst(currentBiome)}`);

    if (currentTideData) {
      lines.push(`<strong>Tide:</strong> ${currentTideData.waterLevel.toFixed(1)} ft`);
    }

    return lines.join('<br>');
  }

  function buildAudioText() {
    const p = interpolator?.currentParams;
    const w = weatherFetcher?.lastState;
    if (!p || !w) return 'Loading\u2026';

    const tempF = Math.round(w.temperature * 9 / 5 + 32);
    const chord = engine?.progressionPlayer?.currentChord;
    const chordStr = chord ? `${chord.chordRootName} ${chord.quality}` : '\u2014';
    const moonName = getMoonPhaseName();
    const velScale = p.globalVelocityScale ?? 1;
    const timeStr = velScale > 0.8 ? 'Daytime' : velScale > 0.5 ? 'Golden hour' : 'Night';

    const lines = [
      `<strong>${tempF}\u00B0F</strong> <span class="mapping-hint">\u2192</span> <strong>${p.rootNote} ${capitalizeFirst(p.scaleType)}</strong>`,
      `<strong>${tempF}\u00B0F</strong> <span class="mapping-hint">\u2192</span> ${p.bpm} BPM`,
      `<strong>${capitalizeFirst(p.weatherCategory)}</strong> <span class="mapping-hint">\u2192</span> ${capitalizeFirst(p.melodyMood)} mood`,
      `<strong>Chord:</strong> ${chordStr}`,
      '',
      `<strong>${w.humidity}% humidity</strong> <span class="mapping-hint">\u2192</span> ${p.reverbDecay.toFixed(1)}s reverb, ${(p.reverbWet * 100).toFixed(0)}% wet`,
      `<strong>${Math.round(w.pressure)} hPa</strong> <span class="mapping-hint">\u2192</span> bass cutoff ${p.bassCutoff.toFixed(0)} Hz`,
      `<strong>${Math.round(w.windSpeed)} km/h wind</strong> <span class="mapping-hint">\u2192</span> ${(p.rhythmDensity * 100).toFixed(0)}% rhythm density`,
      `<strong>${timeStr}</strong> <span class="mapping-hint">\u2192</span> ${(p.padBrightness * 100).toFixed(0)}% brightness`,
      `<strong>${moonName}</strong> <span class="mapping-hint">\u2192</span> LFO ${p.lfoRate.toFixed(2)} Hz`,
    ];

    if (w.uvIndex > 0) {
      lines.push(`<strong>UV ${w.uvIndex.toFixed(0)}</strong> <span class="mapping-hint">\u2192</span> arp shimmer ${p.arpeggioFilterCutoff.toFixed(0)} Hz`);
    }

    return lines.filter(l => l !== undefined).join('<br>');
  }

  let toggleWeatherPanel = null;
  let toggleAudioPanel = null;

  if (weatherPanel && weatherContent) {
    toggleWeatherPanel = () => {
      audioPanel?.classList.add('hidden');
      weatherContent.innerHTML = buildWeatherText();
      weatherPanel.classList.toggle('hidden');
    };
    weatherMenuBtn?.addEventListener('click', toggleWeatherPanel);
  }
  if (weatherClose) {
    weatherClose.addEventListener('click', () => weatherPanel.classList.add('hidden'));
  }

  if (audioPanel && audioContent) {
    toggleAudioPanel = () => {
      weatherPanel?.classList.add('hidden');
      audioContent.innerHTML = buildAudioText();
      audioPanel.classList.toggle('hidden');
    };
    audioMenuBtn?.addEventListener('click', toggleAudioPanel);
  }
  if (audioClose) {
    audioClose.addEventListener('click', () => audioPanel.classList.add('hidden'));
  }

  // Wire share button — copies current location permalink to clipboard
  const shareBtn = document.getElementById('share-btn');
  if (shareBtn) {
    let shareFeedbackTimeout = null;
    const showShareCopiedFeedback = () => {
      clearTimeout(shareFeedbackTimeout);
      shareBtn.classList.add('copied');
      shareFeedbackTimeout = setTimeout(() => {
        shareBtn.classList.remove('copied');
      }, 1200);
    };

    shareBtn.addEventListener('click', async () => {
      // Construct the share URL from the current loaded coordinates.
      // We can't rely on window.location.href because geolocation-based loads
      // intentionally skip writing coords to the URL (updateUrl: false).
      const shareSearch = buildShareSearch(currentLatitude, currentLongitude);
      const url = shareSearch
        ? window.location.origin + window.location.pathname + shareSearch
        : window.location.href;
      let copied = false;
      try {
        if (navigator.clipboard?.writeText) {
          await navigator.clipboard.writeText(url);
          copied = true;
        } else {
          throw new Error('Clipboard API unavailable');
        }
      } catch {
        // Fallback: select the URL from a temporary input
        const tmp = document.createElement('input');
        tmp.value = url;
        document.body.appendChild(tmp);
        tmp.select();
        copied = document.execCommand('copy');
        document.body.removeChild(tmp);
      }
      if (copied) showShareCopiedFeedback();
    });
  }

  // ── Keyboard shortcuts ──
  document.addEventListener('keydown', (e) => {
    if (!engine) return;
    if (document.activeElement.tagName === 'INPUT') return; // Don't intercept typing
    switch (e.key) {
      case ' ':
        e.preventDefault();
        pauseBtn.click();
        break;
      case 'Escape':
        secondaryMenuController?.close();
        weatherPanel?.classList.add('hidden');
        audioPanel?.classList.add('hidden');
        break;
      case 'l': case 'L':
        e.preventDefault();
        document.getElementById('location-btn')?.click();
        break;
      case 'm': case 'M':
        mixBtn?.click();
        break;
      case 'w': case 'W':
        toggleWeatherPanel?.();
        break;
      case 'a': case 'A':
        toggleAudioPanel?.();
        break;
      case 'f': case 'F':
        canvas.requestFullscreen?.();
        break;
    }
  });

  // Create visualizer
  visualizer = createVisualizer(canvas, engine.analyser, engine.waveformAnalyser);
  visualizer.start();

  // Wire chord changes from engine → visualizer
  engine.onChordChange((chordInfo) => visualizer.onChordChange(chordInfo));

  // Wire lightning flashes from visualizer → engine (thunder transient)
  visualizer.onLightning(() => engine.triggerThunder());

  // Wire shooting star spawns from visualizer → engine (soft bell ding)
  visualizer.onShootingStar(() => engine.triggerShootingStar());

  // Start engine with neutral placeholder params
  const placeholderParams = mapWeatherToMusic({
    temperature: 15, humidity: 50, pressure: 1013,
    windSpeed: 8, windDirection: 180, weatherCode: 0,
    sunrise: new Date(new Date().setHours(6, 30)),
    sunset: new Date(new Date().setHours(17, 30)),
    uvIndex: 0,
  });
  engine.start(placeholderParams);
  interpolator.update(placeholderParams);

  // Fade out overlay, show controls
  showPrimaryControls({
    overlay,
    infoDisplay,
    controls,
    chordDisplay: document.getElementById('chord-display'),
    delayMs: 1000,
  });

  // Connect to real weather data — fade in on first load so audio swells in gently
  await startForLocation(latitude, longitude, locationName, { fadeIn: true, updateUrl });

  // Start the movement conductor after weather connects
  if (CONDUCTOR_ENABLED && movementConductor) {
    movementConductor.resume();
    startConductorTick();
  }
}

/**
 * Main initialization — wait for user click to start audio context.
 */
function init() {
  const listenBtn = document.getElementById('listen-btn');
  const overlay = document.getElementById('overlay');
  let isStarting = false;
  let overlayShortcutController = null;

  const startListening = async () => {
    if (isStarting) return;
    isStarting = true;
    listenBtn.textContent = 'Starting...';
    listenBtn.disabled = true;

    try {
      // iOS 17+: request 'playback' audio session so audio plays through the
      // mute/silent switch and continues when the screen locks (same category
      // as Spotify / Apple Music). No-op on other platforms.
      if ('audioSession' in navigator) {
        navigator.audioSession.type = 'playback';
      }

      await Tone.start();

      // Try browser geolocation
      display = createDisplay(); // Temp display for loading message
      display.setLocation('Finding your location...');

      // Check for permalink ?lat=&lng= params — shared link takes priority when
      // geolocation is unavailable, but fresh geolocation always wins if accessible.
      // We do NOT write coords back to the URL for geolocation boots so that
      // returning to the page (or tab restore) never re-uses stale coords.
      const sharedCoords = parseSharedCoordinates(window.location.search);
      history.replaceState(null, '', window.location.pathname);

      const browserLoc = await getBrowserLocation();
      if (browserLoc) {
        // Always prefer real geolocation — ignore any URL params from a previous
        // session or a shared link the user received (updateUrl: false keeps URL clean).
        await boot(browserLoc.latitude, browserLoc.longitude, null, { updateUrl: false });
      } else if (sharedCoords) {
        // Geolocation denied/unavailable — honour the shared link coordinates.
        // updateUrl: true so the share button and refresh still point to this location.
        await boot(sharedCoords.latitude, sharedCoords.longitude, null, { updateUrl: true });
      } else {
        // Final fallback: New York
        await boot(40.7128, -74.006, 'New York, NY', { updateUrl: false });
      }

      // Startup succeeded; remove one-time overlay keyboard shortcuts.
      overlayShortcutController?.dispose();
      overlayShortcutController = null;
    } catch (err) {
      console.error('Failed to start:', err);
      listenBtn.textContent = 'Error — try again';
      listenBtn.disabled = false;
      isStarting = false;
    }
  };

  listenBtn.addEventListener('click', startListening);
  overlayShortcutController = setupOverlayStartShortcuts({
    overlay,
    listenBtn,
    onStart: startListening,
  });
}

init();
