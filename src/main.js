import * as Tone from 'tone';
import { inject } from '@vercel/analytics';
import { createSoundEngine } from './music/engine.js';
import { mapWeatherToMusic } from './music/mapper.js';
import { createInterpolator } from './music/interpolator.js';
import { getBrowserLocation, formatLocation, reverseGeocode } from './weather/location.js';
import { buildShareSearch, parseSharedCoordinates } from './weather/share.js';
import { getMoonriseTime, getMoonsetTime } from './weather/moon.js';
import { createWeatherFetcher } from './weather/fetcher.js';
import { createTideFetcher } from './weather/tides.js';
import { createAirQualityFetcher } from './weather/airquality.js';
import { createDisplay } from './ui/display.js';
import { createControls } from './ui/controls.js';
import { createVisualizer } from './ui/visualizer.js';
import { setupOverlayStartShortcuts, setupSecondaryMenu, showPrimaryControls } from './ui/shell.js';
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
let currentTideData = null;
let currentAqiData = null;
let currentLatitude = null;
let currentLongitude = null;
let isPlaying = true; // Track play/pause state for the pause button
let currentLocationRequestId = 0;
let userVolumeScale = 0.8;
let secondaryMenuController = null;

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

// Clean up on HMR to prevent duplicate audio contexts
if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    if (engine) engine.dispose();
    if (weatherFetcher) weatherFetcher.stop();
    if (tideFetcher) tideFetcher.stop();
    if (aqiFetcher) aqiFetcher.stop();
    if (visualizer) visualizer.dispose();
    if (secondaryMenuController) secondaryMenuController.dispose();
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
  });

  interpolator.update(musicalParams);
  display.update(weather, musicalParams, currentTideData, currentAqiData);

  // Compute moonrise/moonset from phase + today's sunrise/sunset
  const now = new Date();
  const moonrise = getMoonriseTime(now, weather.sunrise, weather.sunset);
  const moonset  = getMoonsetTime(now, weather.sunrise, weather.sunset);

  // ── Milky Way shimmer intensity ──
  // Composite 0-1 value from three conditions that gate both the visual band
  // and the audio shimmer — dark night, clear sky, dim moon.
  //  padBrightness < 0.35 ≈ night/deep-dusk (it tracks time-of-day closely)
  //  moonFullness  < 0.4  ≈ crescent/new moon (bright moon washes the Milky Way out)
  const mwBrightnessAlpha = Math.max(0, (0.35 - musicalParams.padBrightness) / 0.35);
  const mwMoonAlpha       = Math.max(0, (0.4 - (musicalParams._meta.moonFullness ?? 0)) / 0.4);
  const milkyWayIntensity = musicalParams._meta.category === 'clear'
    ? Math.min(mwBrightnessAlpha, mwMoonAlpha)
    : 0;

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

    // ── Milky Way shimmer ──
    // Composite intensity (0-1) from three gating conditions:
    //  1. Dark night  — padBrightness proxy (< 0.35 ≈ night/deep-dusk)
    //  2. Clear sky   — category must be 'clear'
    //  3. Dim moon    — moonFullness < 0.4 (bright moon washes it out)
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
 */
