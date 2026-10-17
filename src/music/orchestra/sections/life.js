/**
 * Life — the creatures around you.
 *
 * Birds    a dawn (and smaller dusk) chorus. Each place gets its own small
 *          cast of "species" — song shapes seeded from the birds actually
 *          observed nearby — so a patient listener learns the local voices.
 * Crickets chirp at exactly the rate Dolbear's law gives for the current
 *          temperature. Count chirps in 14 s, add 40: that's °F.
 * Frogs    a low pulsed chorus on humid spring/summer nights.
 */
import { createSectionBase, createStochastic, createPeriodic, rampParam } from '../toolkit.js';
import { createRng } from '../../../now/util.js';

const SONG_SHAPES = ['whistle', 'trill', 'warble', 'chirp'];

function hashString(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

/** Deterministic song "species" for a place, from observed names (or the location). */
export function birdCast(names = [], seedKey = 'here', count = 4) {
  const keys = names.length ? names.slice(0, count) : Array.from({ length: count }, (_, i) => `${seedKey}#${i}`);
  return keys.map((name) => {
    const r = createRng(hashString(name));
    return {
      name,
      shape: SONG_SHAPES[Math.floor(r() * SONG_SHAPES.length)],
      baseHz: 1800 + r() * 3200,
      notes: 2 + Math.floor(r() * 6),
      step: 0.06 + r() * 0.22,
      drop: 0.75 + r() * 0.35, // pitch ratio across the phrase (<1 falls)
      weight: 0.4 + r(),
    };
  });
}

export function createLifeSection(ctx) {
  const { Tone } = ctx;
  const rng = ctx.rng ?? Math.random;
  const base = createSectionBase(ctx, 'life', { trimDb: -14 });

  // ── Birds: a small round-robin pool of sine voices ──
  const birdBus = new Tone.Gain(0);
  birdBus.connect(base.output);
  const birdPool = Array.from({ length: 4 }, () => {
    const synth = new Tone.Synth({ oscillator: { type: 'sine' }, envelope: { attack: 0.01, decay: 0.05, sustain: 0.8, release: 0.06 }, volume: -10 });
    const panner = new Tone.Panner(0);
    synth.connect(panner);
    panner.connect(birdBus);
    return { synth, panner };
  });
  let poolIndex = 0;
  let cast = birdCast();

  function sing(time) {
    if (!base.audible || !cast.length) return;
    const total = cast.reduce((a, s) => a + s.weight, 0);
    let pickW = rng() * total;
    const species = cast.find((s) => (pickW -= s.weight) <= 0) ?? cast[0];
    const { synth, panner } = birdPool[poolIndex++ % birdPool.length];
    panner.pan.setValueAtTime?.((rng() * 2 - 1) * 0.9, time);
    const f = synth.frequency;
    let t = time;
    const vel = 0.25 + rng() * 0.35;
    const steps = species.shape === 'trill' ? species.notes * 3 : species.notes;
    for (let i = 0; i < steps; i++) {
      const progress = steps > 1 ? i / (steps - 1) : 0;
      const hz = species.baseHz * species.drop ** progress * (species.shape === 'warble' ? 0.85 + rng() * 0.3 : 1);
      const len = species.shape === 'trill' ? 0.045 : species.shape === 'chirp' ? 0.07 : species.step;
      f.setValueAtTime?.(hz * (species.shape === 'chirp' ? 0.8 : 1), t);
      if (species.shape === 'whistle' || species.shape === 'chirp') f.exponentialRampToValueAtTime?.(hz * (species.shape === 'chirp' ? 1.25 : 0.94), t + len);
      synth.triggerAttackRelease(hz, len, t, vel);
      t += len + (species.shape === 'trill' ? 0.03 : 0.04 + rng() * 0.05);
    }
  }

  // ── Crickets: three individuals, slightly out of phase ──
  const cricketBus = new Tone.Gain(0);
  cricketBus.connect(base.output);
  const crickets = [-0.6, 0.15, 0.7].map((pan, i) => {
    const synth = new Tone.Synth({ oscillator: { type: 'sine' }, envelope: { attack: 0.003, decay: 0.018, sustain: 0, release: 0.01 }, volume: -16 });
    const panner = new Tone.Panner(pan);
    synth.connect(panner);
    panner.connect(cricketBus);
    return { synth, panner, hz: 4300 + i * 220, drift: 1 + (i - 1) * 0.06 };
  });
  let chirpRate = 0; // chirps per minute

  // ── Frogs: pulsed low croaks through a vocal-tract band-pass ──
  const frogBus = new Tone.Gain(0);
  frogBus.connect(base.output);
  const frogFilter = new Tone.Filter({ frequency: 700, type: 'bandpass', Q: 3 });
  const frog = new Tone.Synth({ oscillator: { type: 'sawtooth' }, envelope: { attack: 0.004, decay: 0.03, sustain: 0, release: 0.02 }, volume: -14 });
  const frogPan = new Tone.Panner(0);
  frog.connect(frogFilter);
  frogFilter.connect(frogPan);
  frogPan.connect(frogBus);

  let levels = { birds: 0, crickets: 0, frogs: 0 };

  const birds = createStochastic(ctx, {
    rate: () => levels.birds * 0.7 * (1 - ctx.expr.stillness * 0.6),
    fire: sing,
    minGap: 0.6,
  });
  const cricketLoops = crickets.map((c) => createPeriodic(ctx, {
    interval: () => (chirpRate > 0 ? 60 / (chirpRate * c.drift) : 3),
    fire: (time) => {
      if (!base.audible || levels.crickets <= 0.02 || chirpRate <= 0) return;
      for (let p = 0; p < 3; p++) c.synth.triggerAttackRelease(c.hz, 0.02, time + p * 0.032, 0.5);
    },
  }));
  const frogs = createStochastic(ctx, {
    rate: () => levels.frogs * 0.5,
    fire: (time) => {
      if (!base.audible) return;
      const hz = 140 + rng() * 160;
      frogPan.pan.setValueAtTime?.((rng() * 2 - 1) * 0.8, time);
      const pulses = 4 + Math.floor(rng() * 6);
      for (let p = 0; p < pulses; p++) frog.triggerAttackRelease(hz, 0.03, time + p * 0.055, 0.5);
    },
    minGap: 0.5,
  });

  return {
    id: 'life',
    output: base.output,
    base,
    update(next, stage, ramp = 10) {
      levels = { birds: next.birds ?? 0, crickets: next.crickets ?? 0, frogs: next.frogs ?? 0 };
      chirpRate = next.chirpRate ?? 0;
      base.set({ on: next.on, level: 1, roleDb: stage?.gainDb ?? 0 }, ramp);
      rampParam(birdBus.gain, levels.birds, ramp);
      rampParam(cricketBus.gain, levels.crickets * 0.8, ramp);
      rampParam(frogBus.gain, levels.frogs * 0.8, ramp);
    },
    /** Call once per location with the observed species names. */
    setCast(names, seedKey) { cast = birdCast(names, seedKey); },
    onChord() {},
    start() {
      birds.start();
      frogs.start();
      cricketLoops.forEach((l) => l.start());
    },
    stop() {
      birds.stop();
      frogs.stop();
      cricketLoops.forEach((l) => l.stop());
    },
    pause() { this.stop(); },
    resume() { this.start(); },
    motif: sing,
    play(n, d = 0.2, v = 0.5) { birdPool[0].synth.triggerAttackRelease(n, d, undefined, v); },
    playChord(notes, d = 0.2) { notes.slice(0, 4).forEach((n, i) => birdPool[i].synth.triggerAttackRelease(n, d)); },
    dispose() {
      this.stop();
      birdPool.forEach(({ synth, panner }) => { synth.dispose(); panner.dispose(); });
      crickets.forEach(({ synth, panner }) => { synth.dispose(); panner.dispose(); });
      [frog, frogFilter, frogPan, birdBus, cricketBus, frogBus].forEach((n) => n.dispose());
      base.dispose();
    },
  };
}
