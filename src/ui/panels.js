/**
 * Wire weather/audio/conductor info panels and keep their visibility behavior
 * consistent across menu clicks and keyboard shortcuts.
 */
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
  conductorMenuBtn,
  movementConductor,
  conductorEnabled = false,
}) {
  const listeners = [];
  const personalityButtons = Array.from(document.querySelectorAll('.personality-btn'));

  function addListener(node, event, handler) {
    if (!node) return;
    node.addEventListener(event, handler);
    listeners.push({ node, event, handler });
  }

  function hideConductorPanel() {
    conductorPanel?.classList.add('hidden');
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
      movementNumber: 0,
      personality: '',
      remaining: 0,
    };

    if (conductorStatus) {
      const remaining = Math.ceil((phase.remaining ?? 0) / 60);
      conductorStatus.textContent = phase.name !== 'inactive'
        ? `${phase.name} · mvt #${phase.movementNumber} · ${remaining}m left`
        : 'inactive';
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
  }

  return {
    toggleWeatherPanel,
    toggleAudioPanel,
    toggleConductorPanel,
    hideAllPanels,
    updateConductorUI,
    dispose() {
      listeners.forEach(({ node, event, handler }) => {
        node.removeEventListener(event, handler);
      });
    },
  };
}
