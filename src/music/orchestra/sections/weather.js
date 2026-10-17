/**
 * Rain — every droplet is a pluck: harp and piano at a density that follows
 * the real precipitation rate, over the hiss of rain itself. Drizzle is a
 * few high piano notes; snow is slow glockenspiel flakes.
 *
 * Storm — convective energy is drum energy: timpani rolls, low trombones on
 * chord changes, and thunder that arrives *after* the lightning, as it does.
 *
 * Air — what floats in it: particulate grain crackle (PM2.5) and drifting
 * pizzicato motes for pollen. (Haze itself darkens the master filter.)
 */
import { createSectionBase, createVoice, createHits, createStochastic, pitchesInRange, midiToNote, pick } from '../toolkit.js';

const PENTATONIC_STEPS = new Set([0, 2, 4, 7, 9]);

export function createRainSection(ctx) {
  const { Tone } = ctx;
  const rng = ctx.rng ?? Math.random;
  const atmosphere = ctx.atmosphere; // shared texture voice (rain hiss + drops)
  const base = createSectionBase(ctx, 'rain', { trimDb: -9 });
  const panner = new Tone.Panner(0);
  panner.connect(base.output);

  const harp = createVoice(ctx, {
    sample: 'harp', volume: -3,
    fallback: () => new Tone.PolySynth(Tone.Synth, { oscillator: { type: 'triangle' }, envelope: { attack: 0.003, decay: 1.2, sustain: 0, release: 0.8 } }),
    fallbackVolume: -18,
  });
  const piano = createVoice(ctx, { sample: 'piano', volume: -6 });
  const glock = createVoice(ctx, {
    sample: 'glock', volume: -12,
    fallback: () => new Tone.PolySynth(Tone.FMSynth, { harmonicity: 3.5, modulationIndex: 6, envelope: { attack: 0.002, decay: 2.5, sustain: 0, release: 2 } }),
    fallbackVolume: -26,
  });
  [harp, piano, glock].forEach((v) => v.output.connect(panner));

  let params = { density: 1, instrument: 'rain', hiss: 0, on: false };
  let scaleTones = [];
  let lastRain = -1;
  let root = 'C';

  function drop(time) {
    if (!base.audible || !scaleTones.length) return;
    panner.pan.setValueAtTime?.((rng() * 2 - 1) * 0.85, time);
    if (params.instrument === 'snow') {
      // Flakes: pentatonic-only (no clashes), high and soft, slow
      const rootPc = pitchesInRange([`${root}4`], 0, 11)[0] ?? 0;
      const options = pitchesInRange(scaleTones, 79, 98).filter((m) => PENTATONIC_STEPS.has((m - rootPc + 120) % 12));
      const n = pick(options.length ? options : pitchesInRange(scaleTones, 79, 98), rng);
      if (n) glock.play(midiToNote(n), 3, time, ctx.vel(0.18 + rng() * 0.2));
      return;
    }
    if (params.instrument === 'drizzle') {
      const n = pick(pitchesInRange(scaleTones, 74, 93), rng);
      if (n) piano.play(midiToNote(n), 2, time, ctx.vel(0.15 + rng() * 0.15));
      return;
    }
    const heavy = rng() < Math.min(0.5, params.density / 14);
    const options = pitchesInRange(scaleTones, heavy ? 55 : 67, heavy ? 79 : 96);
    const n = pick(options, rng);
    if (n == null) return;
    const voice = rng() < 0.7 ? harp : piano;
    voice.play(midiToNote(n), 1.5, time, ctx.vel(0.15 + rng() * (heavy ? 0.35 : 0.2)));
  }

  const drops = createStochastic(ctx, {
    rate: () => (params.on ? params.density * (0.5 + ctx.expr.energy * 0.7) * (1 - ctx.expr.stillness * 0.7) : 0),
    fire: drop,
    minGap: 0.04,
  });

  function setHiss() {
    if (!atmosphere) return;
    const audible = params.on && base.audible;
    const intensity = audible && params.instrument !== 'snow' ? Math.round((0.15 + params.hiss * 0.75) * 10) / 10 : 0;
    if (intensity === lastRain) return;
    lastRain = intensity;
    atmosphere.setRain(intensity > 0, intensity);
    if (intensity > 0) {
      atmosphere.setNoiseType('pink');
      atmosphere.setVolume(-34 + intensity * 12, 6);
    } else {
      atmosphere.setVolume(-60, 6);
    }
  }

  return {
    id: 'rain',
    output: base.output,
    base,
    update(next, stage, ramp = 5) {
      params = { ...params, ...next };
      base.set({ on: next.on, level: next.level, roleDb: stage?.gainDb ?? 0 }, ramp);
      setHiss();
    },
    setMuted(m) { base.setMuted(m); setHiss(); },
    setHarmony({ root: r }) { root = r; },
    onChord(chord) { scaleTones = chord.scaleTones ?? chord.notes; },
    start() { drops.start(); },
    stop() {
      drops.stop();
      lastRain = -1;
      atmosphere?.setRain(false);
    },
    pause() { this.stop(); },
    resume() { this.start(); setHiss(); },
    motif(time = Tone.now()) {
      // A short cascade of drops
      for (let i = 0; i < 6; i++) drop(time + i * 0.18 + rng() * 0.1);
    },
    play(n, d = 1.5, v = 0.5) { harp.play(n, d, Tone.now(), v); },
    playChord(notes, d = 2) { harp.play(notes, d, Tone.now(), 0.4); },
    dispose() {
      this.stop();
      harp.dispose();
      piano.dispose();
      glock.dispose();
      panner.dispose();
      base.dispose();
    },
  };
}

