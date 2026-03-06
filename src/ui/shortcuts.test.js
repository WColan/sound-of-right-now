import { afterEach, describe, expect, it, vi } from 'vitest';
import { FakeDocument, FakeElement, FakeEvent } from '../test/fake-dom.js';
import { handleMainKeydown } from './shortcuts.js';

function setupDom() {
  const document = new FakeDocument();
  global.document = document;

  const weatherPanel = new FakeElement('div', document);
  const audioPanel = new FakeElement('div', document);
  const conductorPanel = new FakeElement('div', document);
  const canvas = new FakeElement('canvas', document);
  canvas.requestFullscreen = vi.fn();

  document.body.appendChild(weatherPanel);
  document.body.appendChild(audioPanel);
  document.body.appendChild(conductorPanel);
  document.body.appendChild(canvas);

  return { weatherPanel, audioPanel, conductorPanel, canvas };
}

describe('handleMainKeydown', () => {
  afterEach(() => {
    delete global.document;
  });

  it('toggles conductor panel on C/c', () => {
    const { weatherPanel, audioPanel, conductorPanel, canvas } = setupDom();
    const toggleConductorPanel = vi.fn();

    handleMainKeydown(new FakeEvent('keydown', { key: 'c', bubbles: true }), {
      isEngineReady: true,
      activeTagName: null,
      weatherPanel,
      audioPanel,
      conductorPanel,
      toggleConductorPanel,
      canvas,
    });
    handleMainKeydown(new FakeEvent('keydown', { key: 'C', bubbles: true }), {
      isEngineReady: true,
      activeTagName: null,
      weatherPanel,
      audioPanel,
      conductorPanel,
      toggleConductorPanel,
      canvas,
    });

    expect(toggleConductorPanel).toHaveBeenCalledTimes(2);
  });

  it('closes weather/audio/conductor on Escape', () => {
    const { weatherPanel, audioPanel, conductorPanel, canvas } = setupDom();
    const secondaryMenuController = { close: vi.fn() };

    handleMainKeydown(new FakeEvent('keydown', { key: 'Escape', bubbles: true }), {
      isEngineReady: true,
      activeTagName: null,
      secondaryMenuController,
      weatherPanel,
      audioPanel,
      conductorPanel,
      canvas,
    });

    expect(secondaryMenuController.close).toHaveBeenCalledTimes(1);
    expect(weatherPanel.classList.contains('hidden')).toBe(true);
    expect(audioPanel.classList.contains('hidden')).toBe(true);
    expect(conductorPanel.classList.contains('hidden')).toBe(true);
  });

  it('ignores shortcuts while typing in inputs', () => {
    const { weatherPanel, audioPanel, conductorPanel, canvas } = setupDom();
    const toggleConductorPanel = vi.fn();

    handleMainKeydown(new FakeEvent('keydown', { key: 'c', bubbles: true }), {
      isEngineReady: true,
      activeTagName: 'INPUT',
      weatherPanel,
      audioPanel,
      conductorPanel,
      toggleConductorPanel,
      canvas,
    });

    expect(toggleConductorPanel).not.toHaveBeenCalled();
  });
});
