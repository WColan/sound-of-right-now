/**
 * Soundworld gallery panel.
 *
 * Lists every soundworld so the listener can preview/lock one ("what does a
 * blizzard sound like?") or return to weather-driven selection via "Auto".
 * Mirrors the info-panel show/hide conventions used elsewhere in the UI.
 */
import { listWorlds } from '../music/soundworlds/index.js';

const AUTO_ID = '__auto__';

/**
 * @param {object} opts
 * @param {HTMLElement} opts.panel - The panel container (.info-panel)
 * @param {HTMLElement} opts.listEl - Container for the world cards
 * @param {HTMLElement} [opts.openBtn] - Menu button that toggles the panel
 * @param {HTMLElement} [opts.closeBtn] - The panel's close button
 * @param {(id: string|null) => void} opts.onSelectWorld - Called with a world id
 *   to lock, or null to return to Auto (weather-driven).
 * @param {() => void} [opts.onBeforeOpen] - Called before the panel opens (e.g.
 *   to hide other panels).
 */
export function setupSoundworldPanel({ panel, listEl, openBtn, closeBtn, onSelectWorld, onBeforeOpen }) {
  if (!panel || !listEl) {
    return { toggle() {}, hide() {}, setActiveWorld() {}, dispose() {} };
  }

  const listeners = [];
  const cards = new Map();

  function add(node, event, handler) {
    if (!node) return;
    node.addEventListener(event, handler);
    listeners.push({ node, event, handler });
  }

  function makeCard(id, name, blurb, extraClass = '') {
    const card = document.createElement('button');
    card.className = `soundworld-card${extraClass ? ' ' + extraClass : ''}`;
    card.dataset.worldId = id;
    const nameEl = document.createElement('span');
    nameEl.className = 'soundworld-name';
    nameEl.textContent = name;
    const blurbEl = document.createElement('span');
    blurbEl.className = 'soundworld-blurb';
    blurbEl.textContent = blurb;
    card.appendChild(nameEl);
    card.appendChild(blurbEl);
    return card;
  }

  function buildCards() {
    listEl.innerHTML = '';
    cards.clear();

    const auto = makeCard(AUTO_ID, 'Auto', 'Match the current weather', 'soundworld-auto');
    add(auto, 'click', () => onSelectWorld?.(null));
    listEl.appendChild(auto);
    cards.set(AUTO_ID, auto);

    for (const world of listWorlds()) {
      const card = makeCard(world.id, world.name, world.blurb);
      add(card, 'click', () => onSelectWorld?.(world.id));
      listEl.appendChild(card);
      cards.set(world.id, card);
    }
  }

  /**
   * Highlight the active world. When `locked` is false the active card is shown
   * as a weather "suggestion" and the Auto control is marked active.
   */
  function setActiveWorld(activeId, locked) {
    cards.forEach((card, id) => {
      if (id === AUTO_ID) {
        card.classList.toggle('active', !locked);
        return;
      }
      const isActive = id === activeId;
      card.classList.toggle('active', isActive && locked);
      card.classList.toggle('suggested', isActive && !locked);
    });
  }

  function hide() {
    panel.classList.add('hidden');
  }

  function toggle() {
    const willOpen = panel.classList.contains('hidden');
    if (willOpen) onBeforeOpen?.();
    panel.classList.toggle('hidden');
  }

  buildCards();
  add(openBtn, 'click', toggle);
  add(closeBtn, 'click', hide);

  return {
    toggle,
    hide,
    setActiveWorld,
    dispose() {
      listeners.forEach(({ node, event, handler }) => node.removeEventListener(event, handler));
    },
  };
}
