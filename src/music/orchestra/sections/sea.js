/**
 * Ocean — celli and basses swell and recede on the actual wave period, with
 * a surf wash riding each swell. Bigger seas, bigger swells; a rising tide
 * lifts the line, an ebbing one lets it sink. Waves arrive from their real
 * direction.
 *
 * River — a quiet running figure in low pizzicato/harp that quickens as the
 * river swells above its normal flow.
 */
import { createSectionBase, createVoice, createPeriodic, pitchesInRange, midiToNote, rampParam, pick } from '../toolkit.js';
import { lerp } from '../../../now/util.js';

export function createOceanSection(ctx) {
  const { Tone } = ctx;
  const rng = ctx.rng ?? Math.random;
  const base = createSectionBase(ctx, 'ocean', { trimDb: -3 });
  const panner = new Tone.Panner(0);
  const warmth = new Tone.Filter({ frequency: 1800, type: 'lowpass', rolloff: -12 });
  warmth.connect(panner);
  panner.connect(base.output);

  const celli = createVoice(ctx, {
    sample: 'celli', volume: -4, attack: 1.5, release: 4,
    fallback: () => new Tone.PolySynth(Tone.Synth, { oscillator: { type: 'fatsawtooth', count: 2, spread: 14 }, envelope: { attack: 2, decay: 0.5, sustain: 0.8, release: 4 } }),
    fallbackVolume: -22,
  });
  const basses = createVoice(ctx, { sample: 'basses', volume: -6, attack: 1.8, release: 4 });
  celli.output.connect(warmth);
  basses.output.connect(warmth);

  // Surf: brown noise through a lowpass, its gain shaped per swell
  const surf = new Tone.Noise({ type: 'brown', volume: -14 });
  const surfFilter = new Tone.Filter({ frequency: 700, type: 'lowpass', rolloff: -24 });
  const surfEnv = new Tone.Gain(0);
  surf.connect(surfFilter);
  surfFilter.connect(surfEnv);
  surfEnv.connect(panner);

  let params = { period: 8, height: 0.6, tideLift: 0 };
  let chordTones = [];

  function swell(time) {
    if (!base.audible || !chordTones.length) return;
    const p = params.period;
    const intensity = Math.min(1, 0.35 + params.height / 3.5);
    // Rising tide reaches for higher chord tones; ebb settles low
    const low = Math.round(40 + params.tideLift * 4);
    const options = pitchesInRange(chordTones, low, low + 14);
    const note = pick(options, rng);
    if (note != null) {
      celli.play(midiToNote(note), p * 0.7, time, ctx.vel(0.35 + intensity * 0.35));
      if (rng() < 0.5 + intensity * 0.4) basses.play(midiToNote(note - 12), p * 0.6, time + 0.15, ctx.vel(0.3 + intensity * 0.3));
    }
    // The wash: rises with the swell, breaks, drains away
    const peak = 0.25 + intensity * 0.75;
    surfEnv.gain.cancelScheduledValues?.(time);
    surfEnv.gain.setValueAtTime?.(surfEnv.gain.value ?? 0, time);
    surfEnv.gain.linearRampToValueAtTime?.(peak, time + p * 0.45);
    surfEnv.gain.linearRampToValueAtTime?.(peak * 0.15, time + p * 0.9);
  }

  const waves = createPeriodic(ctx, {
    interval: () => params.period * (0.9 + rng() * 0.2),
    fire: swell,
  });

  return {
    id: 'ocean',
    output: base.output,
    base,
    update(next, stage, ramp = 8) {
      params = { ...params, ...next };
      base.set({ on: next.on, level: next.level, roleDb: stage?.gainDb ?? 0 }, ramp);
      rampParam(panner.pan, next.pan ?? 0, ramp);
      rampParam(warmth.frequency, lerp(900, 3200, next.warmth ?? 0.5), ramp * 2);
      rampParam(surfFilter.frequency, lerp(400, 1400, Math.min(1, (next.height ?? 0.5) / 3)), ramp);
      if (next.on && surf.state !== 'started') surf.start();
    },
    onChord(chord) { chordTones = chord.chordTones ?? chord.notes; },
    start() { waves.start(); },
    stop() {
      waves.stop();
      if (surf.state === 'started') surf.stop();
      celli.releaseAll();
      basses.releaseAll();
    },
    pause() { this.stop(); },
    resume() { this.start(); if (base.state.on) surf.start(); },
    motif(time) { swell(time ?? Tone.now()); },
    play(n, d = 6, v = 0.6) { celli.play(n, d, Tone.now(), v); },
    playChord(notes, d = 6) { celli.play(notes, d, Tone.now(), 0.5); },
    dispose() {
      this.stop();
      celli.dispose();
      basses.dispose();
      surf.dispose();
      surfFilter.dispose();
      surfEnv.dispose();
      warmth.dispose();
      panner.dispose();
      base.dispose();
    },
  };
}

export function createRiverSection(ctx) {
  const { Tone } = ctx;
  const rng = ctx.rng ?? Math.random;
  const base = createSectionBase(ctx, 'river', { trimDb: -8 });
  const tone = new Tone.Filter({ frequency: 1600, type: 'lowpass' });
  tone.connect(base.output);
  const pizz = createVoice(ctx, {
    sample: 'celloPizz', volume: -4,
    fallback: () => new Tone.PolySynth(Tone.Synth, { oscillator: { type: 'triangle' }, envelope: { attack: 0.005, decay: 0.6, sustain: 0, release: 0.4 } }),
    fallbackVolume: -18,
  });
  const harp = createVoice(ctx, { sample: 'harp', volume: -8 });
  pizz.output.connect(tone);
  harp.output.connect(tone);

  let rate = 2;
  let pool = [];
  let index = 0;
  let direction = 1;

  const flow = createPeriodic(ctx, {
    interval: () => (1 / rate) * (0.8 + rng() * 0.4) / (0.6 + ctx.expr.energy * 0.6),
    fire: (time) => {
      if (!base.audible || !pool.length) return;
      // Water runs downhill mostly, with eddies
      if (rng() < 0.2) direction *= -1;
      index = (index + direction + pool.length) % pool.length;
      const voice = rng() < 0.7 ? pizz : harp;
      voice.play(midiToNote(pool[index]), 1.2, time, ctx.vel(0.25 + rng() * 0.2));
    },
  });

  return {
    id: 'river',
    output: base.output,
    base,
    update(next, stage, ramp = 8) {
      rate = next.rate ?? rate;
      base.set({ on: next.on, level: next.level, roleDb: stage?.gainDb ?? 0 }, ramp);
    },
    onChord(chord) {
      pool = pitchesInRange(chord.scaleTones ?? chord.notes, 43, 64);
      index = Math.min(index, Math.max(0, pool.length - 1));
    },
    start() { flow.start(); },
    stop() { flow.stop(); },
    pause() { this.stop(); },
    resume() { this.start(); },
    play(n, d = 1, v = 0.5) { pizz.play(n, d, Tone.now(), v); },
    playChord(notes, d = 1) { pizz.play(notes, d, Tone.now(), 0.4); },
    dispose() {
      this.stop();
      pizz.dispose();
      harp.dispose();
      tone.dispose();
      base.dispose();
    },
  };
}
