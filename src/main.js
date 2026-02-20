import * as Tone from 'tone';
import { createSoundEngine } from './music/engine.js';
import { mapWeatherToMusic } from './music/mapper.js';
import { createInterpolator } from './music/interpolator.js';
import { getBrowserLocation, formatLocation, reverseGeocode } from './weather/location.js';
import { getMoonriseTime, getMoonsetTime } from './weather/moon.js';
import { createWeatherFetcher } from './weather/fetcher.js';
import { createTideFetcher } from './weather/tides.js';
import { createAirQualityFetcher } from './weather/airquality.js';
import { createDisplay } from './ui/display.js';
import { createControls } from './ui/controls.js';
import { createVisualizer } from './ui/visualizer.js';

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

  // Update melody's golden-hour / full-moon probability boosts
  if (engine) {
    engine.updateCelestialContext(
      musicalParams._meta.sunTransition,
      musicalParams._meta.moonFullness,
    );
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
    // Celestial positioning
    sunrise: weather.sunrise,
    sunset: weather.sunset,
    moonrise,
    moonset,
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
  display.setLocation(locationName || 'Loading...');

  // Store lat/lng for seasonal awareness and permalink
  currentLatitude = latitude;
  currentLongitude = longitude;

  // Update URL so the current location is shareable
  history.replaceState(null, '', `?lat=${latitude.toFixed(4)}&lng=${longitude.toFixed(4)}`);

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
  weatherFetcher = createWeatherFetcher(latitude, longitude);
  weatherFetcher.onUpdate(onWeatherUpdate);

  // Set up tide fetching (may return null for inland locations)
  try {
    tideFetcher = await createTideFetcher(latitude, longitude);
    if (tideFetcher) {
      tideFetcher.onUpdate((data) => {
        currentTideData = data;
      });
      tideFetcher.start();
    }
  } catch {
    // Tides not available — that's fine
  }

  // Set up AQI fetching
  try {
    aqiFetcher = createAirQualityFetcher(latitude, longitude);
    aqiFetcher.onUpdate((data) => {
      currentAqiData = data;
    });
    aqiFetcher.start();
  } catch {
    // AQI not available — that's fine
  }

  // Start weather polling (triggers first onWeatherUpdate)
  await weatherFetcher.start();

  // Resolve location name from coordinates if needed
  if (!locationName) {
    const name = await reverseGeocode(latitude, longitude);
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
    volSlider.value = localStorage.getItem('masterVolume') ?? 80;

    volSlider.addEventListener('input', () => {
      const userScale = volSlider.value / 100;
      const weatherScale = interpolator.currentParams?.globalVelocityScale ?? 1;
      engine.effects.masterVelocity.gain.rampTo(userScale * weatherScale, 0.1);
    });

    // Persist preference
    volSlider.addEventListener('change', () => {
      localStorage.setItem('masterVolume', volSlider.value);
    });
  }

  // Wire share button — copies current location permalink to clipboard
  const shareBtn = document.getElementById('share-btn');
  if (shareBtn) {
    shareBtn.addEventListener('click', async () => {
      const url = window.location.href;
      try {
        await navigator.clipboard.writeText(url);
        const orig = shareBtn.textContent;
        shareBtn.textContent = '✓';
        setTimeout(() => { shareBtn.textContent = orig; }, 2000);
      } catch {
        // Fallback: select the URL from a temporary input
        const tmp = document.createElement('input');
        tmp.value = url;
        document.body.appendChild(tmp);
        tmp.select();
        document.execCommand('copy');
        document.body.removeChild(tmp);
      }
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
      case 'l': case 'L':
        document.getElementById('location-btn')?.click();
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
  overlay.classList.add('fade-out');
  setTimeout(() => {
    infoDisplay.classList.remove('hidden');
    controls.classList.remove('hidden');
    document.getElementById('chord-display').classList.remove('hidden');
  }, 1000);

  // Connect to real weather data
  await startForLocation(latitude, longitude, locationName);
}

/**
 * Main initialization — wait for user click to start audio context.
 */
function init() {
  const listenBtn = document.getElementById('listen-btn');

  listenBtn.addEventListener('click', async () => {
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

      // Check for permalink ?lat=&lng= params — shared link takes priority
      const urlParams = new URLSearchParams(window.location.search);
      const urlLat = parseFloat(urlParams.get('lat'));
      const urlLng = parseFloat(urlParams.get('lng'));

      if (!isNaN(urlLat) && !isNaN(urlLng)) {
        await boot(urlLat, urlLng, null);
      } else {
        const browserLoc = await getBrowserLocation();
        if (browserLoc) {
          await boot(browserLoc.latitude, browserLoc.longitude, null);
        } else {
          // Default to New York
          await boot(40.7128, -74.006, 'New York, NY');
        }
      }
    } catch (err) {
      console.error('Failed to start:', err);
      listenBtn.textContent = 'Error — try again';
      listenBtn.disabled = false;
    }
  }, { once: true }); // Only fire once
}

init();
