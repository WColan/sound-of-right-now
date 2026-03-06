import { afterEach, describe, expect, it, vi } from 'vitest';
import { FakeDocument, FakeElement, click } from '../test/fake-dom.js';
import { setupInfoPanels } from './panels.js';

function createDom() {
  const document = new FakeDocument();
  global.document = document;

  const weatherPanel = new FakeElement('div', document);
  weatherPanel.id = 'weather-panel';
  weatherPanel.classList.add('hidden');
  const weatherContent = new FakeElement('div', document);
  weatherPanel.appendChild(weatherContent);
  const weatherClose = new FakeElement('button', document);
  weatherPanel.appendChild(weatherClose);
  const weatherMenuBtn = new FakeElement('button', document);

  const audioPanel = new FakeElement('div', document);
  audioPanel.id = 'audio-panel';
  audioPanel.classList.add('hidden');
  const audioContent = new FakeElement('div', document);
  audioPanel.appendChild(audioContent);
  const audioClose = new FakeElement('button', document);
  audioPanel.appendChild(audioClose);
  const audioMenuBtn = new FakeElement('button', document);

  const conductorPanel = new FakeElement('div', document);
  conductorPanel.id = 'conductor-panel';
  conductorPanel.classList.add('hidden');
  const conductorStatus = new FakeElement('div', document);
  const conductorTimeline = new FakeElement('div', document);
  const conductorPlayhead = new FakeElement('div', document);
  conductorTimeline.appendChild(conductorPlayhead);
  const conductorCurrent = new FakeElement('span', document);
  const conductorNext = new FakeElement('div', document);
  conductorPanel.appendChild(conductorStatus);
  conductorPanel.appendChild(conductorTimeline);
  conductorPanel.appendChild(conductorCurrent);
  conductorPanel.appendChild(conductorNext);
  const conductorMenuBtn = new FakeElement('button', document);

  const p1 = new FakeElement('button', document);
  p1.classList.add('personality-btn');
  p1.dataset.personality = 'contemplative';
  const p2 = new FakeElement('button', document);
  p2.classList.add('personality-btn');
  p2.dataset.personality = 'dramatic';
  const p3 = new FakeElement('button', document);
  p3.classList.add('personality-btn');
  p3.dataset.personality = 'meditative';
  const p4 = new FakeElement('button', document);
  p4.classList.add('personality-btn');
  p4.dataset.personality = 'restless';
  conductorPanel.appendChild(p1);
  conductorPanel.appendChild(p2);
  conductorPanel.appendChild(p3);
  conductorPanel.appendChild(p4);

  document.body.appendChild(weatherPanel);
  document.body.appendChild(audioPanel);
  document.body.appendChild(conductorPanel);
  document.body.appendChild(weatherMenuBtn);
  document.body.appendChild(audioMenuBtn);
  document.body.appendChild(conductorMenuBtn);

  return {
    weatherPanel,
    weatherContent,
    weatherClose,
    weatherMenuBtn,
    audioPanel,
    audioContent,
    audioClose,
    audioMenuBtn,
    conductorPanel,
    conductorStatus,
    conductorTimeline,
    conductorPlayhead,
    conductorCurrent,
    conductorNext,
    conductorMenuBtn,
    personalityButtons: [p1, p2, p3, p4],
  };
}

