import * as Tone from 'tone';
import { inject } from '@vercel/analytics';
import { createOrchestra } from './music/orchestra/engine.js';
import { createSampleLibrary } from './music/orchestra/samples.js';
import { composeScore, SECTION_IDS } from './music/score.js';
import { arrangeStage, createStageState } from './music/stage.js';
import { createNowFeed } from './now/feed.js';
import { buildSnapshot } from './now/snapshot.js';
import { localClock } from './now/calendar.js';
import { getBrowserLocation, formatLocation, reverseGeocodeDetails } from './weather/location.js';
import { buildShareSearch, parseSharedCoordinates, resolveStartupLocation } from './weather/share.js';
import { createDisplay } from './ui/display.js';
import { createControls } from './ui/controls.js';
import { createVisualizer } from './ui/visualizer.js';
import { createNowVisualizer } from './visual/renderer.js';
import { computeMood, cssAccent } from './visual/mood.js';
import skyData from './visual/data/sky.json';
import { createChordDisplay } from './ui/chord-display.js';
import { createCaption } from './ui/caption.js';
import { buildNowPanel, buildLegendPanel, buildBlendLine, SECTION_LABELS } from './ui/now-panels.js';
import { setupInfoPanels } from './ui/panels.js';
import { setupOverlayStartShortcuts, setupSecondaryMenu, showPrimaryControls } from './ui/shell.js';
import { handleMainKeydown } from './ui/shortcuts.js';
import { setupGuitarPanel, toggleGuitarPanel as toggleGuitarPanelFn, onGuitarChordChange, stopCountdown } from './ui/guitar.js';
import { setupPullToRefresh } from './ui/pull-to-refresh.js';
import { createMovementConductor, CONDUCTOR_ENABLED, PHASE_TEMPLATE, smoothstep } from './music/movement.js';
import { VERSION } from './version.js';

// Vercel Web Analytics (framework-agnostic integration for this vanilla JS app).
inject();

console.info(`[SONAR] v${VERSION}`);
const overlayVersion = document.getElementById('overlay-version');
if (overlayVersion) overlayVersion.textContent = `v${VERSION}`;

setupPullToRefresh();

const isMobile = window.matchMedia?.('(pointer: coarse)').matches ?? false;

let library = null;          // shared sample buffers — survive location changes
let orchestra = null;
let feed = null;
let display = null;
let visual = null;           // WebGL visualizer, or the Canvas fallback
let legacyVisual = false;
let chordDisplay = null;
let caption = null;
let movementConductor = null;
let conductorTickInterval = null;
let clockInterval = null;
let isPlaying = true;
let currentLocationRequestId = 0;
let userVolumeScale = 0.8;
let secondaryMenuController = null;
let currentLatitude = null;
let currentLongitude = null;
const mutedSections = new Set();

// Session state
const listenStartedAt = Date.now();
let lastSnapshot = null;
let lastScore = null;
let lastStage = null;
let stageState = createStageState();
let spotlight = null;
let lastPhaseName = null;
let castAppliedTo = null;
let orchestraStarted = false;
let startFallbackTimer = null;
const featuredThisMovement = new Set();

const listenMinutes = () => (Date.now() - listenStartedAt) / 60000;

function getStillnessDepth() {
  const phase = movementConductor?.getCurrentPhase();
  if (!phase || phase.name !== 'stillness') return 0;
  const span = Math.max(1e-6, PHASE_TEMPLATE.stillness.end - PHASE_TEMPLATE.stillness.start);
  return smoothstep(Math.max(0, Math.min(1, (phase.progress - PHASE_TEMPLATE.stillness.start) / span)));
}

/** Before the orchestra starts, the sky can already be drawn. */
function renderVisualOnly(snapshot, score) {
  const mood = computeMood(snapshot, score, { listenMinutes: listenMinutes() });
  if (visual?.supported) visual.setMood(mood, { activity: snapshot.calendar.activity });
  const root = document.documentElement;
  for (const [k, v] of Object.entries(cssAccent(mood))) root.style.setProperty(k, v);
}

