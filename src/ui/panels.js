/**
 * Wire weather/audio/conductor info panels and keep their visibility behavior
 * consistent across menu clicks and keyboard shortcuts.
 */
const PHASE_ORDER = ['breathing', 'stirring', 'building', 'climax', 'descent', 'stillness'];
const PHASE_RANGES = {
  breathing: { start: 0, end: 0.18 },
  stirring: { start: 0.18, end: 0.40 },
  building: { start: 0.40, end: 0.58 },
  climax: { start: 0.58, end: 0.72 },
  descent: { start: 0.72, end: 0.88 },
  stillness: { start: 0.88, end: 1.0 },
};

function clamp01(value) {
  return Math.max(0, Math.min(1, value));
}

function getNextPhaseName(name) {
  const index = PHASE_ORDER.indexOf(name);
  if (index < 0 || index >= PHASE_ORDER.length - 1) return null;
  return PHASE_ORDER[index + 1];
}

function getPhaseCenterPercent(name) {
  const range = PHASE_RANGES[name];
  if (!range) return null;
  return ((range.start + range.end) / 2) * 100;
}

function clampLabelPercent(percent) {
  return Math.max(4, Math.min(96, percent));
}

function setLabelPosition(node, percent) {
  if (!node || percent == null) return;
  node.style.left = `${clampLabelPercent(percent).toFixed(2)}%`;
}

