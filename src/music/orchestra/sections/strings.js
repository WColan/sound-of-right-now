/**
 * Strings — the harmonic bed: the air itself.
 *   violins rise with the sun, violas and celli hold the middle,
 *   brightness follows the light, temperature sets the key (via harmony).
 *
 * Basses — the weight of the air: contrabass + a felt sub tone; a falling
 * barometer adds an uneasy tremor.
 */
import { createSectionBase, createVoice, createPeriodic, createStochastic, nearestPitch, pitchesInRange, midiToNote, rampParam, dbToGain } from '../toolkit.js';
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

/**
 * Chord tones for the current air: open fifths when it's thin and cold,
 * full sevenths when it's moderate, added ninths when it's warm and heavy.
 */
export function chordPalette(chord, openness = 0.5) {
  const notes = chord.notes ?? chord.chordTones ?? [];
  if (notes.length < 3) return notes;
  if (openness > 0.6) return [notes[0], notes[2]];               // root + fifth: bare and open
  if (openness > 0.3) return notes;                               // the chord as written
  const scale = chord.scaleTones ?? [];
  const rootIdx = scale.findIndex((n) => n.replace(/\d+$/, '') === notes[0].replace(/\d+$/, ''));
  const ninth = rootIdx >= 0 ? scale[(rootIdx + 1) % scale.length] : null;
  return ninth ? [...notes, ninth] : notes;                       // + the ninth: thick and humid
}