// ── The heart: snapshot → score → stage → orchestra + light ──
function render(snapshot, { ramp = 8, force = false } = {}) {
  if (!orchestra || !snapshot) return;
  // The first real data replaces the placeholder: don't let placeholder features hold the stage
  if (snapshot.weather && !lastSnapshot?.weather) stageState = createStageState();
  lastSnapshot = snapshot;
  const score = composeScore(snapshot, { listenMinutes: listenMinutes(), previousMode: lastScore?.harmony.mode });
  const stage = arrangeStage(score, stageState, Date.now(), spotlight);
  stageState = stage;
  lastScore = score;
  lastStage = stage;
  stage.foreground.forEach((id) => featuredThisMovement.add(id));
  if (snapshot.life?.topBirds?.length && castAppliedTo !== orchestra) {
    orchestra.sections.life.setCast(snapshot.life.topBirds);
    castAppliedTo = orchestra;
  }
  // The orchestra waits for the real weather, so every place opens as itself
  // (not with a generic placeholder chord). A fallback timer covers outages.
  if (!orchestraStarted) {
    if (!snapshot.weather && !force) return renderVisualOnly(snapshot, score);
    clearTimeout(startFallbackTimer);
    orchestra.start(score, stage);
    orchestraStarted = true;
  } else {
    orchestra.update(score, stage, ramp);
  }

  const expr = movementConductor?.getExpression?.() ?? {};
  const mood = computeMood(snapshot, score, { stillness: getStillnessDepth(), tension: expr.harmonicTension ?? 0, listenMinutes: listenMinutes() });
  if (visual?.supported) {
    visual.setMood(mood, { activity: snapshot.calendar.activity });
  } else if (visual && legacyVisual) {
    visual.updateState(legacyState(snapshot, score));
  }
  const root = document.documentElement;
  for (const [k, v] of Object.entries(cssAccent(mood))) root.style.setProperty(k, v);

  if (snapshot.weather) display?.update(snapshot.weather, { rootNote: score.harmony.root, scaleType: score.harmony.mode, bpm: score.harmony.bpm });
  const details = document.getElementById('info-details');
  if (details) details.textContent = buildBlendLine(snapshot, score);
  if (CONDUCTOR_ENABLED && movementConductor) movementConductor.setWeatherContext(score.harmony.category);

  announce(snapshot, score);
  window.__now = { snapshot, score, stage, orchestra, visual, version: VERSION };
}

/** Rare moments get a caption the first time they happen. */
function announce(snapshot, score) {
  if (!caption) return;
  const s = score.sections;
  if (s.iss.on) caption.show(s.iss.visible ? 'The International Space Station is passing overhead — look up.' : 'The International Space Station is passing overhead.', { key: 'iss', cooldownMs: 60 * 60000 });
  else if (s.aurora.on && s.aurora.level > 0.3) caption.show(`Geomagnetic storm (Kp ${snapshot.space.kp.toFixed(0)}) — aurora possible.`, { key: 'aurora' });
  else if (s.horns.on && s.horns.mode === 'dawn') caption.show('Sunrise.', { key: 'dawn', cooldownMs: 12 * 3600000 });
  else if (s.horns.on && s.horns.mode === 'dusk') caption.show('Golden hour.', { key: 'dusk', cooldownMs: 12 * 3600000 });
  else if (s.meteors.on && s.meteors.shower) caption.show(`The ${s.meteors.shower} are active tonight.`, { key: 'meteors', cooldownMs: 6 * 3600000 });
  else if (s.spheres.unlocked && s.spheres.on) caption.show(`${s.spheres.tones.map((t) => t.planet).join(', ')} — the music of the spheres.`, { key: 'spheres', cooldownMs: 6 * 3600000 });
  else if (snapshot.calendar.holiday) caption.show(`${snapshot.calendar.holiday.name}.`, { key: 'holiday', cooldownMs: 12 * 3600000 });
}

