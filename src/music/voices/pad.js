import * as Tone from 'tone';

/**
 * Pad voice — warm sustained chords, the foundation layer.
 *
 * Uses a dual-synth A/B crossfade design for seamless chord transitions:
 * When a new chord arrives, the idle synth starts the new chord while
 * the active synth fades out — creating a true crossfade with zero
 * volume dip.
 *
 * Timbre: Two detuned sine layers per voice create a gentle chorusing
 * effect without the harshness of FM synthesis. A lowpass filter
 * softens everything further.
 */
export function createPadVoice() {
  const filter = new Tone.Filter({
    frequency: 3000,
    type: 'lowpass',
    rolloff: -12,
  });

  // ── Synth configuration — warm, not harsh ──
  const synthOptions = {
    maxPolyphony: 6,
    options: {
      oscillator: {
        type: 'fatsine',  // Multiple detuned sines — warm & chorused
        count: 3,
        spread: 15,       // Subtle detune in cents
      },
      envelope: {
        attack: 3,
        decay: 2,
        sustain: 0.85,
        release: 8,       // Long release for the fading-out layer
      },
    },
  };

  // Two synths for crossfading
  const synthA = new Tone.PolySynth(Tone.Synth, synthOptions);
  const synthB = new Tone.PolySynth(Tone.Synth, synthOptions);

  // Individual gain nodes for crossfade control
  const gainA = new Tone.Gain(0);
  const gainB = new Tone.Gain(0);

  synthA.connect(gainA);
  synthB.connect(gainB);
  gainA.connect(filter);
  gainB.connect(filter);

  // Start with synth A as the "active" layer
  let activeSynth = synthA;
  let activeGain = gainA;
  let idleSynth = synthB;
  let idleGain = gainB;
  let currentNotes = [];

  // Master volume applied to both
  const masterVolume = -14;
  synthA.volume.value = masterVolume;
  synthB.volume.value = masterVolume;

  // Crossfade timing
  const CROSSFADE_TIME = 3; // seconds

  function swap() {
    const tmpS = activeSynth;
    const tmpG = activeGain;
    activeSynth = idleSynth;
    activeGain = idleGain;
    idleSynth = tmpS;
    idleGain = tmpG;
  }

  /**
   * Start playing a chord (initial play — no crossfade needed).
   * @param {string[]} notes
   */
  function playChord(notes) {
    // Silence everything first
    synthA.releaseAll();
    synthB.releaseAll();
    gainA.gain.cancelScheduledValues(Tone.now());
    gainB.gain.cancelScheduledValues(Tone.now());
    gainA.gain.value = 0;
    gainB.gain.value = 0;

    currentNotes = notes;

    if (notes.length > 0) {
      // Fade in the active synth
      activeSynth.triggerAttack(notes, Tone.now(), 0.45);
      activeGain.gain.linearRampTo(1, CROSSFADE_TIME);
    }
  }

  /**
   * Crossfade to a new chord.
   * The idle synth starts the new chord and fades in,
   * while the active synth fades out and releases.
   */
  function changeChord(notes) {
    if (notes.length === 0) return;

    const now = Tone.now();
    currentNotes = notes;

    // Start new chord on the idle synth
    idleSynth.triggerAttack(notes, now, 0.45);

    // Crossfade: idle fades in, active fades out
    idleGain.gain.cancelScheduledValues(now);
    activeGain.gain.cancelScheduledValues(now);

    idleGain.gain.setValueAtTime(idleGain.gain.value, now);
    activeGain.gain.setValueAtTime(activeGain.gain.value, now);

    idleGain.gain.linearRampTo(1, CROSSFADE_TIME);
    activeGain.gain.linearRampTo(0, CROSSFADE_TIME);

    // Release the old chord after the fade completes
    const oldSynth = activeSynth;
    setTimeout(() => {
      oldSynth.releaseAll();
    }, CROSSFADE_TIME * 1000 + 500);

    // Swap roles
    swap();
  }

  return {
    synthA,
    synthB,
    filter,
    output: filter,

    playChord,
    changeChord,

    /** Set the filter cutoff frequency (brightness) */
    setFilterCutoff(freq, rampTime = 10) {
      filter.frequency.linearRampTo(freq, rampTime);
    },

    /** Set volume in dB */
    setVolume(db, rampTime = 5) {
      synthA.volume.rampTo(db, rampTime);
      synthB.volume.rampTo(db, rampTime);
    },

    /**
     * Set the oscillator spread (detune in cents).
     * Higher = more chorus-like warmth. Lower = cleaner.
     */
    setSpread(cents) {
      synthA.set({ oscillator: { spread: cents } });
      synthB.set({ oscillator: { spread: cents } });
    },

    stop() {
      synthA.releaseAll();
      synthB.releaseAll();
      gainA.gain.cancelScheduledValues(Tone.now());
      gainB.gain.cancelScheduledValues(Tone.now());
      gainA.gain.value = 0;
      gainB.gain.value = 0;
      currentNotes = [];
    },

    dispose() {
      this.stop();
      synthA.dispose();
      synthB.dispose();
      gainA.dispose();
      gainB.dispose();
      filter.dispose();
    },
  };
}