export function createStormSection(ctx) {
  const { Tone } = ctx;
  const rng = ctx.rng ?? Math.random;
  const base = createSectionBase(ctx, 'storm', { trimDb: -6 });
  const rolls = createHits(ctx, {
    sample: 'timpaniRoll', volume: -4,
    fallback: () => new Tone.MembraneSynth({ pitchDecay: 0.08, octaves: 3, envelope: { attack: 0.01, decay: 1.6, sustain: 0, release: 1 }, volume: -10 }),
  });
  const timpani = createHits(ctx, { sample: 'timpani', volume: -4 });
  const gong = createHits(ctx, { sample: 'gong', volume: -6 });
  const bassDrum = createHits(ctx, {
    sample: 'metals', volume: -4,
    fallback: () => new Tone.MembraneSynth({ pitchDecay: 0.2, octaves: 4, envelope: { attack: 0.005, decay: 2.5, sustain: 0, release: 1 }, volume: -8 }),
  });
  const trombones = createVoice(ctx, {
    sample: 'trombones', volume: -6, attack: 0.15, release: 1.5,
    fallback: () => new Tone.PolySynth(Tone.FMSynth, { harmonicity: 1, modulationIndex: 3, envelope: { attack: 0.2, decay: 0.3, sustain: 0.7, release: 1.2 } }),
    fallbackVolume: -22,
  });
  // Distant thunder: brown noise rumble with its own envelope
  const rumble = new Tone.Noise({ type: 'brown', volume: -8 });
  const rumbleFilter = new Tone.Filter({ frequency: 220, type: 'lowpass', rolloff: -24 });
  const rumbleEnv = new Tone.AmplitudeEnvelope({ attack: 0.4, decay: 3, sustain: 0.25, release: 5 });
  rumble.connect(rumbleFilter);
  rumbleFilter.connect(rumbleEnv);
  [rolls, timpani, gong, bassDrum, trombones].forEach((v) => v.output.connect(base.output));
  rumbleEnv.connect(base.output);

  let params = { energy: 0, thunderPerMinute: 0, on: false };
  let bassNote = 'C2';

  function thunder(time) {
    if (!base.audible) return;
    // Lightning is seen first; sound travels ~3 s per km
    const distanceKm = 1 + rng() * 8;
    const delay = distanceKm * 2.9;
    ctx.emit({ type: 'lightning', distanceKm, delay });
    const t = time + delay;
    const closeness = 1 - distanceKm / 9;
    rumbleFilter.frequency.setValueAtTime?.(120 + closeness * 400, t);
    if (rumble.state !== 'started') rumble.start(t - 0.1);
    rumbleEnv.triggerAttackRelease(2 + rng() * 3, t, 0.4 + closeness * 0.6);
    if (closeness > 0.5) bassDrum.hit('bassdrum', { time: t, velocity: 0.4 + closeness * 0.5, pitch: 'A3' });
    if (gong.has('scrape') && rng() < 0.5) gong.hit('scrape', { time: t + 0.3, velocity: 0.3 + closeness * 0.3, pitch: 'G3' });
  }

  const strikes = createStochastic(ctx, {
    rate: () => (params.on ? params.thunderPerMinute / 60 : 0),
    fire: thunder,
    minGap: 8,
  });
  const drumRolls = createStochastic(ctx, {
    rate: () => (params.on ? (0.5 + params.energy * 2.5) / 60 * (0.6 + ctx.expr.energy * 0.8) : 0),
    fire: (time) => {
      if (!base.audible) return;
      rolls.hit(rng() < 0.5 ? 'roll1' : 'roll4', { time, velocity: 0.3 + params.energy * 0.5, pitch: rng() < 0.5 ? 'C4' : 'A3', duration: 8 });
    },
    minGap: 10,
  });

  return {
    id: 'storm',
    output: base.output,
    base,
    update(next, stage, ramp = 4) {
      params = { ...params, ...next };
      base.set({ on: next.on, level: next.level, roleDb: stage?.gainDb ?? 0 }, ramp);
      if (!next.on && rumble.state === 'started') rumble.stop('+6');
    },
    onChord(chord) {
      bassNote = chord.bassNote ?? chord.notes[0];
      if (!base.audible || params.energy < 0.55) return;
      const low = pitchesInRange([bassNote], 36, 47)[0];
      if (low != null) {
        const t = Tone.now() + 0.05;
        trombones.play([midiToNote(low), midiToNote(low + 7)], 2.5, t, ctx.vel(0.35 + params.energy * 0.3));
        timpani.hit('hit1', { time: t, velocity: 0.4 + params.energy * 0.4 });
      }
    },
    triggerThunder(time = Tone.now()) { thunder(time); },
    start() { strikes.start(); drumRolls.start(); },
    stop() {
      strikes.stop();
      drumRolls.stop();
      if (rumble.state === 'started') rumble.stop();
    },
    pause() { this.stop(); },
    resume() { this.start(); },
    motif(time = Tone.now()) { rolls.hit('roll4', { time, velocity: 0.5, duration: 6 }); },
    play(n, d = 2, v = 0.6) { trombones.play(n, d, Tone.now(), v); },
    playChord(notes, d = 2) { trombones.play(notes, d, Tone.now(), 0.5); },
    dispose() {
      this.stop();
      [rolls, timpani, gong, bassDrum, trombones].forEach((v) => v.dispose());
      rumble.dispose();
      rumbleFilter.dispose();
      rumbleEnv.dispose();
      base.dispose();
    },
  };
}

