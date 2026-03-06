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
  conductorPanel.appendChild(conductorStatus);
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
    conductorMenuBtn,
    personalityButtons: [p1, p2, p3, p4],
  };
}

describe('setupInfoPanels', () => {
  afterEach(() => {
    delete global.document;
  });

  it('keeps panels mutually exclusive across weather/audio/conductor toggles', () => {
    const dom = createDom();
    const movementConductor = {
      getCurrentPhase: () => ({ name: 'breathing', movementNumber: 1, personality: 'contemplative', remaining: 300 }),
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

  it('updates conductor UI from callbacks and personality clicks', () => {
    const dom = createDom();
    let movementChangeCb = null;
    let phaseChangeCb = null;
    let phase = {
      name: 'building',
      movementNumber: 2,
      personality: 'dramatic',
      remaining: 181,
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
    expect(dom.conductorStatus.textContent).toBe('building · mvt #2 · 4m left');
    expect(dom.personalityButtons[1].classList.contains('active')).toBe(true);

    click(dom.personalityButtons[2]);
    expect(movementConductor.setPersonalityOverride).toHaveBeenCalledWith('meditative');

    phase = {
      name: 'climax',
      movementNumber: 3,
      personality: 'restless',
      remaining: 61,
    };
    movementChangeCb();
    phaseChangeCb();
    expect(dom.conductorStatus.textContent).toBe('climax · mvt #3 · 2m left');
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

    controls.toggleConductorPanel();
    expect(dom.conductorPanel.classList.contains('hidden')).toBe(true);
  });
});
