import * as Tone from 'tone';
import { createSoundEngine } from './music/engine.js';
import { mapWeatherToMusic } from './music/mapper.js';
import { createInterpolator } from './music/interpolator.js';
import { getBrowserLocation, formatLocation, reverseGeocode } from './weather/location.js';
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

  const musicalParams = mapWeatherToMusic(weather, {
    tideLevel: currentTideData?.waterLevel ?? null,
    aqiLevel: currentAqiData?.aqi ?? null,
    latitude: currentLatitude ?? 40,
  });

  interpolator.update(musicalParams);
  display.update(weather, musicalParams, currentTideData);

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
  });

  console.log(
    `Weather: ${weather.temperature.toFixed(1)}°C, ${musicalParams._meta.category} → ` +
    `${musicalParams.rootNote} ${musicalParams.scaleType}, ${musicalParams.bpm} BPM` +
    (currentAqiData ? ` | AQI: ${currentAqiData.aqi}` : '') +
    ` | Season: ${musicalParams._meta.seasonalFactor.toFixed(2)}`
  );
}

/**
 * Set up data fetching for a given location.
 */
async function startForLocation(latitude, longitude, locationName) {
  display.setLocation(locationName || 'Loading...');

  // Store latitude for seasonal awareness
  currentLatitude = latitude;

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

  // Create visualizer
  visualizer = createVisualizer(canvas, engine.analyser, engine.waveformAnalyser);
  visualizer.start();

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
      await Tone.start();

      // Try browser geolocation
      display = createDisplay(); // Temp display for loading message
      display.setLocation('Finding your location...');

      const browserLoc = await getBrowserLocation();

      if (browserLoc) {
        await boot(browserLoc.latitude, browserLoc.longitude, null);
      } else {
        // Default to New York
        await boot(40.7128, -74.006, 'New York, NY');
      }
    } catch (err) {
      console.error('Failed to start:', err);
      listenBtn.textContent = 'Error — try again';
      listenBtn.disabled = false;
    }
  }, { once: true }); // Only fire once
}

init();
