/**
 * The sky sections.
 *
 * Moon     — cold silver light → a celesta motif; it climbs while the moon
 *            waxes and descends while it wanes, from where the moon really is.
 * Spheres  — each planet above the horizon sings a pure tone at its Keplerian
 *            pitch (orbital frequency relative to Earth's, folded into the key).
 * Aurora   — geomagnetic storms make the sky shimmer → high violin tremolo.
 * Meteors  — each shooting star is a single bright metallic spark.
 * ISS      — a point of light crossing the sky at 7.7 km/s → one gliding tone
 *            whose pitch bends with its true Doppler shift as it passes.
 */
import {
  createSectionBase, createVoice, createHits, createStochastic, createPeriodic, pitchesInRange, nearestPitch,
  midiToNote, noteToMidi, pick, rampParam, dbToGain,
} from '../toolkit.js';
import { createSpatialNode } from '../../spatial.js';

function celesta(Tone) {
  return () => new Tone.PolySynth(Tone.FMSynth, {
    harmonicity: 4,
    modulationIndex: 2.2,
    oscillator: { type: 'sine' },
    modulation: { type: 'sine' },
    envelope: { attack: 0.002, decay: 2.2, sustain: 0, release: 1.8 },
    modulationEnvelope: { attack: 0.002, decay: 0.35, sustain: 0, release: 0.3 },
  });
}

export function createMoonSection(ctx) {
  const { Tone } = ctx;
  const rng = ctx.rng ?? Math.random;
  const base = createSectionBase(ctx, 'moon', { trimDb: -8 });
  const spatial = createSpatialNode(Tone, { pan: 0, z: -1.1 });
  spatial.node.connect(base.output);
  const keys = createVoice(ctx, { fallback: celesta(Tone), fallbackVolume: -14 });
  const glock = createVoice(ctx, { sample: 'glock', volume: -22 });
  keys.output.connect(spatial.node);
  glock.output.connect(spatial.node);

  let params = { waxing: true, illumination: 0.5, on: false };
  let chordTones = [];
  let role = 'bed';

  function motif(time = Tone.now()) {
    const pool = pitchesInRange(chordTones, 72, 91);
    if (pool.length < 2) return;
    const start = Math.floor(rng() * Math.max(1, pool.length - 3));
    let line = pool.slice(start, start + 4);
    if (!params.waxing) line = line.reverse();
    const v = ctx.vel(0.3 + params.illumination * 0.35);
    line.forEach((m, i) => {
      const t = time + i * 0.55 + rng() * 0.04;
      keys.play(midiToNote(m), 2.4, t, v);
      if (params.illumination > 0.6) glock.play(midiToNote(m + 12), 1.5, t, v * 0.5);
    });
  }

  const phrases = createStochastic(ctx, {
    rate: () => (params.on ? (role === 'foreground' ? 1 / 25 : 1 / 70) * (0.7 + ctx.expr.urgency * 0.6) * (1 - ctx.expr.stillness * 0.5) : 0),
    fire: (time) => { if (base.audible) motif(time); },
    minGap: 12,
  });

  return {
    id: 'moon',
    output: base.output,
    base,
    update(next, stage, ramp = 10) {
      params = { ...params, ...next };
      role = stage?.role ?? 'bed';
      base.set({ on: next.on, level: next.level, roleDb: stage?.gainDb ?? 0 }, ramp);
      spatial.setPan(next.pan ?? 0, ramp);
    },
    onChord(chord) { chordTones = chord.chordTones ?? chord.notes; },
    start() { phrases.start(); },
    stop() { phrases.stop(); },
    pause() { this.stop(); },
    resume() { this.start(); },
    motif,
    play(n, d = 2, v = 0.5) { keys.play(n, d, Tone.now(), v); },
    playChord(notes, d = 2) { keys.play(notes, d, Tone.now(), 0.4); },
    dispose() {
      this.stop();
      keys.dispose();
      glock.dispose();
      spatial.node.dispose();
      base.dispose();
    },
  };
}

/** Fold Kepler semitones into a singable register and onto the current scale. */
export function spherePitch(root, semitones, scaleTones) {
  let m = noteToMidi(`${root}4`) + Math.round(semitones);
  while (m < 62) m += 12;
  while (m > 96) m -= 12;
  return scaleTones?.length ? nearestPitch(scaleTones, m) : m;
}

