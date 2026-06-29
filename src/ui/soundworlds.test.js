import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FakeDocument, FakeElement, click } from '../test/fake-dom.js';
import { setupSoundworldPanel } from './soundworlds.js';
import { WORLDS } from '../music/soundworlds/index.js';

function setupDom() {
  const document = new FakeDocument();
  global.document = document;
  const panel = new FakeElement('div', document);
  panel.classList.add('hidden');
  const listEl = new FakeElement('div', document);
  const openBtn = new FakeElement('button', document);
  const closeBtn = new FakeElement('button', document);
  document.body.appendChild(panel);
  document.body.appendChild(listEl);
  document.body.appendChild(openBtn);
  return { panel, listEl, openBtn, closeBtn };
}

describe('setupSoundworldPanel', () => {
  beforeEach(() => { vi.restoreAllMocks(); });
  afterEach(() => { delete global.document; });

  it('renders an Auto card plus one card per registered world', () => {
    const { panel, listEl, openBtn, closeBtn } = setupDom();
    setupSoundworldPanel({ panel, listEl, openBtn, closeBtn, onSelectWorld: () => {} });
    const cards = listEl.querySelectorAll('.soundworld-card');
    expect(cards.length).toBe(WORLDS.length + 1); // worlds + Auto
    expect(cards[0].dataset.worldId).toBe('__auto__');
  });

  it('locks a world when its card is clicked', () => {
    const { panel, listEl, openBtn, closeBtn } = setupDom();
    const onSelectWorld = vi.fn();
    setupSoundworldPanel({ panel, listEl, openBtn, closeBtn, onSelectWorld });
    const tempestCard = listEl.querySelectorAll('.soundworld-card')
      .find((c) => c.dataset.worldId === 'tempest');
    click(tempestCard);
    expect(onSelectWorld).toHaveBeenCalledWith('tempest');
  });

  it('returns to Auto (null) when the Auto card is clicked', () => {
    const { panel, listEl, openBtn, closeBtn } = setupDom();
    const onSelectWorld = vi.fn();
    setupSoundworldPanel({ panel, listEl, openBtn, closeBtn, onSelectWorld });
    const autoCard = listEl.querySelectorAll('.soundworld-card')[0];
    click(autoCard);
    expect(onSelectWorld).toHaveBeenCalledWith(null);
  });

  it('toggles panel visibility and runs onBeforeOpen when opening', () => {
    const { panel, listEl, openBtn, closeBtn } = setupDom();
    const onBeforeOpen = vi.fn();
    const api = setupSoundworldPanel({ panel, listEl, openBtn, closeBtn, onSelectWorld: () => {}, onBeforeOpen });
    expect(panel.classList.contains('hidden')).toBe(true);
    click(openBtn);
    expect(panel.classList.contains('hidden')).toBe(false);
    expect(onBeforeOpen).toHaveBeenCalledTimes(1);
    click(openBtn);
    expect(panel.classList.contains('hidden')).toBe(true);
    api.dispose();
  });

  it('highlights the active world (locked) vs the Auto suggestion', () => {
    const { panel, listEl, openBtn, closeBtn } = setupDom();
    const api = setupSoundworldPanel({ panel, listEl, openBtn, closeBtn, onSelectWorld: () => {} });
    const cardFor = (id) => listEl.querySelectorAll('.soundworld-card').find((c) => c.dataset.worldId === id);

    // Locked world: that card is .active, Auto is not.
    api.setActiveWorld('alpine', true);
    expect(cardFor('alpine').classList.contains('active')).toBe(true);
    expect(cardFor('__auto__').classList.contains('active')).toBe(false);

    // Auto mode: active world shown as a suggestion, Auto control active.
    api.setActiveWorld('alpine', false);
    expect(cardFor('alpine').classList.contains('suggested')).toBe(true);
    expect(cardFor('alpine').classList.contains('active')).toBe(false);
    expect(cardFor('__auto__').classList.contains('active')).toBe(true);
  });
});
