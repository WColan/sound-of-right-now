/**
 * Shared building blocks for orchestra sections: level handling, sampled
 * voices with synth fallbacks, pitch helpers and Transport-synced
 * stochastic schedulers.
 */
import { noteToMidi, midiToNote } from '../scale.js';

export const SILENT_DB = -80;

/** 0–1 musical level → dB (perceptual: 0.5 ≈ −6 dB, 0.1 ≈ −20 dB). */
export function levelToDb(level) {
  return level <= 0.001 ? SILENT_DB : Math.max(SILENT_DB, 20 * Math.log10(level));
}

export function dbToGain(db) {
  return db <= SILENT_DB ? 0 : 10 ** (db / 20);
}

export function rampParam(param, value, seconds = 0) {
  if (!param) return;
  if (seconds > 0 && typeof param.rampTo === 'function') param.rampTo(value, seconds);
  else if (seconds > 0 && typeof param.linearRampTo === 'function') param.linearRampTo(value, seconds);
  else param.value = value;
}

// ── Pitch helpers ─────────────────────────────────────────────────────────

const pc = (note) => noteToMidi(note) % 12;

/** All MIDI notes in [low, high] whose pitch class appears in `notes`. */
export function pitchesInRange(notes, low, high) {
  const classes = new Set((notes ?? []).map(pc));
  const out = [];
  for (let m = low; m <= high; m++) if (classes.has(m % 12)) out.push(m);
  return out;
}

export function notesInRange(notes, low, high) {
  return pitchesInRange(notes, low, high).map(midiToNote);
}

/** Nearest MIDI pitch to `target` from a set of pitch-class notes. */
export function nearestPitch(notes, target) {
  const options = pitchesInRange(notes, target - 7, target + 7);
  if (!options.length) return target;
  return options.reduce((best, m) => (Math.abs(m - target) < Math.abs(best - target) ? m : best));
}

export function pick(arr, rng = Math.random) {
  return arr.length ? arr[Math.floor(rng() * arr.length)] : undefined;
}

export { noteToMidi, midiToNote };

// ── Sampled voice with fallback ───────────────────────────────────────────

function samplerFrom(Tone, entry, keys, opts = {}) {
  const urls = Object.fromEntries(keys.map((k) => [opts.as ?? k, entry.buffers.get(k)]));
  return new Tone.Sampler({ urls, attack: opts.attack ?? 0, release: opts.release ?? 1.2 });
}

/**
 * A voice that plays a sampled instrument when loaded and a synth until then.
 * @param {object} ctx - orchestra context ({ Tone, lib })
 * @param {object} opts
 * @param {string} [opts.sample] - sample library instrument name
 * @param {Function} [opts.fallback] - () => Tone instrument (PolySynth etc.)
 * @param {number} [opts.volume] - dB trim for the sampler
 * @param {number} [opts.fallbackVolume] - dB trim for the fallback
 * @param {number} [opts.attack] / [opts.release] - sampler envelope
 */
export function createVoice(ctx, { sample, fallback, volume = 0, fallbackVolume = volume, attack, release } = {}) {
  const { Tone, lib } = ctx;
  const output = new Tone.Gain(1);
  let sampler = null;
  let synth = null;
  let disposed = false;

  if (fallback) {
    synth = fallback();
    if (synth?.volume) synth.volume.value = fallbackVolume;
    synth?.connect?.(output);
  }

  if (sample && lib) {
    lib.onReady(sample, (entry) => {
      if (disposed || !entry?.buffers) return;
      try {
        sampler = samplerFrom(Tone, entry, entry.notes, { attack, release });
        if (sampler.volume) sampler.volume.value = volume;
        sampler.connect(output);
      } catch {
        sampler = null;
      }
    });
  }

  return {
    output,
    get usingSamples() {
      return Boolean(sampler);
    },
    /** notes: string | string[]; duration seconds; time = audio time */
    play(notes, duration, time, velocity = 0.7) {
      const target = sampler ?? synth;
      if (!target) return;
      try {
        target.triggerAttackRelease(notes, duration, time, velocity);
      } catch {
        // Scheduling glitches (e.g. time in the past after a tab sleep) are harmless
      }
    },
    releaseAll(time) {
      try {
        sampler?.releaseAll?.(time);
        synth?.releaseAll?.(time);
      } catch { /* noop */ }
    },
    dispose() {
      disposed = true;
      sampler?.dispose?.();
      synth?.dispose?.();
      output.dispose();
    },
  };
}