export function createAirSection(ctx) {
  const { Tone } = ctx;
  const rng = ctx.rng ?? Math.random;
  const atmosphere = ctx.atmosphere;
  const base = createSectionBase(ctx, 'air', { trimDb: -14 });
  const motes = createVoice(ctx, {
    sample: 'violinPizz', volume: -6,
    fallback: () => new Tone.PolySynth(Tone.Synth, { oscillator: { type: 'sine' }, envelope: { attack: 0.002, decay: 0.3, sustain: 0, release: 0.2 } }),
    fallbackVolume: -20,
  });
  const panner = new Tone.Panner(0);
  motes.output.connect(panner);
  panner.connect(base.output);

  let params = { pollen: 0, grain: 0, on: false };
  let scaleTones = [];
  let lastGrain = -1;

  const drift = createStochastic(ctx, {
    rate: () => (params.on ? params.pollen * 0.6 : 0),
    fire: (time) => {
      if (!base.audible) return;
      const n = pick(pitchesInRange(scaleTones, 79, 93), rng);
      panner.pan.setValueAtTime?.((rng() * 2 - 1) * 0.9, time);
      if (n) motes.play(midiToNote(n), 0.6, time, ctx.vel(0.12 + rng() * 0.12));
    },
    minGap: 0.4,
  });

  function setGrain() {
    const g = params.on && base.audible ? Math.round(params.grain * 10) / 10 : 0;
    if (g === lastGrain) return;
    lastGrain = g;
    atmosphere?.setGrainIntensity(g);
  }

  return {
    id: 'air',
    output: base.output,
    base,
    update(next, stage, ramp = 8) {
      params = { ...params, ...next };
      base.set({ on: next.on, level: next.level, roleDb: stage?.gainDb ?? 0 }, ramp);
      setGrain();
    },
    setMuted(m) { base.setMuted(m); setGrain(); },
    onChord(chord) { scaleTones = chord.scaleTones ?? chord.notes; },
    start() { drift.start(); },
    stop() { drift.stop(); lastGrain = -1; atmosphere?.setGrainIntensity(0); },
    pause() { this.stop(); },
    resume() { this.start(); setGrain(); },
    play(n, d = 0.5, v = 0.3) { motes.play(n, d, Tone.now(), v); },
    playChord(notes, d = 0.5) { motes.play(notes, d, Tone.now(), 0.3); },
    dispose() {
      this.stop();
      motes.dispose();
      panner.dispose();
      base.dispose();
    },
  };
}
