import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { setupOverlayStartShortcuts, setupSecondaryMenu, showPrimaryControls } from './shell.js';
import { FakeDocument, FakeElement, FakeEvent, click } from '../test/fake-dom.js';

function setupDom() {
  const document = new FakeDocument();
  global.document = document;

  const overlay = new FakeElement('div', document);
  overlay.id = 'overlay';

  const infoDisplay = new FakeElement('div', document);
  infoDisplay.id = 'info-display';
  infoDisplay.classList.add('hidden');

  const controls = new FakeElement('div', document);
  controls.id = 'controls';
  controls.classList.add('hidden');

  const chordDisplay = new FakeElement('div', document);
  chordDisplay.id = 'chord-display';
  chordDisplay.classList.add('hidden');

  const menuBtn = new FakeElement('button', document);
  menuBtn.id = 'menu-btn';
  menuBtn.setAttribute('aria-expanded', 'false');
  const listenBtn = new FakeElement('button', document);
  listenBtn.id = 'listen-btn';
  listenBtn.disabled = false;

  const secondaryMenu = new FakeElement('div', document);
  secondaryMenu.id = 'secondary-menu';
  secondaryMenu.classList.add('hidden');

  const locationBtn = new FakeElement('button', document);
  locationBtn.id = 'location-btn';
  const sleepBtn = new FakeElement('button', document);
  sleepBtn.id = 'sleep-btn';
  const shareBtn = new FakeElement('button', document);
  shareBtn.id = 'share-btn';
  secondaryMenu.appendChild(locationBtn);
  secondaryMenu.appendChild(sleepBtn);
  secondaryMenu.appendChild(shareBtn);

  document.body.appendChild(overlay);
  document.body.appendChild(infoDisplay);
  document.body.appendChild(controls);
  document.body.appendChild(chordDisplay);
  document.body.appendChild(menuBtn);
  document.body.appendChild(listenBtn);
  document.body.appendChild(secondaryMenu);

  return {
    overlay,
    infoDisplay,
    controls,
    chordDisplay,
    menuBtn,
    listenBtn,
    secondaryMenu,
    locationBtn,
    sleepBtn,
    shareBtn,
  };
}

describe('ui shell helpers', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    delete global.document;
  });

  it('reveals control/info sections after overlay fade delay', async () => {
    const { overlay, infoDisplay, controls, chordDisplay } = setupDom();

    showPrimaryControls({ overlay, infoDisplay, controls, chordDisplay, delayMs: 1000 });
    expect(overlay.classList.contains('fade-out')).toBe(true);
    expect(infoDisplay.classList.contains('hidden')).toBe(true);
    expect(controls.classList.contains('hidden')).toBe(true);

    await vi.advanceTimersByTimeAsync(1000);
    expect(infoDisplay.classList.contains('hidden')).toBe(false);
    expect(controls.classList.contains('hidden')).toBe(false);
    expect(chordDisplay.classList.contains('hidden')).toBe(false);
  });

  it('starts listening on Enter while overlay is visible', () => {
    const { overlay, listenBtn } = setupDom();
    const onStart = vi.fn();
    const controller = setupOverlayStartShortcuts({ overlay, listenBtn, onStart });

    document.dispatchEvent(new FakeEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(onStart).toHaveBeenCalledTimes(1);

    controller.dispose();
  });

  it('starts listening on Space and prevents default', () => {
    const { overlay, listenBtn } = setupDom();
    const onStart = vi.fn();
    const controller = setupOverlayStartShortcuts({ overlay, listenBtn, onStart });

    const event = new FakeEvent('keydown', { key: ' ', bubbles: true });
    document.dispatchEvent(event);
    expect(onStart).toHaveBeenCalledTimes(1);
    expect(event.defaultPrevented).toBe(true);

    controller.dispose();
  });

  it('does not trigger while overlay is fading out', () => {
    const { overlay, listenBtn } = setupDom();
    overlay.classList.add('fade-out');
    const onStart = vi.fn();
    const controller = setupOverlayStartShortcuts({ overlay, listenBtn, onStart });

    document.dispatchEvent(new FakeEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(onStart).not.toHaveBeenCalled();

    controller.dispose();
  });

  it('does not trigger while typing in an input', () => {
    const { overlay, listenBtn } = setupDom();
    const input = new FakeElement('input', document);
    document.body.appendChild(input);
    input.focus();
    const onStart = vi.fn();
    const controller = setupOverlayStartShortcuts({ overlay, listenBtn, onStart });

    document.dispatchEvent(new FakeEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(onStart).not.toHaveBeenCalled();

    controller.dispose();
  });

  it('stops handling keys after dispose', () => {
    const { overlay, listenBtn } = setupDom();
    const onStart = vi.fn();
    const controller = setupOverlayStartShortcuts({ overlay, listenBtn, onStart });
    controller.dispose();

    document.dispatchEvent(new FakeEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(onStart).not.toHaveBeenCalled();
  });

  it('keeps sleep/share open, closes on other items, and closes on outside click', () => {
    const { menuBtn, secondaryMenu, locationBtn, sleepBtn, shareBtn } = setupDom();
    let menuWasClosedWhenLocationActionRan = null;

    // Simulate an existing action handler (registered before menu wiring).
    locationBtn.addEventListener('click', () => {
      menuWasClosedWhenLocationActionRan = secondaryMenu.classList.contains('hidden');
    });

    const controller = setupSecondaryMenu({
      menuBtn,
      secondaryMenu,
      keepOpenItemIds: ['sleep-btn', 'share-btn'],
    });

    click(menuBtn);
    expect(secondaryMenu.classList.contains('hidden')).toBe(false);
    expect(menuBtn.getAttribute('aria-expanded')).toBe('true');

    click(sleepBtn);
    expect(secondaryMenu.classList.contains('hidden')).toBe(false);
    expect(menuBtn.getAttribute('aria-expanded')).toBe('true');

    click(shareBtn);
    expect(secondaryMenu.classList.contains('hidden')).toBe(false);
    expect(menuBtn.getAttribute('aria-expanded')).toBe('true');

    click(locationBtn);
    expect(menuWasClosedWhenLocationActionRan).toBe(true);
    expect(secondaryMenu.classList.contains('hidden')).toBe(true);
    expect(menuBtn.getAttribute('aria-expanded')).toBe('false');

    click(menuBtn);
    expect(secondaryMenu.classList.contains('hidden')).toBe(false);

    document.dispatchEvent(new FakeEvent('click', { bubbles: true }));
    expect(secondaryMenu.classList.contains('hidden')).toBe(true);

    controller.dispose();
  });
});
