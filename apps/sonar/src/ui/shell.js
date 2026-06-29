/**
 * UI shell helpers for the primary control reveal and secondary action menu.
 */

/**
 * Fade out the overlay and reveal the control/info panels after a delay.
 * Returns the timeout id so callers can cancel if needed.
 */
export function showPrimaryControls({ overlay, infoDisplay, controls, chordDisplay, delayMs = 1000 }) {
  overlay?.classList.add('fade-out');
  return setTimeout(() => {
    infoDisplay?.classList.remove('hidden');
    controls?.classList.remove('hidden');
    chordDisplay?.classList.remove('hidden');
  }, delayMs);
}

/**
 * Wire a compact secondary menu.
 */
export function setupSecondaryMenu({ menuBtn, secondaryMenu, keepOpenItemIds = [] }) {
  if (!menuBtn || !secondaryMenu) {
    const noop = () => {};
    return { open: noop, close: noop, toggle: noop, dispose: noop };
  }
  const keepOpenIds = new Set(keepOpenItemIds);

  const close = () => {
    secondaryMenu.classList.add('hidden');
    menuBtn.setAttribute('aria-expanded', 'false');
  };

  const open = () => {
    secondaryMenu.classList.remove('hidden');
    menuBtn.setAttribute('aria-expanded', 'true');
  };

  const toggle = () => {
    if (secondaryMenu.classList.contains('hidden')) open();
    else close();
  };

  const onMenuClick = (e) => {
    e.stopPropagation();
    toggle();
  };

  const onItemClick = (item) => {
    if (keepOpenIds.has(item.id)) return;
    close();
  };

  const onDocClick = (e) => {
    const target = e.target;
    if (secondaryMenu.contains(target) || menuBtn.contains(target)) return;
    close();
  };

  menuBtn.addEventListener('click', onMenuClick);
  const menuItems = Array.from(secondaryMenu.querySelectorAll('button'));
  const itemHandlers = new Map();
  for (const item of menuItems) {
    const handler = () => onItemClick(item);
    itemHandlers.set(item, handler);
    // Use capture so menu closes before any item click handlers (e.g. location toggle).
    item.addEventListener('click', handler, true);
  }
  document.addEventListener('click', onDocClick);

  return {
    open,
    close,
    toggle,
    dispose() {
      menuBtn.removeEventListener('click', onMenuClick);
      for (const item of menuItems) {
        const handler = itemHandlers.get(item);
        if (handler) item.removeEventListener('click', handler, true);
      }
      document.removeEventListener('click', onDocClick);
    },
  };
}

/**
 * Wire Enter/Space shortcuts for the landing overlay start action.
 */
export function setupOverlayStartShortcuts({ overlay, listenBtn, onStart }) {
  if (!listenBtn || typeof onStart !== 'function') {
    return { dispose: () => {} };
  }

  const onKeyDown = (e) => {
    const key = e.key;
    const isEnter = key === 'Enter';
    const isSpace = key === ' ' || key === 'Spacebar';
    if (!isEnter && !isSpace) return;

    const activeTag = document.activeElement?.tagName;
    if (activeTag === 'INPUT' || activeTag === 'TEXTAREA' || activeTag === 'SELECT') return;

    if (overlay?.classList.contains('fade-out')) return;
    if (listenBtn.disabled) return;

    e.preventDefault();
    onStart();
  };

  document.addEventListener('keydown', onKeyDown);

  return {
    dispose() {
      document.removeEventListener('keydown', onKeyDown);
    },
  };
}
