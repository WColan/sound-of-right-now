import * as Tone from 'tone';

/**
 * Wind chime voice — sparse, stochastic metallic tones that activate with wind.
 *
 * Uses a PolySynth with a sine oscillator and percussive envelope (fast attack,
 * long decay, zero sustain) to simulate the brief metallic ring of chime tubes.
 *
 * Scheduling is recursive via Transport.scheduleOnce: each note schedules the
 * next, with an interval inversely proportional to wind speed. This keeps the
 * chimes transport-synchronized (no clock drift) while remaining irregular.
 *
 * Notes are selected randomly from the upper register of the current scale
 * (octave 5 and 6), which keeps chimes above the harmonic density of pads
 * and arpeggios. Chord tones are preferred at ~65% probability for harmonic
 * consonance — passing tones add color without clashing.
 */
export function createWindChimeVoice() {
  const synth = new Tone.PolySynth(Tone.Synth, {
    oscillator: { type: 'sine' },
    envelope: { attack: 0.005, decay: 1.2, sustain: 0, release: 0.5 },
    volume: -18,
  });

  let scheduledId = null;
  let currentNotes = [];       // All upper-register scale tones (octave 5–6)
  let currentChordNotes = [];  // Subset that are chord tones (preferred)
  let currentWindSpeed = 0;
  let isActive = false;

  /**
   * Interval between strikes in seconds — longer when calm, shorter when gusty.
   * Randomized ±50% around the base to feel natural.
   */
  function getInterval() {
    const base = Math.max(1, 20 - currentWindSpeed * 0.6);
    return base * (0.5 + Math.random());
  }

  /**
   * Pick a note with chord-tone preference. 65% of the time we pull from the
   * chord-tone subset (if available); otherwise from the full scale pool.
   * This mirrors the arpeggio's C/S weighting for harmonic coherence.
   */
  function pickNote() {
    const preferChord = Math.random() < 0.65;
    const pool = (preferChord && currentChordNotes.length > 0)
      ? currentChordNotes
      : currentNotes;
    if (pool.length === 0) return null;
    return pool[Math.floor(Math.random() * pool.length)];
  }

  function scheduleNext() {
    if (!isActive || currentNotes.length === 0) return;
    scheduledId = Tone.Transport.scheduleOnce(time => {
      if (!isActive) return;
      const note = pickNote();
      if (note) synth.triggerAttackRelease(note, '2n', time);
      scheduleNext();
    }, `+${getInterval()}`);
  }

  return {
    /** The Tone.js node to connect to the signal chain. */
    output: synth,

    /**
     * Update the available note pool. Filters both lists to octaves 5–6 to
     * keep chimes above the harmonic bed.
     * @param {string[]} scaleTones  - All scale tones from current chord/scale
     * @param {string[]} [chordTones] - Chord tones for weighted selection (optional)
     */
    setNotes(scaleTones, chordTones = []) {
      currentNotes = scaleTones.filter(n => /[56]$/.test(n));
      currentChordNotes = chordTones.filter(n => /[56]$/.test(n));
    },

    /**
     * Update wind speed — controls strike frequency.
     * @param {number} kmh - Wind speed in km/h
     */
    setWindSpeed(kmh) {
      currentWindSpeed = kmh;
    },

    /**
     * Activate or deactivate the chime. Activation starts the scheduling chain;
     * deactivation clears the pending scheduled event so no ghost notes fire.
     * @param {boolean} active
     */
    setActive(active) {
      if (active === isActive) return;
      isActive = active;
      if (active) {
        scheduleNext();
      } else {
        if (scheduledId !== null) {
          Tone.Transport.clear(scheduledId);
          scheduledId = null;
        }
      }
    },

    dispose() {
      this.setActive(false);
      synth.dispose();
    },
  };
}