/** Unpitched hits (gong, timpani, metals): each key is its own sampler at C4, re-pitchable. */
export function createHits(ctx, { sample, volume = 0, fallback } = {}) {
  const { Tone, lib } = ctx;
  const output = new Tone.Gain(1);
  let hits = null;
  let disposed = false;
  const synth = fallback ? fallback() : null;
  synth?.connect?.(output);
  if (sample && lib) {
    lib.onReady(sample, (entry) => {
      if (disposed || !entry?.buffers) return;
      try {
        hits = Object.fromEntries(entry.notes.map((key) => {
          const s = samplerFrom(Tone, entry, [key], { as: 'C4', release: 4 });
          if (s.volume) s.volume.value = volume;
          s.connect(output);
          return [key, s];
        }));
      } catch {
        hits = null;
      }
    });
  }
  return {
    output,
    has(key) {
      return Boolean(hits?.[key]);
    },
    hit(key, { time, velocity = 0.7, pitch = 'C4', duration = 8 } = {}) {
      try {
        if (hits?.[key]) hits[key].triggerAttackRelease(pitch, duration, time, velocity);
        else synth?.triggerAttackRelease?.(pitch, Math.min(duration, 3), time, velocity);
      } catch { /* noop */ }
    },
    dispose() {
      disposed = true;
      Object.values(hits ?? {}).forEach((s) => s.dispose?.());
      synth?.dispose?.();
      output.dispose();
    },
  };
}

// ── Transport-synced stochastic scheduler ─────────────────────────────────

/**
 * Fires `fire(time)` as a Poisson process whose rate (events/second) is read
 * fresh before every event, so rates can follow the data live. Scheduled on
 * the Transport, so pausing the Transport pauses the process.
 */
export function createStochastic(ctx, { rate, fire, minGap = 0.05, idleRecheck = 2 }) {
  const { Tone } = ctx;
  const rng = ctx.rng ?? Math.random;
  let id = null;
  let running = false;

  function scheduleNext() {
    if (!running) return;
    const transport = Tone.getTransport();
    const r = Math.max(0, rate());
    const wait = r > 0 ? Math.max(minGap, -Math.log(1 - rng()) / r) : idleRecheck;
    id = transport.scheduleOnce((time) => {
      id = null;
      if (!running) return;
      if (r > 0) {
        try { fire(time); } catch (err) { console.warn('[orchestra] event failed', err); }
      }
      scheduleNext();
    }, transport.seconds + wait);
  }

  return {
    start() {
      if (running) return;
      running = true;
      scheduleNext();
    },
    stop() {
      running = false;
      if (id != null) {
        try { Tone.getTransport().clear(id); } catch { /* noop */ }
        id = null;
      }
    },
    get running() {
      return running;
    },
  };
}

/** Fires `fire(time)` every `interval()` seconds (re-read each time). */
export function createPeriodic(ctx, { interval, fire }) {
  const { Tone } = ctx;
  let id = null;
  let running = false;

  function next() {
    if (!running) return;
    const transport = Tone.getTransport();
    id = transport.scheduleOnce((time) => {
      id = null;
      if (!running) return;
      try { fire(time); } catch (err) { console.warn('[orchestra] event failed', err); }
      next();
    }, transport.seconds + Math.max(0.05, interval()));
  }

  return {
    start() {
      if (running) return;
      running = true;
      next();
    },
    stop() {
      running = false;
      if (id != null) {
        try { Tone.getTransport().clear(id); } catch { /* noop */ }
        id = null;
      }
    },
    get running() {
      return running;
    },
  };
}

// ── Section base ──────────────────────────────────────────────────────────

/**
 * Common level/role/mute handling. Sections call `base.apply()` from their
 * update(); `extraDb` lets a section add its own dynamics (e.g. conductor).
 */
export function createSectionBase(ctx, id, { trimDb = 0, levelRamp = 6 } = {}) {
  const { Tone } = ctx;
  const output = new Tone.Gain(0);
  const state = { on: false, level: 0, roleDb: 0, muted: false, extraDb: 0 };

  function targetDb() {
    if (!state.on || state.muted) return SILENT_DB;
    return levelToDb(state.level) + state.roleDb + trimDb + state.extraDb;
  }

  return {
    id,
    output,
    state,
    apply(ramp = levelRamp) {
      rampParam(output.gain, dbToGain(targetDb()), ramp);
    },
    set({ on, level, roleDb }, ramp) {
      state.on = Boolean(on);
      state.level = level ?? 0;
      state.roleDb = Number.isFinite(roleDb) ? roleDb : 0;
      this.apply(ramp);
    },
    setMuted(muted) {
      state.muted = Boolean(muted);
      this.apply(1);
    },
    setExtraDb(db, ramp) {
      state.extraDb = db;
      this.apply(ramp);
    },
    get audible() {
      return state.on && !state.muted;
    },
    dispose() {
      output.dispose();
    },
  };
}
