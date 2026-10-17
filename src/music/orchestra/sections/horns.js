/**
 * Horns — brass is gold; the horns belong to the sun.
 *   dawn: a horn call (root → fifth → octave) as the sun clears the horizon
 *   dusk: a slow chorale that sings the light down
 *   day:  distant warm sustained tones, muted by cloud
 */
import { createSectionBase, createVoice, createStochastic, pitchesInRange, midiToNote, nearestPitch } from '../toolkit.js';
import { voicePart } from './strings.js';

export function createHornsSection(ctx) {
  const { Tone } = ctx;
  const rng = ctx.rng ?? Math.random;
  const base = createSectionBase(ctx, 'horns', { trimDb: -7 });
  const tone = new Tone.Filter({ frequency: 3200, type: 'lowpass', rolloff: -12 });
  tone.connect(base.output);
  const horns = createVoice(ctx, {
    sample: 'horns', volume: -4, attack: 0.25, release: 2.2,
    fallback: () => new Tone.PolySynth(Tone.AMSynth, {
      harmonicity: 1, envelope: { attack: 0.5, decay: 0.3, sustain: 0.8, release: 2 },
      modulationEnvelope: { attack: 0.8, decay: 0.2, sustain: 0.6, release: 1.5 },
    }),
    fallbackVolume: -20,
  });
  horns.output.connect(tone);

  let mode = 'off';
  let root = 'C';
  let scaleTones = [];
  let chordTones = [];
  let voicing = [];
  let calledThisDawn = false;

  /** Horn call: root, fifth, octave — the oldest fanfare there is. */
  function motif(time = Tone.now()) {
    const r = nearestPitch([`${root}4`], 58);
    const fifth = r + 7;
    const v = ctx.vel(0.6);
    horns.play(midiToNote(r), 1.1, time, v);
    horns.play(midiToNote(fifth), 1.1, time + 1.0, v * 1.05);
    horns.play(midiToNote(r + 12), 3.4, time + 2.0, v * 1.15);
    if (scaleTones.length) {
      const answer = pitchesInRange(scaleTones, r + 8, r + 11).at(-1);
      if (answer) horns.play(midiToNote(answer), 3, time + 5.5, v * 0.8);
    }
  }

  const calls = createStochastic(ctx, {
    rate: () => (mode === 'dawn' && base.audible ? 1 / 150 : 0),
    fire: (time) => motif(time),
    minGap: 45,
  });

  return {
    id: 'horns',
    output: base.output,
    base,
    update(next, stage, ramp = 8) {
      const prevMode = mode;
      mode = next.on ? next.mode : 'off';
      base.set({ on: next.on, level: next.level, roleDb: stage?.gainDb ?? 0 }, ramp);
      tone.frequency.rampTo?.(2000 + (next.warmth ?? 0) * 2500, ramp);
      // The first moment of dawn always gets its call
      if (mode === 'dawn' && prevMode !== 'dawn' && !calledThisDawn) {
        calledThisDawn = true;
        motif(Tone.now() + 1.5);
      }
      if (mode !== 'dawn') calledThisDawn = false;
    },
    setHarmony({ root: r }) { root = r; },
    onChord(chord) {
      scaleTones = chord.scaleTones ?? chord.notes;
      chordTones = chord.chordTones ?? chord.notes;
      if (!base.audible) return;
      const now = Tone.now() + 0.4;
      if (mode === 'dusk') {
        voicing = voicePart(chordTones, [50, 67], voicing, 3);
        voicing.forEach((m, i) => horns.play(midiToNote(m), 7, now + i * 0.25, ctx.vel(0.42)));
      } else if (mode === 'day' && rng() < 0.45) {
        voicing = voicePart(chordTones, [52, 64], voicing, 2);
        voicing.forEach((m, i) => horns.play(midiToNote(m), 5, now + i * 0.6, ctx.vel(0.3)));
      }
    },
    start() { calls.start(); },
    stop() { calls.stop(); horns.releaseAll(); },
    pause() { this.stop(); },
    resume() { this.start(); },
    motif,
    play(n, d = 2, v = 0.6) { horns.play(n, d, Tone.now(), v); },
    playChord(notes, d = 5) { horns.play(notes, d, Tone.now(), 0.5); },
    dispose() {
      this.stop();
      horns.dispose();
      tone.dispose();
      base.dispose();
    },
  };
}
