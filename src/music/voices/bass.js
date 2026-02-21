import * as Tone from 'tone';

/**
 * Bass voice — deep drone, the grounding layer.
 *
 * Uses MonoSynth with heavy lowpass filtering.
 * A slow LFO modulates the filter via an additive gain node.
 * Portamento smooths note transitions when the key changes.
 */
export function createBassVoice() {
  const filter = new Tone.Filter({
    frequency: 400,
    type: 'lowpass',
    rolloff: -24,
  });

  // LFO modulates filter via a separate signal path
  // so we can still rampTo on filter.frequency directly
  const lfoGain = new Tone.Gain(0).connect(filter.frequency);
  const lfo = new Tone.LFO({
    frequency: 0.05,
    min: -100,
    max: 100,
  });
  lfo.connect(lfoGain);

  const synth = new Tone.MonoSynth({
    oscillator: { type: 'sawtooth' },
    envelope: {
      attack: 3,
      decay: 1,
      sustain: 0.9,
      release: 4,
    },
    filterEnvelope: {
      attack: 2,
      decay: 1,
      sustain: 0.5,
      release: 3,
      baseFrequency: 80,
      octaves: 1.5,
    },
    portamento: 2,
  });

  synth.volume.value = -14;
  synth.connect(filter);

  let currentNote = null;
  let walkingSequence = null;

  return {
    synth,
    filter,
    lfo,
    output: filter,

    enableWalking(chordTones, scaleTones) {
      this.disableWalking();
      if (!chordTones || chordTones.length === 0) return;
      const root = chordTones[0];
      const fifth = chordTones[2] ?? chordTones[1];
      const passing = scaleTones[Math.floor(scaleTones.length * 0.4)] ?? chordTones[1];
      const approach = scaleTones[1] ?? chordTones[0];
      const pattern = [root, fifth, passing, approach];
      walkingSequence = new Tone.Sequence((time, note) => {
        if (note) synth.triggerAttackRelease(note, '8n', time, 0.7);
      }, pattern, '4n');
      walkingSequence.start(0);
      synth.set({ portamento: 0.05 });
    },

    disableWalking() {
      if (walkingSequence) {
        walkingSequence.stop();
        walkingSequence.dispose();
        walkingSequence = null;
      }
      synth.set({ portamento: 2 });
    },

    playNote(note) {
      // Stop first if already playing to avoid "start time must be strictly
      // greater than previous start time" errors on the LFO oscillator
      if (currentNote) {
        synth.triggerRelease();
        lfo.stop();
      }
      currentNote = note;
      const t = Tone.now() + 0.01; // Tiny offset ensures strictly increasing time
      lfo.start(t);
      synth.triggerAttack(note, t, 0.6);
    },

    changeNote(note) {
      if (note === currentNote) return;
      currentNote = note;
      synth.setNote(note);
    },

    setVolume(db, rampTime = 5) {
      synth.volume.rampTo(db, rampTime);
    },

    setFilterCutoff(freq, rampTime = 15) {
      // Use linearRampTo to avoid issues with exponential ramps near zero
      filter.frequency.linearRampTo(freq, rampTime);
    },

    setLFO(rate, depth) {
      if (rate != null) lfo.frequency.linearRampTo(rate, 10);
      if (depth != null) {
        const range = depth * 200;
        lfo.min = -range;
        lfo.max = range;
      }
    },

    stop() {
      if (currentNote) {
        synth.triggerRelease();
        currentNote = null;
      }
      lfo.stop();
    },

    dispose() {
      this.disableWalking();
      this.stop();
      synth.dispose();
      filter.dispose();
      lfo.dispose();
      lfoGain.dispose();
    },
  };
}
