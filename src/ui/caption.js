/**
 * Ephemeral captions for rare moments ("the ISS is passing overhead"),
 * so a listener who hears something new can find out what it was.
 */
export function createCaption(el = document.getElementById('now-caption')) {
  let timer = null;
  const seen = new Map();
  return {
    show(text, { ms = 9000, key = text, cooldownMs = 30 * 60000 } = {}) {
      if (!el) return;
      const last = seen.get(key);
      if (last && Date.now() - last < cooldownMs) return;
      seen.set(key, Date.now());
      el.textContent = text;
      el.classList.add('visible');
      clearTimeout(timer);
      timer = setTimeout(() => el.classList.remove('visible'), ms);
    },
    dispose() { clearTimeout(timer); },
  };
}
