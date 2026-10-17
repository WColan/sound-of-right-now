/**
 * Strings — the harmonic bed: the air itself.
 *   violins rise with the sun, violas and celli hold the middle,
 *   brightness follows the light, temperature sets the key (via harmony).
 *
 * Basses — the weight of the air: contrabass + a felt sub tone; a falling
 * barometer adds an uneasy tremor.
 */
import { createSectionBase, createVoice, createPeriodic, nearestPitch, pitchesInRange, midiToNote, rampParam, dbToGain } from '../toolkit.js';
import { lerp } from '../../../now/util.js';

const RANGES = {
  violins: [67, 86],
  violas: [55, 72],
  celli: [40, 57],
};

function stringFallback(Tone) {
  return () => new Tone.PolySynth(Tone.Synth, {
    oscillator: { type: 'fatsawtooth', count: 3, spread: 18 },
    envelope: { attack: 1.4, decay: 0.5, sustain: 0.8, release: 3 },
  });
}

/** Choose `count` chord pitches in range, each as close as possible to the previous voicing. */
export function voicePart(chordTones, range, previous = [], count = 2) {
  const options = pitchesInRange(chordTones, range[0], range[1]);
  if (!options.length) return [];
  const centre = previous.length ? previous.reduce((a, b) => a + b, 0) / previous.length : (range[0] + range[1]) / 2;
  const chosen = [];
  const pool = [...options].sort((a, b) => Math.abs(a - centre) - Math.abs(b - centre));
  for (const m of pool) {
    if (chosen.length >= count) break;
    // keep at least a minor third between voices of one section
    if (chosen.every((c) => Math.abs(c - m) >= 3)) chosen.push(m);
  }
  return chosen.sort((a, b) => a - b);
}

export function createStringsSection(ctx) {
  const { Tone } = ctx;
  const base = createSectionBase(ctx, 'strings', { trimDb: -4 });
  const filter = new Tone.Filter({ frequency: 4000, type: 'lowpass', rolloff: -12 });
  filter.connect(base.output);

  const parts = {
    violins: createVoice(ctx, { sample: 'violins', fallback: stringFallback(Tone), volume: -6, fallbackVolume: -22, attack: 0.7, release: 2.5 }),
    violas: createVoice(ctx, { sample: 'violas', fallback: stringFallback(Tone), volume: -5, fallbackVolume: -22, attack: 0.7, release: 2.5 }),
    celli: createVoice(ctx, { sample: 'celli', fallback: stringFallback(Tone), volume: -5, fallbackVolume: -22, attack: 0.8, release: 2.8 }),
  };
  const partGain = {
    violins: new Tone.Gain(0.6),
    violas: new Tone.Gain(0.9),
    celli: new Tone.Gain(1),
  };
  for (const name of Object.keys(parts)) {
    parts[name].output.connect(partGain[name]);
    partGain[name].connect(filter);
  }

  const voicing = { violins: [], violas: [], celli: [] };
  const rng = ctx.rng ?? Math.random;

  function articulate(name, time, velocity) {
    const notes = voicing[name];
    if (!notes.length || !base.audible) return;
    notes.forEach((m, i) => {
      parts[name].play(midiToNote(m), 6.5, time + i * 0.08 + rng() * 0.25, ctx.vel(velocity));
    });
  }

  // Each part re-bows on its own slightly irregular breath so the bed never
  // pulses in lockstep.
  const breaths = Object.keys(parts).map((name, i) => createPeriodic(ctx, {
    interval: () => 4.2 + i * 0.6 + rng() * 1.6,
    fire: (time) => articulate(name, time, 0.38 + rng() * 0.12),
  }));

  return {
    id: 'strings',
    output: base.output,
    base,
    update(params, stage, ramp = 8) {
      base.set({ on: params.on, level: params.level, roleDb: stage?.gainDb ?? 0 }, ramp);
      rampParam(filter.frequency, lerp(1300, 9500, params.brightness ?? 0.5), ramp * 2);
      rampParam(partGain.violins.gain, dbToGain(lerp(-14, 0, params.violins ?? 0.5)), ramp * 2);
    },
    onChord(chord, { first } = {}) {
      const tones = chord.chordTones ?? chord.notes;
      voicing.celli = [nearestPitch([chord.bassNote ?? chord.notes[0]], voicing.celli[0] ?? 45), ...voicePart(tones, [48, 57], voicing.celli.slice(1), 1)];
      voicing.violas = voicePart(tones, RANGES.violas, voicing.violas, 2);
      voicing.violins = voicePart(tones, RANGES.violins, voicing.violins, 2);
      const now = Tone.now();
      for (const name of Object.keys(parts)) articulate(name, now + (first ? 0 : 0.05), 0.55);
    },
    start() { breaths.forEach((b) => b.start()); },
    stop() {
      breaths.forEach((b) => b.stop());
      Object.values(parts).forEach((p) => p.releaseAll());
    },
    pause() { this.stop(); },
    resume() {
      this.start();
      const now = Tone.now();
      Object.keys(parts).forEach((name) => articulate(name, now, 0.5));
    },
    play(note, duration = 4, velocity = 0.6) { parts.violas.play(note, duration, Tone.now(), velocity); },
    playChord(notes, duration = 6) { parts.violas.play(notes, duration, Tone.now(), 0.55); },
    dispose() {
      this.stop();
      Object.values(parts).forEach((p) => p.dispose());
      Object.values(partGain).forEach((g) => g.dispose());
      filter.dispose();
      base.dispose();
    },
  };
}