// How each articulation breathes: [min, spread] seconds between re-bows, note length, velocity
const BREATH = {
  legato:  { gap: [4.2, 1.6], dur: 6.5, vel: 0.42 },
  muted:   { gap: [5.0, 2.0], dur: 6.5, vel: 0.34 },
  veil:    { gap: [7.5, 3.0], dur: 8.5, vel: 0.22 },
  pizz:    { gap: [6.5, 2.5], dur: 6.0, vel: 0.22 },
  sparse:  { gap: [8.0, 4.0], dur: 6.0, vel: 0.26 },
  tremolo: { gap: [3.6, 1.2], dur: 5.0, vel: 0.4 },
};

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
  // Alternative gestures for weather: tremolo (storm) and pizzicato (rain)
  const tremolo = createVoice(ctx, { sample: 'violinTrem', volume: -6, attack: 0.4, release: 2 });
  const pizzHigh = createVoice(ctx, { sample: 'violinPizz', volume: -4 });
  const pizzLow = createVoice(ctx, { sample: 'celloPizz', volume: -4 });
  const partGain = {
    violins: new Tone.Gain(0.6),
    violas: new Tone.Gain(0.9),
    celli: new Tone.Gain(1),
  };
  for (const name of Object.keys(parts)) {
    parts[name].output.connect(partGain[name]);
    partGain[name].connect(filter);
  }
  tremolo.output.connect(partGain.violins);
  pizzHigh.output.connect(filter);
  pizzLow.output.connect(filter);

  const voicing = { violins: [], violas: [], celli: [] };
  const rng = ctx.rng ?? Math.random;
  let articulation = 'legato';
  let openness = 0.5;
  let palette = [];
  let lastChord = null;

  function revoice(chord) {
    palette = chordPalette(chord, openness);
    const bass = openness > 0.6 ? chord.notes[0] : (chord.bassNote ?? chord.notes[0]);
    const sparse = articulation === 'sparse' || articulation === 'veil';
    voicing.celli = articulation === 'veil' ? []
      : [nearestPitch([bass], voicing.celli[0] ?? 45), ...(sparse ? [] : voicePart(palette, [48, 57], voicing.celli.slice(1), 1))];
    voicing.violas = sparse ? [] : voicePart(palette, RANGES.violas, voicing.violas, articulation === 'muted' ? 3 : 2);
    voicing.violins = voicePart(palette, articulation === 'veil' ? [79, 91] : RANGES.violins, voicing.violins, sparse ? 1 : 2);
  }

  function articulate(name, time, velocity) {
    const notes = voicing[name];
    if (!notes.length || !base.audible) return;
    const b = BREATH[articulation] ?? BREATH.legato;
    const voice = name === 'violins' && articulation === 'tremolo' ? tremolo : parts[name];
    notes.forEach((m, i) => {
      voice.play(midiToNote(m), b.dur, time + i * 0.12 + rng() * 0.3, ctx.vel(velocity));
    });
  }

  // Each part re-bows on its own slightly irregular breath so the bed never
  // pulses in lockstep.
  const breaths = Object.keys(parts).map((name, i) => createPeriodic(ctx, {
    interval: () => {
      const b = BREATH[articulation] ?? BREATH.legato;
      return b.gap[0] + i * 0.6 + rng() * b.gap[1];
    },
    fire: (time) => {
      const b = BREATH[articulation] ?? BREATH.legato;
      articulate(name, time, b.vel + rng() * 0.1);
    },
  }));

  // Rain: the bed plucks — a slow, irregular walk through the chord
  const plucks = createStochastic(ctx, {
    rate: () => (articulation === 'pizz' && base.audible ? 1.6 * (0.6 + ctx.expr.energy * 0.6) * (1 - ctx.expr.stillness * 0.7) : 0),
    fire: (time) => {
      const low = rng() < 0.35;
      const pool = pitchesInRange(palette, low ? 40 : 60, low ? 55 : 81);
      const n = pool[Math.floor(rng() * pool.length)];
      if (n != null) (low ? pizzLow : pizzHigh).play(midiToNote(n), 1.2, time, ctx.vel(0.28 + rng() * 0.2));
    },
    minGap: 0.12,
  });

  return {
    id: 'strings',
    output: base.output,
    base,
    update(params, stage, ramp = 8) {
      base.set({ on: params.on, level: params.level, roleDb: stage?.gainDb ?? 0 }, ramp);
      rampParam(filter.frequency, lerp(1300, 9500, params.brightness ?? 0.5), ramp * 2);
      rampParam(partGain.violins.gain, dbToGain(lerp(-14, 0, params.violins ?? 0.5)), ramp * 2);
      const changed = (params.articulation && params.articulation !== articulation)
        || (params.openness != null && Math.abs(params.openness - openness) > 0.15);
      articulation = params.articulation ?? articulation;
      openness = params.openness ?? openness;
      if (changed && lastChord) revoice(lastChord);
    },
    onChord(chord, { first } = {}) {
      lastChord = chord;
      revoice(chord);
      // Parts enter one after another, low to high — a chord that blooms, not one that's struck
      const now = Tone.now() + (first ? 0 : 0.05);
      const v = (BREATH[articulation] ?? BREATH.legato).vel + 0.06;
      articulate('celli', now, v);
      articulate('violas', now + 0.6 + rng() * 0.4, v);
      articulate('violins', now + 1.4 + rng() * 0.8, v);
    },
    start() {
      breaths.forEach((b) => b.start());
      plucks.start();
    },
    stop() {
      breaths.forEach((b) => b.stop());
      plucks.stop();
      [...Object.values(parts), tremolo].forEach((p) => p.releaseAll());
    },
    pause() { this.stop(); },
    resume() {
      this.start();
      const now = Tone.now();
      Object.keys(parts).forEach((name, i) => articulate(name, now + i * 0.6, 0.4));
    },
    play(note, duration = 4, velocity = 0.6) { parts.violas.play(note, duration, Tone.now(), velocity); },
    playChord(notes, duration = 6) { parts.violas.play(notes, duration, Tone.now(), 0.55); },
    dispose() {
      this.stop();
      [...Object.values(parts), tremolo, pizzHigh, pizzLow].forEach((p) => p.dispose());
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
      bass.play(midiToNote(note), 7, Tone.now() + 0.02, ctx.vel(0.45));
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