export function createSpheresSection(ctx) {
  const { Tone } = ctx;
  const base = createSectionBase(ctx, 'spheres', { trimDb: -16 });
  const PLANETS = ['Mercury', 'Venus', 'Mars', 'Jupiter', 'Saturn'];
  const voices = Object.fromEntries(PLANETS.map((name, i) => {
    const synth = new Tone.Synth({ oscillator: { type: 'sine' }, envelope: { attack: 8, decay: 0, sustain: 1, release: 10 } });
    const vibrato = new Tone.LFO({ frequency: 0.07 + i * 0.03, min: -5, max: 5 }).start();
    vibrato.connect(synth.detune);
    const gain = new Tone.Gain(0);
    const panner = new Tone.Panner(0);
    synth.connect(gain);
    gain.connect(panner);
    panner.connect(base.output);
    return [name, { synth, vibrato, gain, panner, sounding: false, midi: null }];
  }));

  let root = 'C';
  let scaleTones = [];
  let tones = [];

  function retune(ramp = 12) {
    for (const t of tones) {
      const v = voices[t.planet];
      if (!v) continue;
      const midi = spherePitch(root, t.semitones, scaleTones);
      if (v.sounding && v.midi !== midi) v.synth.frequency.rampTo?.(Tone.Frequency(midi, 'midi').toFrequency(), ramp);
      v.midi = midi;
    }
  }

  function sync(ramp) {
    const present = new Set(tones.map((t) => t.planet));
    for (const [name, v] of Object.entries(voices)) {
      const t = tones.find((x) => x.planet === name);
      if (present.has(name) && base.audible) {
        if (!v.sounding && v.midi != null) {
          v.synth.triggerAttack(midiToNote(v.midi));
          v.sounding = true;
        }
        rampParam(v.gain.gain, dbToGain(-6 + 20 * Math.log10(Math.max(0.05, t.gain))), ramp);
        rampParam(v.panner.pan, t.pan ?? 0, ramp);
      } else if (v.sounding) {
        v.synth.triggerRelease();
        v.sounding = false;
      }
    }
  }

  return {
    id: 'spheres',
    output: base.output,
    base,
    update(next, stage, ramp = 15) {
      tones = next.tones ?? [];
      base.set({ on: next.on, level: next.level, roleDb: stage?.gainDb ?? 0 }, ramp);
      retune();
      sync(ramp);
    },
    setHarmony({ root: r }) {
      root = r;
    },
    onChord(chord) {
      scaleTones = chord.scaleTones ?? chord.notes;
      retune(20);
    },
    start() { sync(4); },
    stop() {
      Object.values(voices).forEach((v) => { if (v.sounding) v.synth.triggerRelease(); v.sounding = false; });
    },
    pause() { this.stop(); },
    resume() { sync(4); },
    motif() { /* the spheres are always already sounding */ },
    play(n, d = 4) { voices.Venus.synth.triggerAttackRelease(n, d); },
    playChord(notes, d = 4) { notes.slice(0, 5).forEach((n, i) => voices[PLANETS[i]].synth.triggerAttackRelease(n, d)); },
    dispose() {
      this.stop();
      Object.values(voices).forEach((v) => { v.synth.dispose(); v.vibrato.dispose(); v.gain.dispose(); v.panner.dispose(); });
      base.dispose();
    },
  };
}

export function createAuroraSection(ctx) {
  const { Tone } = ctx;
  const rng = ctx.rng ?? Math.random;
  const base = createSectionBase(ctx, 'aurora', { trimDb: -12 });
  const shimmer = new Tone.AutoFilter({ frequency: 0.2, depth: 0.6, baseFrequency: 1500, octaves: 2.5, wet: 0.8 }).start();
  shimmer.connect(base.output);
  const trem = createVoice(ctx, {
    sample: 'violinTrem', volume: -6, attack: 1.2, release: 3,
    fallback: () => new Tone.PolySynth(Tone.Synth, { oscillator: { type: 'fatsine', count: 3, spread: 25 }, envelope: { attack: 2.5, decay: 0, sustain: 1, release: 4 } }),
    fallbackVolume: -24,
  });
  trem.output.connect(shimmer);
  let chordTones = [];
  let on = false;

  const curtains = createPeriodic(ctx, {
    interval: () => 3.8 + rng() * 2,
    fire: (time) => {
      if (!base.audible) return;
      const n = pick(pitchesInRange(chordTones, 79, 93), rng);
      if (n) trem.play(midiToNote(n), 5.5, time, ctx.vel(0.25 + rng() * 0.2));
    },
  });

  return {
    id: 'aurora',
    output: base.output,
    base,
    update(next, stage, ramp = 10) {
      on = next.on;
      base.set({ on: next.on, level: next.level, roleDb: stage?.gainDb ?? 0 }, ramp);
      rampParam(shimmer.frequency, 0.08 + (next.kp ?? 0) * 0.06, ramp);
      rampParam(shimmer.depth, 0.4 + (next.wind ?? 0) * 0.5, ramp);
    },
    onChord(chord) { chordTones = chord.chordTones ?? chord.notes; },
    start() { curtains.start(); },
    stop() { curtains.stop(); trem.releaseAll(); },
    pause() { this.stop(); },
    resume() { this.start(); },
    motif(time = Tone.now()) { if (on) pitchesInRange(chordTones, 79, 91).slice(0, 3).forEach((m, i) => trem.play(midiToNote(m), 5, time + i * 0.7, 0.4)); },
    play(n, d = 4, v = 0.4) { trem.play(n, d, Tone.now(), v); },
    playChord(notes, d = 4) { trem.play(notes, d, Tone.now(), 0.35); },
    dispose() {
      this.stop();
      trem.dispose();
      shimmer.dispose();
      base.dispose();
    },
  };
}