export function createBassesSection(ctx) {
  const { Tone } = ctx;
  const base = createSectionBase(ctx, 'basses', { trimDb: -5 });
  const tremolo = new Tone.Tremolo({ frequency: 0.35, depth: 0, wet: 1 }).start();
  tremolo.connect(base.output);

  const bass = createVoice(ctx, {
    sample: 'basses',
    volume: -4,
    attack: 0.9,
    release: 3,
    fallback: () => new Tone.PolySynth(Tone.Synth, {
      oscillator: { type: 'fatsawtooth', count: 2, spread: 10 },
      envelope: { attack: 1.2, decay: 0.3, sustain: 0.9, release: 3 },
    }),
    fallbackVolume: -20,
  });
  bass.output.connect(tremolo);

  // The felt layer: a pure sine an octave below
  const sub = new Tone.Synth({ oscillator: { type: 'sine' }, envelope: { attack: 3, decay: 0, sustain: 1, release: 4 }, volume: -12 });
  const subGain = new Tone.Gain(0.4);
  sub.connect(subGain);
  subGain.connect(tremolo);

  let note = null;
  let subNote = null;
  const rng = ctx.rng ?? Math.random;
  const breath = createPeriodic(ctx, {
    interval: () => 5.5 + rng() * 2,
    fire: (time) => { if (note && base.audible) bass.play(midiToNote(note), 7, time, ctx.vel(0.42)); },
  });

  return {
    id: 'basses',
    output: base.output,
    base,
    update(params, stage, ramp = 8) {
      base.set({ on: params.on, level: params.level, roleDb: stage?.gainDb ?? 0 }, ramp);
      rampParam(subGain.gain, lerp(0.15, 0.7, params.depth ?? 0.5), ramp * 2);
      rampParam(tremolo.depth, (params.tremor ?? 0) * 0.55, ramp * 2);
      rampParam(tremolo.frequency, 0.25 + (params.tremor ?? 0) * 0.6, ramp * 2);
    },
    onChord(chord) {
      const target = chord.bassNote ?? chord.notes[0];
      note = nearestPitch([target], note ?? 36);
      if (note > 43) note -= 12;
      if (note < 28) note += 12;
      bass.play(midiToNote(note), 7, Tone.now() + 0.02, ctx.vel(0.55));
      const nextSub = note - 12;
      if (subNote == null) sub.triggerAttack(midiToNote(nextSub));
      else if (nextSub !== subNote) sub.setNote?.(midiToNote(nextSub));
      subNote = nextSub;
    },
    start() { breath.start(); },
    stop() {
      breath.stop();
      bass.releaseAll();
      sub.triggerRelease();
      subNote = null;
    },
    pause() { this.stop(); },
    resume() {
      this.start();
      if (note != null) {
        bass.play(midiToNote(note), 7, Tone.now(), 0.5);
        subNote = note - 12;
        sub.triggerAttack(midiToNote(subNote));
      }
    },
    play(n, duration = 4, velocity = 0.6) { bass.play(n, duration, Tone.now(), velocity); },
    playChord(notes, duration = 6) { bass.play(notes.slice(0, 1), duration, Tone.now(), 0.6); },
    dispose() {
      this.stop();
      bass.dispose();
      sub.dispose();
      subGain.dispose();
      tremolo.dispose();
      base.dispose();
    },
  };
}