/** Map the new mood onto the v1 Canvas visualizer's state (no-WebGL2 fallback). */
function legacyState(snapshot, score) {
  const { sky, weather: w } = snapshot;
  const toDate = (d) => d ?? null;
  return {
    timeOfDay: sky.twilight === 'day' ? 'afternoon' : sky.twilight === 'golden' ? (sky.sun.rising ? 'dawn' : 'dusk') : 'night',
    weatherCategory: score.harmony.category,
    windSpeed: w?.windSpeed ?? 0,
    windDirection: w?.windDirection ?? 0,
    moonPhase: sky.moon.phaseDeg / 360,
    moonFullness: sky.moon.illumination,
    brightness: score.master.light,
    tideLevel: snapshot.tide?.level ?? null,
    sunTransition: score.sections.horns.warmth ?? 0,
    cloudCover: w?.cloudCover ?? 0,
    filterWarmth: score.sections.horns.warmth ?? 0,
    aqiNorm: score.master.haze,
    temperature: w?.temperature ?? 10,
    latitude: snapshot.location.lat,
    sunrise: toDate(w?.sunrise),
    sunset: toDate(w?.sunset),
    milkyWayIntensity: sky.darkness * (1 - (w?.cloudCover ?? 0) / 100),
    biome: snapshot.location.biome,
    elevation: snapshot.location.elevation,
    terrainSeed: Math.abs(Math.sin(snapshot.location.lat * 1234.5 + snapshot.location.lng * 6789.1)) * 10000,
    auroraIntensity: score.sections.aurora.level,
  };
}

// ── Conductor ──
function applyConductor() {
  if (!CONDUCTOR_ENABLED || !movementConductor || !orchestra) return;
  movementConductor.tick();
  const phase = movementConductor.getCurrentPhase();
  const stillness = getStillnessDepth();
  orchestra.setExpression(movementConductor.getExpression(), stillness, 5);
  // Entering stillness: recapitulate the motifs that mattered this movement
  if (phase?.name === 'stillness' && lastPhaseName !== 'stillness' && featuredThisMovement.size) {
    orchestra.playRecap([...featuredThisMovement]);
  }
  if (phase?.name === 'breathing' && lastPhaseName && lastPhaseName !== 'breathing') featuredThisMovement.clear();
  lastPhaseName = phase?.name ?? null;
}

function startConductorTick() {
  stopConductorTick();
  if (!CONDUCTOR_ENABLED || !movementConductor) return;
  conductorTickInterval = setInterval(() => {
    if (isPlaying) applyConductor();
  }, 8000);
}

function stopConductorTick() {
  if (conductorTickInterval) clearInterval(conductorTickInterval);
  conductorTickInterval = null;
}

// ── Clock: bells on the hour, stage spotlight expiry ──
function startClock() {
  clearInterval(clockInterval);
  let primed = false;
  clockInterval = setInterval(() => {
    if (!orchestra || !lastSnapshot || !isPlaying) return;
    const offset = lastSnapshot.weather?.utcOffsetSeconds ?? Math.round(lastSnapshot.location.lng / 15) * 3600;
    const { hour } = localClock(Date.now(), offset);
    if (!primed) {
      orchestra.primeClock(hour);
      primed = true;
      return;
    }
    const duration = orchestra.tickClock(hour);
    if (duration > 0) {
      spotlight = { id: 'bells', until: Date.now() + duration * 1000 };
      render(lastSnapshot, { ramp: 3 });
    } else if (spotlight && spotlight.until < Date.now()) {
      spotlight = null;
      render(lastSnapshot, { ramp: 4 });
    }
  }, 2000);
}

function wireOrchestra(o) {
  o.onChordChange((chordInfo) => {
    if (legacyVisual) visual?.onChordChange?.(chordInfo);
    else chordDisplay?.update(chordInfo);
    onGuitarChordChange({ ...chordInfo, intervalSeconds: o.progressionPlayer.currentIntervalSeconds });
  });
  o.onEvent((event) => {
    if (visual?.supported) visual.event(event);
  });
  for (const id of mutedSections) o.setSectionMuted(id, true);
}

function createOrchestraForLocation(lat, lng, { fadeIn }) {
  if (orchestra) {
    orchestra.dispose();
    stopCountdown();
  }
  library ??= createSampleLibrary(Tone);
  orchestra = createOrchestra({ library });
  wireOrchestra(orchestra);
  // Until iNaturalist answers, the local bird cast is seeded from the place itself
  orchestra.sections.life.setCast([], `${lat.toFixed(1)},${lng.toFixed(1)}`);
  stageState = createStageState();
  spotlight = null;
  orchestraStarted = false;
  orchestra.setUserGainScale(fadeIn ? 0 : userVolumeScale, 0);
  if (fadeIn) orchestra.setUserGainScale(userVolumeScale, 4);
  orchestra.setSleepGainScale(1, 0);
  // Draw the true sky right away; start the music when the weather answers,
  // or after a few seconds with what we can compute locally.
  const placeholder = buildSnapshot({ lat, lng }, Date.now());
  render(placeholder, { ramp: 1 });
  clearTimeout(startFallbackTimer);
  startFallbackTimer = setTimeout(() => {
    if (!orchestraStarted && orchestra) render(lastSnapshot ?? placeholder, { ramp: 1, force: true });
  }, 6000);
}