export function createMeteorsSection(ctx) {
  const { Tone } = ctx;
  const rng = ctx.rng ?? Math.random;
  const base = createSectionBase(ctx, 'meteors', { trimDb: -10 });
  const panner = new Tone.Panner(0);
  panner.connect(base.output);
  const spark = createVoice(ctx, { sample: 'glock', volume: -10, fallback: celesta(Tone), fallbackVolume: -18 });
  const metals = createHits(ctx, { sample: 'metals', volume: -12 });
  spark.output.connect(panner);
  metals.output.connect(panner);
  let params = { perMinute: 0, on: false };
  let chordTones = [];

  function meteor(time = Tone.now()) {
    if (!base.audible) return;
    const brightness = rng() ** 2.5; // most are faint, a few are fireballs
    const pan = rng() * 2 - 1;
    panner.pan.setValueAtTime?.(pan, time);
    const n = pick(pitchesInRange(chordTones, 91, 103), rng);
    if (n) spark.play(midiToNote(n), 1.5, time, ctx.vel(0.2 + brightness * 0.6));
    if (brightness > 0.6 && metals.has('belltree')) metals.hit('belltree', { time: time + 0.05, velocity: brightness * 0.6 });
    ctx.emit({ type: 'meteor', pan, brightness });
  }

  const shower = createStochastic(ctx, {
    rate: () => (params.on ? params.perMinute / 60 : 0),
    fire: meteor,
    minGap: 2,
  });

  return {
    id: 'meteors',
    output: base.output,
    base,
    update(next, stage, ramp = 6) {
      params = { ...params, ...next };
      base.set({ on: next.on, level: next.level, roleDb: stage?.gainDb ?? 0 }, ramp);
    },
    onChord(chord) { chordTones = chord.chordTones ?? chord.notes; },
    start() { shower.start(); },
    stop() { shower.stop(); },
    pause() { this.stop(); },
    resume() { this.start(); },
    motif: meteor,
    play(n, d = 1, v = 0.5) { spark.play(n, d, Tone.now(), v); },
    playChord(notes, d = 1) { spark.play(notes, d, Tone.now(), 0.4); },
    dispose() {
      this.stop();
      spark.dispose();
      metals.dispose();
      panner.dispose();
      base.dispose();
    },
  };
}

export function createIssSection(ctx) {
  const { Tone } = ctx;
  const base = createSectionBase(ctx, 'iss', { trimDb: -16 });
  const spatial = createSpatialNode(Tone, { pan: 0, z: -0.9 });
  spatial.node.connect(base.output);
  const tone = new Tone.FMSynth({
    harmonicity: 2,
    modulationIndex: 1.2,
    oscillator: { type: 'sine' },
    envelope: { attack: 6, decay: 0, sustain: 1, release: 8 },
  });
  const vibrato = new Tone.LFO({ frequency: 4.5, min: -6, max: 6 }).start();
  vibrato.connect(tone.detune);
  tone.connect(spatial.node);
  let sounding = false;
  let root = 'C';
  let doppler = 0;

  const baseHz = () => Tone.Frequency(noteToMidi(`${root}5`) + 7, 'midi').toFrequency();
  // ±2 semitones — a siren-like bend, honest in direction and shape
  const pitchHz = () => baseHz() * 2 ** ((doppler * 2) / 12);

  return {
    id: 'iss',
    output: base.output,
    base,
    update(next, stage, ramp = 5) {
      base.set({ on: next.on, level: next.level, roleDb: stage?.gainDb ?? 0 }, ramp);
      if (next.on) {
        doppler = next.doppler ?? 0;
        spatial.setPan(next.pan ?? 0, ramp);
        spatial.setY?.(Math.max(0, (next.elevation ?? 0) / 90), ramp);
        if (!sounding) {
          tone.triggerAttack(pitchHz());
          sounding = true;
        } else {
          tone.frequency.rampTo?.(pitchHz(), ramp);
        }
      } else if (sounding) {
        tone.triggerRelease();
        sounding = false;
      }
    },
    setHarmony({ root: r }) {
      root = r;
      if (sounding) tone.frequency.rampTo?.(pitchHz(), 8);
    },
    onChord() {},
    start() {},
    stop() { if (sounding) tone.triggerRelease(); sounding = false; },
    pause() { this.stop(); },
    resume() {},
    play(n, d = 4) { tone.triggerAttackRelease(n, d); },
    playChord(notes, d = 4) { tone.triggerAttackRelease(notes[0], d); },
    dispose() {
      this.stop();
      tone.dispose();
      vibrato.dispose();
      spatial.node.dispose();
      base.dispose();
    },
  };
}
