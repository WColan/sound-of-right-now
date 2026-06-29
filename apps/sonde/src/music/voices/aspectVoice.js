/**
 * Aspect voice — the events that punctuate SONDE's drone field.
 *
 * When two planets reach a major alignment (conjunction, sextile, square,
 * trine, opposition) a bell blooms. Consonant aspects ring an open, harmonic
 * chord; tense aspects (square/opposition) ring a sharper, clustered one. This
 * is SONDE's analog to SONAR's chord changes — but triggered by the real
 * geometry of the sky rather than by a progression engine.
 */
import { dbToGain } from '../audio-bus.js';

export function createAspectVoice(Tone, { baseFreq = 523.25 } = {}) {
  const out = new Tone.Gain(dbToGain(-12));
  const bell = new Tone.PolySynth(Tone.FMSynth, {
    harmonicity: 3.01,
    modulationIndex: 14,
    oscillator: { type: 'sine' },
    envelope: { attack: 0.01, decay: 1.6, sustain: 0, release: 2.2 },
    modulation: { type: 'sine' },
    modulationEnvelope: { attack: 0.01, decay: 0.4, sustain: 0, release: 0.6 },
  }).connect(out);
  bell.maxPolyphony = 16;

  return {
    output: out,

    setVolume(db, ramp = 1) {
      out.gain.rampTo(dbToGain(db), ramp);
    },

    /** Ring a bell for a detected aspect. */
    trigger(aspect, time) {
      const consonant = aspect.harmony !== 'tense';
      const freqs = consonant
        ? [baseFreq, baseFreq * (3 / 2), baseFreq * 2]            // open: root–fifth–octave
        : [baseFreq, baseFreq * (45 / 32), baseFreq * (16 / 15)]; // tense: root–tritone–minor 2nd
      const velocity = 0.25 + 0.55 * (aspect.strength ?? 0.5);
      bell.triggerAttackRelease(freqs, consonant ? 2.4 : 1.6, time, velocity);
    },

    dispose() {
      bell.dispose?.();
      out.dispose?.();
    },
  };
}