describe('setupInfoPanels', () => {
  afterEach(() => {
    vi.useRealTimers();
    delete global.document;
  });

  it('keeps panels mutually exclusive across weather/audio/conductor toggles', () => {
    const dom = createDom();
    const movementConductor = {
      getCurrentPhase: () => ({
        name: 'breathing',
        movementNumber: 1,
        personality: 'contemplative',
        remaining: 300,
        listeningSeconds: 600,
      }),
      onMovementChange: vi.fn(),
      onPhaseChange: vi.fn(),
      setPersonalityOverride: vi.fn(),
    };

    const controls = setupInfoPanels({
      ...dom,
      buildWeatherText: () => 'weather',
      buildAudioText: () => 'audio',
      movementConductor,
      conductorEnabled: true,
    });

    controls.toggleConductorPanel();
    expect(dom.conductorPanel.classList.contains('hidden')).toBe(false);

    controls.toggleWeatherPanel();
    expect(dom.weatherPanel.classList.contains('hidden')).toBe(false);
    expect(dom.conductorPanel.classList.contains('hidden')).toBe(true);

    controls.toggleAudioPanel();
    expect(dom.audioPanel.classList.contains('hidden')).toBe(false);
    expect(dom.weatherPanel.classList.contains('hidden')).toBe(true);
    expect(dom.conductorPanel.classList.contains('hidden')).toBe(true);
  });

  it('maps movement progress to timeline playhead and phase segment states', () => {
    const dom = createDom();
    let movementChangeCb = null;
    let phaseChangeCb = null;
    let phase = {
      name: 'building',
      movementNumber: 2,
      personality: 'dramatic',
      remaining: 181,
      elapsed: 420,
      progress: 0.5,
      listeningSeconds: 4200,
    };
    const movementConductor = {
      getCurrentPhase: () => phase,
      setPersonalityOverride: vi.fn(),
      onMovementChange: vi.fn((fn) => { movementChangeCb = fn; }),
      onPhaseChange: vi.fn((fn) => { phaseChangeCb = fn; }),
    };

    const controls = setupInfoPanels({
      ...dom,
      buildWeatherText: () => 'weather',
      buildAudioText: () => 'audio',
      movementConductor,
      conductorEnabled: true,
    });

    controls.toggleConductorPanel();
    expect(dom.conductorStatus.textContent).toBe('mvt. 2 | listening for 1h10m');
    expect(dom.conductorCurrent.textContent).toBe('building');
    expect(dom.conductorCurrent.style.left).toBe('49.00%');
    expect(dom.conductorNext.textContent).toBe('climax');
    expect(dom.conductorNext.style.left).toBe('65.00%');
    expect(dom.conductorNext.textContent.includes('next:')).toBe(false);
    expect(dom.conductorPlayhead.style.left).toBe('50.00%');

    const boundaries = dom.conductorTimeline.querySelectorAll('.conductor-boundary');
    const buildingBoundary = boundaries.find((el) => el.dataset.boundaryAfter === 'building');
    expect(buildingBoundary).toBeTruthy();
    expect(buildingBoundary.style.left).toBe('58.00%');

    const phases = dom.conductorTimeline.querySelectorAll('.conductor-phase');
    const breathing = phases.find((el) => el.dataset.phase === 'breathing');
    const stirring = phases.find((el) => el.dataset.phase === 'stirring');
    const building = phases.find((el) => el.dataset.phase === 'building');
    const climax = phases.find((el) => el.dataset.phase === 'climax');
    expect(breathing.classList.contains('is-complete')).toBe(true);
    expect(stirring.classList.contains('is-complete')).toBe(true);
    expect(building.classList.contains('is-current')).toBe(true);
    expect(climax.classList.contains('is-upcoming')).toBe(true);
    expect(dom.personalityButtons[1].classList.contains('active')).toBe(true);

    click(dom.personalityButtons[2]);
    expect(movementConductor.setPersonalityOverride).toHaveBeenCalledWith('meditative');

    phase = {
      name: 'stillness',
      movementNumber: 3,
      personality: 'restless',
      remaining: 61,
      elapsed: 580,
      progress: 0.95,
      listeningSeconds: 5460,
    };
    movementChangeCb();
    phaseChangeCb();
    expect(dom.conductorStatus.textContent).toBe('mvt. 3 | listening for 1h31m');
    expect(dom.conductorCurrent.textContent).toBe('stillness');
    expect(dom.conductorCurrent.style.left).toBe('94.00%');
    expect(dom.conductorNext.textContent).toBe('next movement');
    expect(dom.conductorNext.style.left).toBe('96.00%');
    expect(dom.conductorPlayhead.style.left).toBe('95.00%');
    expect(dom.personalityButtons[3].classList.contains('active')).toBe(true);
  });

  it('hides conductor controls when feature is disabled', () => {
    const dom = createDom();
    const controls = setupInfoPanels({
      ...dom,
      buildWeatherText: () => 'weather',
      buildAudioText: () => 'audio',
      movementConductor: null,
      conductorEnabled: false,
    });

    expect(dom.conductorMenuBtn.getAttribute('hidden')).toBe('');
    expect(dom.conductorPanel.getAttribute('hidden')).toBe('');
    expect(dom.conductorPanel.classList.contains('hidden')).toBe(true);
    expect(dom.conductorPlayhead.style.left).toBe('0%');
    expect(dom.conductorCurrent.textContent).toBe('');
    expect(dom.conductorCurrent.style.left).toBe('4%');
    expect(dom.conductorNext.textContent).toBe('');
    expect(dom.conductorNext.style.left).toBe('4%');

    controls.toggleConductorPanel();
    expect(dom.conductorPanel.classList.contains('hidden')).toBe(true);
  });

  it('does not refresh listening timer while paused', () => {
    vi.useFakeTimers();
    const dom = createDom();
    const phase = {
      name: 'building',
      movementNumber: 1,
      personality: 'dramatic',
      progress: 0.5,
      listeningSeconds: 600,
    };
    const movementConductor = {
      isPaused: true,
      getCurrentPhase: () => phase,
      setPersonalityOverride: vi.fn(),
      onMovementChange: vi.fn(),
      onPhaseChange: vi.fn(),
    };

    const controls = setupInfoPanels({
      ...dom,
      buildWeatherText: () => 'weather',
      buildAudioText: () => 'audio',
      movementConductor,
      conductorEnabled: true,
    });

    controls.toggleConductorPanel();
    expect(dom.conductorStatus.textContent).toBe('mvt. 1 | listening for 10m');

    phase.listeningSeconds = 720;
    vi.advanceTimersByTime(120000);
    expect(dom.conductorStatus.textContent).toBe('mvt. 1 | listening for 10m');

    movementConductor.isPaused = false;
    vi.advanceTimersByTime(30000);
    expect(dom.conductorStatus.textContent).toBe('mvt. 1 | listening for 12m');

    controls.dispose();
    vi.useRealTimers();
  });
});