function setPauseButtonState(playing) {
  const pb = document.getElementById('pause-btn');
  if (!pb) return;
  pb.querySelector('.pause-icon')?.classList.toggle('hidden', !playing);
  pb.querySelector('.play-icon')?.classList.toggle('hidden', playing);
  pb.setAttribute('aria-label', playing ? 'pause' : 'play');
}

/**
 * Listen to a location: new orchestra, new feed.
 * updateUrl = false for geolocation boots so stale coords don't masquerade as
 * a shared link on the next visit.
 */
async function startForLocation(latitude, longitude, locationName, { fadeIn = false, updateUrl = true } = {}) {
  const requestId = ++currentLocationRequestId;
  display.setLocation(locationName || 'Loading…');
  currentLatitude = latitude;
  currentLongitude = longitude;
  if (updateUrl) history.replaceState(null, '', buildShareSearch(latitude, longitude));
  else history.replaceState(null, '', window.location.pathname);

  feed?.stop();
  lastSnapshot = null;
  createOrchestraForLocation(latitude, longitude, { fadeIn });
  if (CONDUCTOR_ENABLED && movementConductor) {
    movementConductor.reset();
    movementConductor.resume();
    featuredThisMovement.clear();
    startConductorTick();
  }
  isPlaying = true;
  setPauseButtonState(true);

  feed = createNowFeed({ lat: latitude, lng: longitude, name: locationName });
  feed.onSnapshot((snapshot) => {
    if (requestId !== currentLocationRequestId) return;
    render(snapshot);
  });
  feed.onEvent((event) => {
    if (requestId !== currentLocationRequestId || !orchestra) return;
    if (event.type === 'quake') {
      const q = event.quake;
      const delay = orchestra.triggerQuake(q);
      spotlight = { id: 'earth', until: Date.now() + (delay + 12) * 1000 };
      caption?.show(`M${q.mag.toFixed(1)} earthquake, ${Math.round(q.distanceKm).toLocaleString('en-US')} km away — ${q.place}.`, { key: `quake-${q.id}` });
      if (lastSnapshot) render(lastSnapshot, { ramp: 3 });
    }
  });
  feed.start();
  startClock();

  const details = await reverseGeocodeDetails(latitude, longitude);
  if (requestId !== currentLocationRequestId) return;
  if (!locationName) display.setLocation(details.name);
  feed.setPlaceInfo({ name: locationName || details.name, countryCode: details.countryCode });
}

