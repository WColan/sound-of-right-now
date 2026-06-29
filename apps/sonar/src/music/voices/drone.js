import * as Tone from 'tone';
import { noteToMidi, midiToNote } from '../scale.js';

/**
 * Drone voice — barely-audible root + fifth sine tones, the deepest grounding layer.
 *
 * Two pure sine oscillators at octave 1: the root and the fifth (+7 semitones).
 * Very long envelopes and heavy lowpass filtering create a sub-bass presence
 * that's felt more than heard. Always on, providing a constant foundation
 * regardless of weather. Volume varies by pressure but never fully silent.
 *
 * The fifth is slightly quieter than the root for a stable, non-beating drone.
 */
export function createDroneVoice() {
  const filter = new Tone.Filter({
    frequency: 200,
    type: 'lowpass',
    rolloff: -24,
  });

  // Root drone — pure sine at octave 1
  const rootSynth = new Tone.Synth({
    oscillator: { type: 'sine' },
    envelope: {
      attack: 8,
      decay: 2,
      sustain: 0.95,
      release: 10,
    },
  });

  // Fifth drone — pure sine, slightly quieter
  const fifthSynth = new Tone.Synth({
    oscillator: { type: 'sine' },
    envelope: {
      attack: 8,
      decay: 2,
      sustain: 0.95,
      release: 10,
    },
  });

  rootSynth.volume.value = -30;
  fifthSynth.volume.value = -34; // 4dB quieter than root

  rootSynth.connect(filter);
  fifthSynth.connect(filter);

  let currentRootNote = null;
  let currentFifthNote = null;

  /**
   * Get the fifth note name from a root note name (without octave).
   * Always places at octave 1.
   */
  function getRootAndFifth(rootName) {
    const rootMidi = noteToMidi(`${rootName}1`);
    const fifthMidi = rootMidi + 7; // Perfect fifth
    return {
      root: `${rootName}1`,
      fifth: midiToNote(fifthMidi),
    };
  }

  return {
    rootSynth,
    fifthSynth,
    filter,
    output: filter,

    /**
     * Start the drone on a given root note.
     * @param {string} rootName - Note name without octave (e.g. 'D')
     */
    playNote(rootName) {
      // Release first if already playing to avoid start-time collisions
      if (currentRootNote) {
        rootSynth.triggerRelease();
        fifthSynth.triggerRelease();
      }
      const { root, fifth } = getRootAndFifth(rootName);
      currentRootNote = root;
      currentFifthNote = fifth;

      const t = Tone.now() + 0.01; // Tiny offset ensures strictly increasing time
      rootSynth.triggerAttack(root, t, 0.5);
      fifthSynth.triggerAttack(fifth, t, 0.4);
    },

    /**
     * Smoothly transition to a new root.
     * Uses Tone.js setNote for portamento-like effect with the long envelopes.
     * @param {string} rootName - Note name without octave (e.g. 'D')
     */
    changeNote(rootName) {
      const { root, fifth } = getRootAndFifth(rootName);
      if (root === currentRootNote) return;

      currentRootNote = root;
      currentFifthNote = fifth;

      // For Synth (not MonoSynth), we release and re-attack
      // The 8s attack envelope creates a smooth crossfade
      rootSynth.triggerRelease();
      fifthSynth.triggerRelease();

      // Slight delay to let the release begin, then start new notes
      const now = Tone.now();
      rootSynth.triggerAttack(root, now + 0.5, 0.5);
      fifthSynth.triggerAttack(fifth, now + 0.5, 0.4);
    },

    setVolume(db, rampTime = 8) {
      rootSynth.volume.rampTo(db, rampTime);
      fifthSynth.volume.rampTo(db - 4, rampTime); // Fifth always 4dB quieter
    },

    setFilterCutoff(freq, rampTime = 10) {
      filter.frequency.linearRampTo(freq, rampTime);
    },

    stop() {
      rootSynth.triggerRelease();
      fifthSynth.triggerRelease();
      currentRootNote = null;
      currentFifthNote = null;
    },

    dispose() {
      this.stop();
      rootSynth.dispose();
      fifthSynth.dispose();
      filter.dispose();
    },
  };
}
