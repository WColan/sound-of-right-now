/**
 * Winds — wind is breath. Flutes and clarinets swell on each gust from the
 * side the wind blows; the air itself rushes beneath them, and wind chimes
 * ring when there's enough breeze to move them.
 *
 * When featured, the flute carries the wind motif: a rising fourth that
 * settles a step — the shape of a gust.
 */
import { createSectionBase, createVoice, createStochastic, pitchesInRange, midiToNote, rampParam, pick, nearestPitch } from '../toolkit.js';
import { createSpatialNode } from '../../spatial.js';
import { createWindChimeVoice } from '../../voices/windchime.js';
import { lerp } from '../../../now/util.js';

export function createWindsSection(ctx) {
  const { Tone } = ctx;
  const rng = ctx.rng ?? Math.random;
  const base = createSectionBase(ctx, 'winds', { trimDb: -6 });
  const spatial = createSpatialNode(Tone, { pan: 0, z: -0.8 });
  spatial.node.connect(base.output);

  const flute = createVoice(ctx, {
    sample: 'flute', volume: -6, attack: 0.5, release: 1.6,
    fallback: () => new Tone.PolySynth(Tone.Synth, { oscillator: { type: 'sine' }, envelope: { attack: 0.6, decay: 0.2, sustain: 0.8, release: 1.5 } }),
    fallbackVolume: -20,
  });
  const clarinet = createVoice(ctx, { sample: 'clarinet', volume: -8, attack: 0.6, release: 1.6 });
  flute.output.connect(spatial.node);
  clarinet.output.connect(spatial.node);

  // The air rushing: pink noise through a slowly wandering band-pass
  const air = new Tone.Noise({ type: 'pink', volume: -30 });
  const airFilter = new Tone.AutoFilter({ frequency: 0.07, depth: 0.7, baseFrequency: 300, octaves: 3.5, wet: 1 }).start();
  const airGain = new Tone.Gain(0);
  air.connect(airFilter);
  airFilter.connect(airGain);
  airGain.connect(spatial.node);

  const chimes = createWindChimeVoice();
  const chimeGain = new Tone.Gain(0.55);
  chimes.output.connect(chimeGain);
  chimeGain.connect(base.output);

  let params = { speed: 0, gustiness: 0, chimes: false, on: false };
  let scaleTones = [];
  let chordTones = [];
  let role = 'bed';
  let lastTop = 76;

  function gust(time) {
    if (!base.audible || !chordTones.length) return;
    const strength = Math.min(1, params.speed * 0.6 + params.gustiness * 0.6 + rng() * 0.2);
    const dur = lerp(2.5, 5.5, rng());
    const fluteNote = pick(pitchesInRange(chordTones, 69, 86), rng);
    if (fluteNote) flute.play(midiToNote(fluteNote), dur, time, ctx.vel(0.3 + strength * 0.4));
    if (rng() < 0.55) {
      const clar = pick(pitchesInRange(chordTones, 55, 69), rng);
      if (clar) clarinet.play(midiToNote(clar), dur * 1.1, time + 0.3, ctx.vel(0.25 + strength * 0.3));
    }
    // A gust lifts the rushing air too
    airGain.gain.cancelScheduledValues?.(time);
    airGain.gain.linearRampToValueAtTime?.(0.25 + params.speed * 0.75, time + dur * 0.4);
    airGain.gain.linearRampToValueAtTime?.(0.1 + params.speed * 0.5, time + dur);
  }

  /** The wind motif: rise a fourth, settle down a step. */
  function motif(time = Tone.now()) {
    if (!scaleTones.length) return;
    const start = nearestPitch(chordTones.length ? chordTones : scaleTones, lastTop);
    const fourth = nearestPitch(scaleTones, start + 5);
    const settle = pitchesInRange(scaleTones, fourth - 3, fourth - 1).at(-1) ?? fourth - 2;
    const v = ctx.vel(0.55);
    flute.play(midiToNote(start), 0.9, time, v);
    flute.play(midiToNote(fourth), 1.6, time + 0.85, v * 1.1);
    flute.play(midiToNote(settle), 2.8, time + 2.3, v * 0.9);
    lastTop = settle;
  }

  const gusts = createStochastic(ctx, {
    // ~1/min in a breeze, ~7/min in a gale; gusty air more often
    rate: () => (params.on ? (1 + params.speed * 5 + params.gustiness * 3) / 60 * (1 - ctx.expr.stillness * 0.8) : 0),
    fire: gust,
    minGap: 1.5,
  });
  const phrases = createStochastic(ctx, {
    rate: () => (params.on && role === 'foreground' ? (0.6 + ctx.expr.urgency) / 60 : 0),
    fire: motif,
    minGap: 20,
  });

  return {
    id: 'winds',
    output: base.output,
    base,
    update(next, stage, ramp = 6) {
      params = { ...params, ...next };
      role = stage?.role ?? 'bed';
      base.set({ on: next.on, level: next.level, roleDb: stage?.gainDb ?? 0 }, ramp);
      spatial.setPan(next.pan ?? 0, ramp);
      rampParam(airGain.gain, next.on ? 0.1 + (next.speed ?? 0) * 0.5 : 0, ramp);
      rampParam(airFilter.frequency, 0.05 + (next.speed ?? 0) * 0.35, ramp);
      if (next.on && air.state !== 'started') air.start();
      chimes.setWindSpeed(lerp(0, 50, next.speed ?? 0));
      chimes.setActive(Boolean(next.on && next.chimes));
    },
    setHumidity(decayMod) { chimes.setDecayMod(decayMod); },
    onChord(chord) {
      scaleTones = chord.scaleTones ?? chord.notes;
      chordTones = chord.chordTones ?? chord.notes;
      chimes.setNotes(scaleTones, chordTones);
    },
    start() {
      gusts.start();
      phrases.start();
    },
    stop() {
      gusts.stop();
      phrases.stop();
      chimes.setActive(false);
      if (air.state === 'started') air.stop();
      flute.releaseAll();
      clarinet.releaseAll();
    },
    pause() { this.stop(); },
    resume() {
      this.start();
      if (params.on) {
        air.start();
        chimes.setActive(Boolean(params.chimes));
      }
    },
    motif,
    play(n, d = 2, v = 0.6) { flute.play(n, d, Tone.now(), v); },
    playChord(notes, d = 3) { clarinet.play(notes, d, Tone.now(), 0.5); },
    dispose() {
      this.stop();
      flute.dispose();
      clarinet.dispose();
      air.dispose();
      airFilter.dispose();
      airGain.dispose();
      chimes.dispose();
      chimeGain.dispose();
      spatial.node.dispose();
      base.dispose();
    },
  };
}
