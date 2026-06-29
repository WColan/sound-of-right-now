/**
 * SONDE entry point.
 *
 * Pipeline (the SON-family shape, with a celestial source):
 *
 *   SkyClock → ephemeris.getSkySnapshot → mapSkyToMusic (pure)
 *            → core interpolator → SondeEngine → audio
 *                                              ↘ orrery / display (visuals)
 *
 * The clock samples the sky a few times a second for audio; the orrery renders
 * every animation frame for smooth motion. Aspect blooms and Jupiter's
 * polyrhythm are event-driven, fired from the sample callback.
 */
import * as Tone from 'tone';
import { createParamInterpolator } from '@son/core/interpolator';
import { createSondeEngine } from './music/engine.js';
import {
  mapSkyToMusic,
  SONDE_RAMP_DURATIONS,
  SONDE_DISCRETE_PARAMS,
  SONDE_META_PARAMS,
} from './music/mapper.js';
import { getSkySnapshot, getAspects, getGalileanPhases } from './sky/ephemeris.js';
import { createSkyClock, SPEED_PRESETS } from './sky/clock.js';
import { createOrrery } from './ui/orrery.js';
import { createDisplay } from './ui/display.js';
import { createControls } from './ui/controls.js';
import { VERSION } from './version.js';

console.info(`[SONDE] v${VERSION}`);

const versionEl = document.getElementById('sonde-version');
if (versionEl) versionEl.textContent = `v${VERSION}`;

const ASPECT_EVENT_THRESHOLD = 0.8;

let engine = null;
let interpolator = null;
let clock = null;
let orrery = null;
let display = null;
let controls = null;
let rafId = null;
let userVolume = 0.8;
let speedLabel = 'Live';
let isPlaying = true;
let pausedSimTime = null;

// Pairs currently in a "bloom" state, so each alignment rings once on entry.
const activeAspects = new Set();

function aspectKey(a) {
  return `${a.a}-${a.b}-${a.name}`;
}

/** Audio + display cadence (a few Hz). Re-maps the sky and fires events. */
function onSkySample(simTime) {
  if (!interpolator) return;
  const snapshot = getSkySnapshot(simTime);
  const aspects = getAspects(snapshot);
  const params = mapSkyToMusic(snapshot, aspects);

  interpolator.update(params);
  engine.updateGalilean(getGalileanPhases(simTime));

  // Ring a bell when a pair newly reaches a tight alignment (rising edge).
  const strongNow = new Set();
  for (const a of aspects) {
    if (a.strength < ASPECT_EVENT_THRESHOLD) continue;
    const key = aspectKey(a);
    strongNow.add(key);
    if (!activeAspects.has(key)) engine.triggerAspect(a);
  }
  for (const key of [...activeAspects]) {
    if (!strongNow.has(key)) activeAspects.delete(key);
  }
  for (const key of strongNow) activeAspects.add(key);

  display.update(params._meta, { speedLabel });
}

/** Visual cadence (60 fps). Renders the orrery from the live sim time. */
function renderLoop() {
  const simTime = clock.getSimTime();
  const snapshot = getSkySnapshot(simTime);
  const aspects = getAspects(snapshot);
  orrery.render(snapshot, aspects);
  rafId = requestAnimationFrame(renderLoop);
}

function pause() {
  pausedSimTime = clock.getSimTime();
  clock.stop();
  if (rafId) cancelAnimationFrame(rafId);
  rafId = null;
  engine.pause();
}

function resume() {
  // Continue from where we paused (don't let real time leap the sky forward).
  if (pausedSimTime) clock.jumpTo(pausedSimTime);
  engine.resume();
  clock.start();
  renderLoop();
}

async function boot() {
  engine = createSondeEngine({ Tone, userGain: 0 });
  engine.start();

  interpolator = createParamInterpolator(engine, {
    rampDurations: SONDE_RAMP_DURATIONS,
    discreteParams: SONDE_DISCRETE_PARAMS,
    metaParams: SONDE_META_PARAMS,
  });

  const canvas = document.getElementById('sonde-orrery');
  orrery = createOrrery(canvas, engine.analyser);
  display = createDisplay();

  clock = createSkyClock({ speed: 1, sampleIntervalMs: 250, onSample: onSkySample });

  controls = createControls({
    onPlayPause: (playing) => {
      isPlaying = playing;
      if (playing) resume();
      else pause();
    },
    onVolume: (v) => {
      userVolume = v;
      engine.setUserGain(v, 0.1);
    },
    onSpeed: (preset) => {
      clock.setSpeed(preset.value);
      speedLabel = preset.label;
      display.setSpeedLabel(preset.label);
    },
    onNow: () => {
      clock.setSpeed(SPEED_PRESETS[0].value);
      clock.goLive();
      speedLabel = SPEED_PRESETS[0].label;
      display.setSpeedLabel(speedLabel);
    },
  });

  // Reveal the UI, start the clocks, and swell the audio in gently.
  document.getElementById('sonde-info')?.classList.remove('hidden');
  document.getElementById('sonde-transport')?.classList.remove('hidden');
  clock.start();
  renderLoop();
  engine.setUserGain(0, 0);
  engine.setUserGain(userVolume, 4);
}

function init() {
  const overlay = document.getElementById('sonde-overlay');
  const beginBtn = document.getElementById('sonde-begin');
  let starting = false;

  const begin = async () => {
    if (starting) return;
    starting = true;
    beginBtn.textContent = 'Starting…';
    beginBtn.disabled = true;
    try {
      if ('audioSession' in navigator) navigator.audioSession.type = 'playback';
      await Tone.start();
      await boot();
      if (overlay) {
        overlay.style.opacity = '0';
        setTimeout(() => overlay.classList.add('hidden'), 1000);
      }
    } catch (err) {
      console.error('[SONDE] failed to start:', err);
      beginBtn.textContent = 'Error — try again';
      beginBtn.disabled = false;
      starting = false;
    }
  };

  beginBtn?.addEventListener('click', begin);
}

// HMR cleanup to avoid duplicate audio graphs during dev.
if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    if (rafId) cancelAnimationFrame(rafId);
    clock?.stop();
    engine?.dispose();
    orrery?.dispose();
  });
}

init();
