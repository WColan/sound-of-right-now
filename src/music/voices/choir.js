import * as Tone from 'tone';

/**
 * Choir voice — formant-filtered sustained chords, the 9th voice.
 *
 * Uses a sawtooth oscillator (rich harmonics) fed through 3 parallel bandpass
 * filters tuned to vowel formant frequencies (F1, F2, F3). The source is split
 * to all 3 filters and their outputs are summed — classic subtractive formant
 * synthesis mimicking the resonant cavities of the human vocal tract.
 *
 * A slow vowel drift picks mood-appropriate vowel shapes every 15–35s and
 * smoothly ramps the formant filter frequencies, creating an organic
 * "morphing choir" effect.
 *
 * Like the pad voice, uses a dual-synth A/B crossfade for seamless chord
 * transitions — the idle synth starts the new chord while the active synth
 * fades out.
 */
export function createChoirVoice() {
  // ── Formant definitions (Hz) ──
  // Each vowel is defined by 3 formant frequencies that shape the spectral peak
  // pattern. These approximate male choral formants in a lower register.
  const VOWELS = {
    aah: [800, 1150, 2900],   // Open, warm — like "father"
    eeh: [400, 1600, 2700],   // Bright, forward — like "see"
    ooh: [450, 800, 2830],    // Round, gentle — like "who"
    uuu: [325, 700, 2530],    // Dark, closed — like "you"
  };

  // Mood → vowel pool mapping. The drift interval picks randomly from these.
  const MOOD_VOWELS = {
    calm:       ['ooh', 'aah'],
    gentle:     ['ooh', 'eeh'],
    melancholy: ['uuu', 'ooh'],
    tense:      ['eeh', 'aah'],
    suspended:  ['uuu', 'ooh'],
    sparse:     ['uuu'],
  };

  // ── Filter bank — 3 parallel bandpass filters ──
  // Q of 5–8 gives narrow-enough peaks for vowel character without ringing.
  const formantFilters = [
    new Tone.Filter({ frequency: 450, type: 'bandpass', Q: 6 }),
    new Tone.Filter({ frequency: 800, type: 'bandpass', Q: 6 }),
    new Tone.Filter({ frequency: 2830, type: 'bandpass', Q: 5 }),
  ];

  // Summing gain for the 3 formant filter outputs
  const formantSum = new Tone.Gain(1);
  formantFilters.forEach(f => f.connect(formantSum));

  // Formant filtering is very subtractive; add makeup gain so the choir
  // can sit in the mix without needing extreme synth volume values.
  const formantMakeup = new Tone.Gain(1.5);
  formantSum.connect(formantMakeup);

  // Master output filter (lowpass) — overall brightness control
  const outputFilter = new Tone.Filter({
    frequency: 4000,
    type: 'lowpass',
    rolloff: -12,
  });
  formantMakeup.connect(outputFilter);

  // ── Synth configuration — sawtooth for harmonic richness ──
  const synthOptions = {
    maxPolyphony: 4,
    options: {
      oscillator: {
        type: 'sawtooth',
      },
      envelope: {
        attack: 4,
        decay: 2,
        sustain: 0.7,
        release: 10,
      },
    },
  };

  // Two synths for crossfading (same pattern as pad voice)
  const synthA = new Tone.PolySynth(Tone.Synth, synthOptions);
  const synthB = new Tone.PolySynth(Tone.Synth, synthOptions);

  // Individual gain nodes for crossfade control
  const gainA = new Tone.Gain(0);
  const gainB = new Tone.Gain(0);

  // Route both synths through the formant filter bank
  synthA.connect(gainA);
  synthB.connect(gainB);
  // Connect both gains to each formant filter (parallel split)
  formantFilters.forEach(f => {
    gainA.connect(f);
    gainB.connect(f);
  });

  // Start with synth A as the "active" layer
  let activeSynth = synthA;
  let activeGain = gainA;
  let idleSynth = synthB;
  let idleGain = gainB;
  let currentNotes = [];
  let currentMood = 'calm';
  let currentVowel = 'ooh';
  let crossfadeTimeout = null;

  // Master volume applied to both
  const masterVolume = -20;
  synthA.volume.value = masterVolume;
  synthB.volume.value = masterVolume;

  const CROSSFADE_TIME = 4; // seconds — slower than pad for smoother transitions

  function swap() {
    const tmpS = activeSynth;
    const tmpG = activeGain;
    activeSynth = idleSynth;
    activeGain = idleGain;
    idleSynth = tmpS;
    idleGain = tmpG;
  }

  /**
   * Drop notes one octave for choir range (octave 2-3).
   * Input notes like "C4" become "C3", "E3" stays "E3" if already low.
   */
  function dropOctave(notes) {
    return notes.map(note => {
      const match = note.match(/^([A-G]#?)(\d+)$/);
      if (!match) return note;
      const [, pitch, octStr] = match;
      const oct = parseInt(octStr, 10);
      return oct > 3 ? `${pitch}${oct - 1}` : note;
    });
  }

  // ── Vowel drift interval ──
  let driftInterval = null;

  function scheduleDrift() {
    driftInterval = setTimeout(() => {
      const pool = MOOD_VOWELS[currentMood] || MOOD_VOWELS.calm;
      // Pick a different vowel from the pool
      const candidates = pool.filter(v => v !== currentVowel);
      const nextVowel = candidates.length > 0
        ? candidates[Math.floor(Math.random() * candidates.length)]
        : pool[0];
      applyVowel(nextVowel, 10); // 10s ramp
      scheduleDrift(); // re-schedule with fresh random delay
    }, 15000 + Math.random() * 20000); // 15–35s, re-randomized each tick
  }

  function startDrift() {
    if (driftInterval) return;
    scheduleDrift();
  }

  function stopDrift() {
    if (driftInterval) {
      clearTimeout(driftInterval);
      driftInterval = null;
    }
  }

  /**
   * Ramp formant filters to a new vowel shape.
   * @param {string} vowel - One of 'aah', 'eeh', 'ooh', 'uuu'
   * @param {number} rampTime - Seconds for the frequency ramp
   */
  function applyVowel(vowel, rampTime = 8) {
    const freqs = VOWELS[vowel] || VOWELS.ooh;
    currentVowel = vowel;
    formantFilters[0].frequency.rampTo(freqs[0], rampTime);
    formantFilters[1].frequency.rampTo(freqs[1], rampTime);
    formantFilters[2].frequency.rampTo(freqs[2], rampTime);
  }

  function clearCrossfadeTimeout() {
    if (crossfadeTimeout) {
      clearTimeout(crossfadeTimeout);
      crossfadeTimeout = null;
    }
  }

  /**
   * Start playing a chord (initial play — no crossfade needed).
   * Notes are automatically dropped one octave.
   * @param {string[]} notes
   */
  function playChord(notes) {
    const lowNotes = dropOctave(notes);
    const now = Tone.now();
    clearCrossfadeTimeout();
    // Silence everything first
    synthA.releaseAll();
    synthB.releaseAll();
    gainA.gain.cancelScheduledValues(now);
    gainB.gain.cancelScheduledValues(now);
    gainA.gain.value = 0;
    gainB.gain.value = 0;

    currentNotes = lowNotes;

    if (lowNotes.length > 0) {
      activeSynth.triggerAttack(lowNotes, now, 0.3);
      activeGain.gain.setValueAtTime(0, now);
      activeGain.gain.linearRampTo(1, CROSSFADE_TIME);
    }

    startDrift();
  }

  /**
   * Crossfade to a new chord. Notes are automatically dropped one octave.
   */
  function changeChord(notes) {
    const lowNotes = dropOctave(notes);
    if (lowNotes.length === 0) return;

    const now = Tone.now();
    currentNotes = lowNotes;

    // Start new chord on the idle synth
    idleSynth.triggerAttack(lowNotes, now, 0.3);

    // Crossfade: idle fades in, active fades out
    idleGain.gain.cancelScheduledValues(now);
    activeGain.gain.cancelScheduledValues(now);

    idleGain.gain.setValueAtTime(idleGain.gain.value, now);
    activeGain.gain.setValueAtTime(activeGain.gain.value, now);

    idleGain.gain.linearRampTo(1, CROSSFADE_TIME);
    activeGain.gain.linearRampTo(0, CROSSFADE_TIME);

    // Release the old chord after the fade completes
    const oldSynth = activeSynth;
    clearCrossfadeTimeout();
    crossfadeTimeout = setTimeout(() => {
      oldSynth.releaseAll();
      crossfadeTimeout = null;
    }, CROSSFADE_TIME * 1000 + 500);

    // Swap roles
    swap();
  }

  return {
    synthA,
    synthB,
    formantFilters,
    output: outputFilter,

    playChord,
    changeChord,

    /** Set the mood — affects vowel drift pool */
    setMood(mood) {
      currentMood = mood;
    },

    /** Manually set a vowel shape */
    setVowel(vowel) {
      applyVowel(vowel, 8);
    },

    /** Set the master filter cutoff (overall brightness) */
    setFilterCutoff(freq, rampTime = 10) {
      outputFilter.frequency.linearRampTo(freq, rampTime);
    },

    /** Set volume in dB */
    setVolume(db, rampTime = 5) {
      synthA.volume.rampTo(db, rampTime);
      synthB.volume.rampTo(db, rampTime);
    },

    /**
     * Set formant filter Q values — higher Q = more resonant, singing quality.
     * Used by aurora shimmer to boost resonance during northern lights.
     * @param {number} q - Filter Q value (default ~5–8, aurora boost up to 12)
     */
    setFormantQ(q) {
      formantFilters.forEach(f => {
        f.Q.rampTo(q, 4);
      });
    },

    /**
     * Apply a weather timbre profile.
     * warm   — Richer harmonics, wider envelope
     * cool   — Standard sawtooth, moderate settings
     * cold   — Thinner harmonics, slow fade
     * stormy — Harsh, short attack, wide
     */
    setTimbreProfile(profile) {
      const profiles = {
        warm:   { attack: 5, release: 12 },
        cool:   { attack: 4, release: 10 },
        cold:   { attack: 6, release: 14 },
        stormy: { attack: 2, release: 6 },
      };
      const p = profiles[profile] || profiles.cool;
      const opts = { envelope: { attack: p.attack, release: p.release } };
      synthA.set(opts);
      synthB.set(opts);
    },

    /**
     * Apply a seasonal envelope palette.
     * winter  — Very slow, ethereal
     * spring  — Brighter, quicker onset
     * summer  — Full, sustained
     * autumn  — Slightly muted, medium
     */
    setSeasonalPalette(season) {
      const palettes = {
        winter: { attack: 6,   release: 14 },
        spring: { attack: 2.5, release: 8  },
        summer: { attack: 4,   release: 12 },
        autumn: { attack: 3.5, release: 9  },
      };
      const p = palettes[season] || palettes.summer;
      synthA.set({ envelope: { attack: p.attack, release: p.release } });
      synthB.set({ envelope: { attack: p.attack, release: p.release } });
    },

    stop() {
      stopDrift();
      clearCrossfadeTimeout();
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
      formantFilters.forEach(f => f.dispose());
      formantSum.dispose();
      formantMakeup.dispose();
      outputFilter.dispose();
    },
  };
}