async function startForLocation(latitude, longitude, locationName) {
  const requestId = ++currentLocationRequestId;
  display.setLocation(locationName || 'Loading...');

  // Store lat/lng for seasonal awareness and permalink
  currentLatitude = latitude;
  currentLongitude = longitude;

  // Update URL so the current location is shareable
  history.replaceState(null, '', buildShareSearch(latitude, longitude));

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
    engine.setUserGainScale(userVolumeScale, 0);
    engine.setSleepGainScale(1, 0);
    // Recreate interpolator too — it closes over the old (now-disposed) engine
    interpolator = createInterpolator(engine);
    // New engine always starts playing — reset pause button accordingly
    isPlaying = true;
    const pauseBtn = document.getElementById('pause-btn');
    if (pauseBtn) { pauseBtn.textContent = '⏸'; pauseBtn.setAttribute('aria-label', 'pause'); }
  }

  // Stop existing fetchers
  if (weatherFetcher) weatherFetcher.stop();
  if (tideFetcher) { tideFetcher.stop(); tideFetcher = null; }
  if (aqiFetcher) { aqiFetcher.stop(); aqiFetcher = null; }
  currentTideData = null;
  currentAqiData = null;

  // Set up weather fetching
  const nextWeatherFetcher = createWeatherFetcher(latitude, longitude);
  nextWeatherFetcher.onUpdate((weather) => {
    if (requestId !== currentLocationRequestId) return;
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
async function boot(latitude, longitude, locationName) {
  const overlay = document.getElementById('overlay');
  const infoDisplay = document.getElementById('info-display');
  const controls = document.getElementById('controls');
  const canvas = document.getElementById('visualizer');

  // Create the sound engine and interpolator
  engine = createSoundEngine();
  interpolator = createInterpolator(engine);

  // Create UI
  display = createDisplay();
  createControls(async (result) => {
    const name = formatLocation(result);
    await startForLocation(result.latitude, result.longitude, name);
  });

  // Wire pause/play button
  const pauseBtn = document.getElementById('pause-btn');
  pauseBtn.addEventListener('click', () => {
    if (isPlaying) {
      engine.stop();
      pauseBtn.textContent = '▶';
      pauseBtn.setAttribute('aria-label', 'play');
    } else {
      engine.resume();
      pauseBtn.textContent = '⏸';
      pauseBtn.setAttribute('aria-label', 'pause');
    }
    isPlaying = !isPlaying;
  });

  // Wire master volume slider
  const volSlider = document.getElementById('volume-slider');
  if (volSlider) {
    // Restore persisted value
    const savedPercent = Number(localStorage.getItem('masterVolume'));
    const safePercent = Number.isFinite(savedPercent) ? Math.max(0, Math.min(100, savedPercent)) : 80;
    volSlider.value = safePercent;
    userVolumeScale = safePercent / 100;
    engine.setUserGainScale(userVolumeScale, 0);

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
          isPlaying = false;
          const pauseBtn = document.getElementById('pause-btn');
          if (pauseBtn) { pauseBtn.textContent = '▶'; pauseBtn.setAttribute('aria-label', 'play'); }
          sleepIndex = 0;
          sleepBtn.textContent = 'sleep';
        }, 60_000);
      }, Math.max(0, fadeMs));
    });
  }

  // Wire mute panel — per-voice mute toggles
  const mutePanel = document.getElementById('mute-panel');
  const mixBtn = document.getElementById('mix-btn');
  const VOICE_VOLUME_PARAMS = {
    pad: 'padVolume', arpeggio: 'arpeggioVolume', bass: 'bassVolume',
    melody: 'melodyVolume', texture: 'textureVolume',
    percussion: 'percussionVolume', drone: 'droneVolume',
  };
  const mutedVoices = new Set();

  if (mixBtn && mutePanel) {
    mixBtn.addEventListener('click', () => mutePanel.classList.toggle('hidden'));
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
        const savedVol = interpolator.currentParams?.[param] ?? 0;
        engine.rampParam(param, savedVol, 1);
      } else {
        mutedVoices.add(voice);
        btn.classList.add('muted');
        engine.rampParam(param, -80, 1);
      }
    });
  });

  // Wire "What am I hearing" overlay
  const infoBtn = document.getElementById('info-btn');
  const hearingPanel = document.getElementById('hearing-panel');
  const hearingContent = document.getElementById('hearing-content');
  const hearingClose = hearingPanel?.querySelector('.hearing-close');
  let toggleHearingPanel = null;

  function describeWeatherCategory(cat) {
    return { storm: 'Stormy', rain: 'Rainy', drizzle: 'Drizzling',
      fog: 'Foggy', snow: 'Snowing', cloudy: 'Cloudy', clear: 'Clear skies' }[cat] ?? cat;
  }

  function capitalizeFirst(str) {
    if (!str) return '';
    return str.charAt(0).toUpperCase() + str.slice(1);
  }

  function buildHearingText() {
    const p = interpolator?.currentParams;
    if (!p) return 'Loading…';
    const chord = engine?.progressionPlayer?.currentChord;
    const chordStr = chord ? `${chord.chordRootName} ${chord.quality}` : '—';
    const velScale = p.globalVelocityScale ?? 1;
    const timeStr = velScale > 0.8 ? 'Daytime' : velScale > 0.5 ? 'Golden hour' : 'Night';
    return [
      `<strong>Key:</strong> ${p.rootNote} ${capitalizeFirst(p.scaleType)}`,
      `<strong>Mood:</strong> ${capitalizeFirst(p.melodyMood ?? p.weatherCategory)}`,
      `<strong>Tempo:</strong> ${p.bpm} BPM`,
      `<strong>Chord:</strong> ${chordStr}`,
      `<strong>Weather:</strong> ${describeWeatherCategory(p.weatherCategory)}`,
      `<strong>Time:</strong> ${timeStr}`,
    ].join('<br>');
  }

  if (infoBtn && hearingPanel && hearingContent) {
    toggleHearingPanel = () => {
      hearingContent.innerHTML = buildHearingText();
      hearingPanel.classList.toggle('hidden');
    };
    infoBtn.addEventListener('click', toggleHearingPanel);
  }
  if (hearingClose) {
    hearingClose.addEventListener('click', () => hearingPanel.classList.add('hidden'));
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
      const url = window.location.href;
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
        break;
      case 'l': case 'L':
        document.getElementById('location-btn')?.click();
        break;
      case 'm': case 'M':
        mixBtn?.click();
        break;
      case '?':
        toggleHearingPanel?.();
        break;
      case '/':
        if (e.shiftKey) toggleHearingPanel?.();
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

  // Connect to real weather data
  await startForLocation(latitude, longitude, locationName);
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

      // Check for permalink ?lat=&lng= params — shared link takes priority.
      // Clear params immediately so a subsequent page reload uses geolocation
      // instead of re-loading the same shared coordinates.
      const sharedCoords = parseSharedCoordinates(window.location.search);
      history.replaceState(null, '', window.location.pathname);

      if (sharedCoords) {
        await boot(sharedCoords.latitude, sharedCoords.longitude, null);
      } else {
        const browserLoc = await getBrowserLocation();
        if (browserLoc) {
          await boot(browserLoc.latitude, browserLoc.longitude, null);
        } else {
          // Default to New York
          await boot(40.7128, -74.006, 'New York, NY');
        }
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