async function boot(latitude, longitude, locationName, { updateUrl = true } = {}) {
  const overlay = document.getElementById('overlay');
  const infoDisplay = document.getElementById('info-display');
  const controls = document.getElementById('controls');
  let canvas = document.getElementById('visualizer');

  if (CONDUCTOR_ENABLED) movementConductor = createMovementConductor();
  display = createDisplay();
  caption = createCaption();
  createControls(async (result) => {
    await startForLocation(result.latitude, result.longitude, formatLocation(result));
  });

  // ── Pause / play ──
  const pauseBtn = document.getElementById('pause-btn');
  pauseBtn.addEventListener('click', () => {
    if (!orchestra) return;
    if (isPlaying) {
      orchestra.stop();
      movementConductor?.pause();
    } else {
      orchestra.resume();
      movementConductor?.resume();
    }
    isPlaying = !isPlaying;
    setPauseButtonState(isPlaying);
  });

  // ── Volume ──
  const volSlider = document.getElementById('volume-slider');
  if (volSlider) {
    let saved = NaN;
    try {
      const item = localStorage.getItem('masterVolume');
      saved = item !== null ? Number(item) : NaN;
    } catch { /* storage unavailable */ }
    const pct = Number.isFinite(saved) ? Math.max(0, Math.min(100, saved)) : 80;
    volSlider.value = pct;
    userVolumeScale = pct / 100;
    volSlider.addEventListener('input', () => {
      userVolumeScale = volSlider.value / 100;
      orchestra?.setUserGainScale(userVolumeScale, 0.1);
    });
    volSlider.addEventListener('change', () => {
      try { localStorage.setItem('masterVolume', volSlider.value); } catch { /* noop */ }
    });
  }

  // ── Menu ──
  secondaryMenuController?.dispose();
  secondaryMenuController = setupSecondaryMenu({
    menuBtn: document.getElementById('menu-btn'),
    secondaryMenu: document.getElementById('secondary-menu'),
    keepOpenItemIds: ['sleep-btn', 'share-btn'],
  });

  // ── Sleep timer: off → 30 → 60 → 90 min, 60 s fade ──
  const sleepBtn = document.getElementById('sleep-btn');
  const SLEEP_OPTIONS = [0, 30, 60, 90];
  let sleepIndex = 0;
  let sleepTimeout = null;
  let sleepFadeTimeout = null;
  const clearSleepTimers = () => {
    clearTimeout(sleepTimeout);
    clearTimeout(sleepFadeTimeout);
  };
  sleepBtn?.addEventListener('click', () => {
    clearSleepTimers();
    orchestra?.setSleepGainScale(1, 0.3);
    sleepIndex = (sleepIndex + 1) % SLEEP_OPTIONS.length;
    const minutes = SLEEP_OPTIONS[sleepIndex];
    if (minutes === 0) {
      sleepBtn.textContent = 'sleep';
      return;
    }
    sleepBtn.textContent = `${minutes}m`;
    sleepTimeout = setTimeout(() => {
      orchestra?.setSleepGainScale(0, 60);
      sleepFadeTimeout = setTimeout(() => {
        orchestra?.stop();
        orchestra?.setSleepGainScale(1, 0);
        movementConductor?.pause();
        isPlaying = false;
        setPauseButtonState(false);
        sleepIndex = 0;
        sleepBtn.textContent = 'sleep';
      }, 60_000);
    }, Math.max(0, minutes * 60_000 - 60_000));
  });

  // ── Mix: one toggle per section ──
  const mutePanel = document.getElementById('mute-panel');
  const mixBtn = document.getElementById('mix-btn');
  if (mutePanel) {
    mutePanel.innerHTML = '';
    for (const id of SECTION_IDS) {
      const btn = document.createElement('button');
      btn.className = 'mute-btn';
      btn.dataset.section = id;
      btn.textContent = SECTION_LABELS[id] ?? id;
      btn.addEventListener('click', () => {
        const muted = !mutedSections.has(id);
        if (muted) mutedSections.add(id);
        else mutedSections.delete(id);
        btn.classList.toggle('muted', muted);
        orchestra?.setSectionMuted(id, muted);
      });
      mutePanel.appendChild(btn);
    }
  }
  mixBtn?.addEventListener('click', () => {
    mutePanel.classList.toggle('hidden');
    document.body.classList.toggle('mix-open', !mutePanel.classList.contains('hidden'));
  });

  // ── Panels: now (W), legend (A), conductor (C) ──
  const weatherPanel = document.getElementById('weather-panel');
  const audioPanel = document.getElementById('audio-panel');
  const conductorPanel = document.getElementById('conductor-panel');
  const panelControls = setupInfoPanels({
    weatherPanel,
    weatherContent: document.getElementById('weather-content'),
    weatherClose: weatherPanel?.querySelector('.panel-close'),
    weatherMenuBtn: document.getElementById('weather-btn'),
    buildWeatherText: () => buildNowPanel(lastSnapshot),
    audioPanel,
    audioContent: document.getElementById('audio-content'),
    audioClose: audioPanel?.querySelector('.panel-close'),
    audioMenuBtn: document.getElementById('audio-btn'),
    buildAudioText: () => buildLegendPanel(lastScore, lastStage),
    conductorPanel,
    conductorStatus: document.getElementById('conductor-status'),
    conductorTimeline: document.getElementById('conductor-timeline'),
    conductorPlayhead: document.getElementById('conductor-playhead'),
    conductorCurrent: document.getElementById('conductor-current'),
    conductorNext: document.getElementById('conductor-next'),
    conductorMenuBtn: document.getElementById('conductor-btn'),
    movementConductor,
    getTempoBpm: () => lastScore?.harmony.bpm ?? null,
    conductorEnabled: CONDUCTOR_ENABLED,
  });

  // ── Share ──
  const shareBtn = document.getElementById('share-btn');
  if (shareBtn) {
    let feedbackTimeout = null;
    shareBtn.addEventListener('click', async () => {
      const search = buildShareSearch(currentLatitude, currentLongitude);
      const url = search ? window.location.origin + window.location.pathname + search : window.location.href;
      let copied = false;
      try {
        await navigator.clipboard.writeText(url);
        copied = true;
      } catch {
        const tmp = document.createElement('input');
        tmp.value = url;
        document.body.appendChild(tmp);
        tmp.select();
        copied = document.execCommand('copy');
        document.body.removeChild(tmp);
      }
      if (copied) {
        clearTimeout(feedbackTimeout);
        shareBtn.classList.add('copied');
        feedbackTimeout = setTimeout(() => shareBtn.classList.remove('copied'), 1200);
      }
    });
  }

  // ── Guitar panel (G or click the chord) ──
  const guitarPanelEl = document.getElementById('guitar-panel');
  if (guitarPanelEl) setupGuitarPanel(guitarPanelEl);
  document.getElementById('chord-display')?.addEventListener('click', () => {
    if (orchestra) toggleGuitarPanelFn();
  });

  document.addEventListener('keydown', (e) => {
    handleMainKeydown(e, {
      isEngineReady: Boolean(orchestra),
      activeTagName: document.activeElement?.tagName,
      pauseBtn,
      secondaryMenuController,
      weatherPanel,
      audioPanel,
      conductorPanel,
      guitarPanel: guitarPanelEl,
      locationBtn: document.getElementById('location-btn'),
      mixBtn,
      toggleWeatherPanel: panelControls.toggleWeatherPanel,
      toggleAudioPanel: panelControls.toggleAudioPanel,
      toggleConductorPanel: panelControls.toggleConductorPanel,
      toggleGuitarPanel: () => toggleGuitarPanelFn(),
      canvas,
    });
  });

  // ── Visuals ── (analysers are proxied: the orchestra is rebuilt per location)
  library = createSampleLibrary(Tone);
  const fftProxy = { getValue: () => orchestra?.analyser.getValue() ?? null };
  const waveProxy = { getValue: () => orchestra?.waveformAnalyser.getValue() ?? null };
  visual = createNowVisualizer(canvas, { analyser: fftProxy, skyData, isMobile });
  if (!visual.supported) {
    // A canvas can't switch context types once WebGL2 has claimed it
    const fresh = canvas.cloneNode(false);
    canvas.replaceWith(fresh);
    canvas = fresh;
    legacyVisual = true;
    visual = createVisualizer(canvas, fftProxy, waveProxy);
    visual.onLightning(() => orchestra?.triggerThunder());
  } else {
    chordDisplay = createChordDisplay();
  }
  visual.start();

  showPrimaryControls({
    overlay,
    infoDisplay,
    controls,
    chordDisplay: document.getElementById('chord-display'),
    delayMs: 1000,
  });

  await startForLocation(latitude, longitude, locationName, { fadeIn: true, updateUrl });
  movementConductor?.resume();
  startConductorTick();
}

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    orchestra?.dispose();
    feed?.stop();
    visual?.dispose?.();
    secondaryMenuController?.dispose();
    stopConductorTick();
    clearInterval(clockInterval);
  });
}

function init() {
  const listenBtn = document.getElementById('listen-btn');
  const overlay = document.getElementById('overlay');
  let isStarting = false;
  let overlayShortcutController = null;

  const startListening = async () => {
    if (isStarting) return;
    isStarting = true;
    listenBtn.textContent = 'Starting…';
    listenBtn.disabled = true;
    try {
      // iOS 17+: play through the silent switch and keep playing when locked
      if ('audioSession' in navigator) navigator.audioSession.type = 'playback';
      await Tone.start();
      display = createDisplay();
      display.setLocation('Finding your location…');
      const sharedCoords = parseSharedCoordinates(window.location.search);
      history.replaceState(null, '', window.location.pathname);
      const browserLoc = sharedCoords ? null : await getBrowserLocation();
      const startup = resolveStartupLocation({ sharedCoords, browserLocation: browserLoc });
      await boot(startup.latitude, startup.longitude, startup.locationName, { updateUrl: startup.updateUrl });
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
  overlayShortcutController = setupOverlayStartShortcuts({ overlay, listenBtn, onStart: startListening });
}

init();
