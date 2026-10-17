/**
 * Sample library — lazy, tiered loading of the vendored VSCO-2 CE instruments.
 *
 * Tier 1 (the string bed) loads first, then horns/winds/keys, then colour and
 * percussion. Decoded buffers are shared; each voice builds its own
 * Tone.Sampler from them, so sections never hear each other's notes.
 * Until an instrument is ready, its section plays a synth fallback — the
 * first sound is instant and the orchestra "fills in".
 */
const DEFAULT_BASE = `${import.meta.env?.BASE_URL ?? '/'}samples/`;

export function createSampleLibrary(Tone, { baseUrl = DEFAULT_BASE, fetchImpl = globalThis.fetch } = {}) {
  const ready = new Map();      // name → { buffers, notes, unpitched }
  const waiters = new Map();    // name → [fn]
  let loading = null;
  let disposed = false;

  function markReady(name, entry) {
    if (disposed) return;
    ready.set(name, entry);
    (waiters.get(name) ?? []).forEach((fn) => fn(entry));
    waiters.delete(name);
  }

  function loadBuffers(name, entry) {
    return new Promise((resolve) => {
      let buffers = null;
      try {
        buffers = new Tone.ToneAudioBuffers({
          urls: entry.notes,
          baseUrl: `${baseUrl}${name}/`,
          onload: () => {
            markReady(name, { buffers, notes: Object.keys(entry.notes), unpitched: Boolean(entry.unpitched) });
            resolve(true);
          },
          onerror: () => resolve(false),
        });
      } catch {
        resolve(false);
      }
    });
  }

  return {
    /** Fetch the manifest, then load tiers in order. Never throws; idempotent. */
    load() {
      loading ??= (async () => {
        let manifest = null;
        try {
          const res = await fetchImpl(`${baseUrl}manifest.json`);
          manifest = res?.ok ? await res.json() : null;
        } catch {
          manifest = null;
        }
        if (!manifest) return false;
        for (const tier of [1, 2, 3]) {
          if (disposed) return false;
          const names = Object.entries(manifest).filter(([, e]) => e.tier === tier);
          await Promise.all(names.map(([name, entry]) => loadBuffers(name, entry)));
        }
        return true;
      })();
      return loading;
    },
    get(name) {
      return ready.get(name) ?? null;
    },
    isReady(name) {
      return ready.has(name);
    },
    onReady(name, fn) {
      if (ready.has(name)) fn(ready.get(name));
      else waiters.set(name, [...(waiters.get(name) ?? []), fn]);
    },
    /** Forget pending callbacks (e.g. from a disposed orchestra) without dropping buffers. */
    clearWaiters() {
      waiters.clear();
    },
    get readyNames() {
      return [...ready.keys()];
    },
    dispose() {
      disposed = true;
      for (const entry of ready.values()) entry.buffers?.dispose?.();
      ready.clear();
      waiters.clear();
    },
  };
}