function formatListeningDuration(totalSeconds) {
  const clamped = Math.max(0, Number.isFinite(totalSeconds) ? totalSeconds : 0);
  const totalMinutes = Math.floor(clamped / 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return hours > 0 ? `${hours}h${minutes}m` : `${minutes}m`;
}

function buildConductorTimeline(conductorTimeline, conductorPlayhead) {
  if (!conductorTimeline) return null;

  const phaseElements = new Map();
  const boundaryElements = new Map();

  conductorTimeline.innerHTML = '';

  PHASE_ORDER.forEach((name) => {
    const range = PHASE_RANGES[name];

    const phaseEl = document.createElement('div');
    phaseEl.className = 'conductor-phase is-upcoming';
    phaseEl.dataset.phase = name;
    phaseEl.style.left = `${(range.start * 100).toFixed(2)}%`;
    phaseEl.style.width = `${((range.end - range.start) * 100).toFixed(2)}%`;
    conductorTimeline.appendChild(phaseEl);
    phaseElements.set(name, phaseEl);

    if (range.end < 1) {
      const boundaryEl = document.createElement('div');
      boundaryEl.className = 'conductor-boundary';
      boundaryEl.dataset.boundaryAfter = name;
      boundaryEl.style.left = `${(range.end * 100).toFixed(2)}%`;
      conductorTimeline.appendChild(boundaryEl);
      boundaryElements.set(name, boundaryEl);
    }
  });

  const playhead = conductorPlayhead ?? document.createElement('div');
  playhead.classList.add('conductor-playhead');
  playhead.style.left = '0%';
  conductorTimeline.appendChild(playhead);

  return { phaseElements, boundaryElements, playhead };
}

export function setupInfoPanels({
  weatherPanel,
  weatherContent,
  weatherClose,
  weatherMenuBtn,
  buildWeatherText,
  audioPanel,
  audioContent,
  audioClose,
  audioMenuBtn,
  buildAudioText,
  conductorPanel,
  conductorStatus,
  conductorTimeline,
  conductorPlayhead,
  conductorCurrent,
  conductorNext,
  conductorMenuBtn,
  movementConductor,
  conductorEnabled = false,
}) {
  const listeners = [];
  let conductorRefreshInterval = null;
  const personalityButtons = Array.from(document.querySelectorAll('.personality-btn'));
  const timelineState = conductorEnabled
    ? buildConductorTimeline(conductorTimeline, conductorPlayhead)
    : null;

  function stopConductorRefresh() {
    if (conductorRefreshInterval == null) return;
    clearInterval(conductorRefreshInterval);
    conductorRefreshInterval = null;
  }

  function startConductorRefresh() {
    if (!conductorEnabled || conductorRefreshInterval != null) return;
    conductorRefreshInterval = setInterval(() => {
      if (movementConductor?.isPaused) return;
      updateConductorUI();
    }, 30000);
  }

  function addListener(node, event, handler) {
    if (!node) return;
    node.addEventListener(event, handler);
    listeners.push({ node, event, handler });
  }

  function hideConductorPanel() {
    conductorPanel?.classList.add('hidden');
    stopConductorRefresh();
  }

  function hideWeatherPanel() {
    weatherPanel?.classList.add('hidden');
  }

  function hideAudioPanel() {
    audioPanel?.classList.add('hidden');
  }

  function hideAllPanels() {
    hideWeatherPanel();
    hideAudioPanel();
    hideConductorPanel();
  }

  const toggleWeatherPanel = () => {
    if (!weatherPanel || !weatherContent) return;
    hideAudioPanel();
    hideConductorPanel();
    weatherContent.innerHTML = typeof buildWeatherText === 'function' ? buildWeatherText() : '';
    weatherPanel.classList.toggle('hidden');
  };

  const toggleAudioPanel = () => {
    if (!audioPanel || !audioContent) return;
    hideWeatherPanel();
    hideConductorPanel();
    audioContent.innerHTML = typeof buildAudioText === 'function' ? buildAudioText() : '';
    audioPanel.classList.toggle('hidden');
  };

  function updateConductorUI({ force = false } = {}) {
    if (!conductorPanel || !conductorEnabled) return;
    if (!force && conductorPanel.classList.contains('hidden')) return;

    const phase = movementConductor?.getCurrentPhase?.() ?? {
      name: 'inactive',
      progress: 0,
      movementNumber: 0,
      personality: '',
    };

    if (conductorStatus) {
      conductorStatus.textContent = phase.name !== 'inactive'
        ? `mvt. ${phase.movementNumber} | listening for ${formatListeningDuration(phase.listeningSeconds)}`
        : 'inactive';
    }

    const progress = clamp01(phase.progress ?? 0);
    if (timelineState?.playhead) {
      timelineState.playhead.style.left = `${(progress * 100).toFixed(2)}%`;
    }

    PHASE_ORDER.forEach((name) => {
      const phaseEl = timelineState?.phaseElements.get(name);
      if (!phaseEl) return;
      const range = PHASE_RANGES[name];
      const isCurrent = phase.name === name && phase.name !== 'inactive';
      const isComplete = phase.name !== 'inactive' && !isCurrent && progress >= range.end;
      const isUpcoming = !isCurrent && !isComplete;
      phaseEl.classList.toggle('is-current', isCurrent);
      phaseEl.classList.toggle('is-complete', isComplete);
      phaseEl.classList.toggle('is-upcoming', isUpcoming);
    });

    if (conductorCurrent) {
      conductorCurrent.textContent = phase.name === 'inactive' ? 'inactive' : phase.name;
      setLabelPosition(conductorCurrent, phase.name === 'inactive' ? 4 : getPhaseCenterPercent(phase.name));
    }

    if (conductorNext) {
      if (phase.name === 'inactive') {
        conductorNext.textContent = 'breathing';
        setLabelPosition(conductorNext, getPhaseCenterPercent('breathing'));
      } else {
        const nextPhaseName = getNextPhaseName(phase.name);
        conductorNext.textContent = nextPhaseName ?? 'next movement';
        setLabelPosition(conductorNext, nextPhaseName ? getPhaseCenterPercent(nextPhaseName) : 100);
      }
    }

    personalityButtons.forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.personality === phase.personality);
    });
  }

  const toggleConductorPanel = () => {
    if (!conductorPanel || !conductorEnabled) return;
    hideWeatherPanel();
    hideAudioPanel();
    conductorPanel.classList.toggle('hidden');
    if (conductorPanel.classList.contains('hidden')) {
      stopConductorRefresh();
    } else {
      startConductorRefresh();
    }
    updateConductorUI({ force: true });
  };

  addListener(weatherMenuBtn, 'click', toggleWeatherPanel);
  addListener(audioMenuBtn, 'click', toggleAudioPanel);
  addListener(weatherClose, 'click', hideWeatherPanel);
  addListener(audioClose, 'click', hideAudioPanel);

  if (conductorEnabled) {
    conductorMenuBtn?.removeAttribute('hidden');
    conductorMenuBtn?.removeAttribute('aria-hidden');
    conductorPanel?.removeAttribute('hidden');

    addListener(conductorMenuBtn, 'click', toggleConductorPanel);
    personalityButtons.forEach((btn) => {
      addListener(btn, 'click', () => {
        const personality = btn.dataset.personality;
        if (!personality) return;
        movementConductor?.setPersonalityOverride?.(personality);
        updateConductorUI({ force: true });
      });
    });
    movementConductor?.onMovementChange?.(() => updateConductorUI());
    movementConductor?.onPhaseChange?.(() => updateConductorUI());
  } else {
    conductorMenuBtn?.setAttribute('hidden', '');
    conductorMenuBtn?.setAttribute('aria-hidden', 'true');
    conductorPanel?.setAttribute('hidden', '');
    hideConductorPanel();
    if (timelineState?.playhead) timelineState.playhead.style.left = '0%';
    if (conductorPlayhead) conductorPlayhead.style.left = '0%';
    if (conductorCurrent) {
      conductorCurrent.textContent = '';
      conductorCurrent.style.left = '4%';
    }
    if (conductorNext) {
      conductorNext.textContent = '';
      conductorNext.style.left = '4%';
    }
    stopConductorRefresh();
  }

  return {
    toggleWeatherPanel,
    toggleAudioPanel,
    toggleConductorPanel,
    hideAllPanels,
    updateConductorUI,
    dispose() {
      stopConductorRefresh();
      listeners.forEach(({ node, event, handler }) => {
        node.removeEventListener(event, handler);
      });
    },
  };
}
