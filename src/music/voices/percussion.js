import * as Tone from 'tone';

/**
 * Percussion voice — subtle rhythmic punctuation layer.
 *
 * Not a drum machine — more like occasional tonal clicks, resonant pings,
 * and deep thuds arranged in structured 16-step patterns.
 *
 * Weather-driven pattern categories replace the old probability-based approach:
 * - minimal (clear): barely-there pings, 2-3 hits per measure
 * - pulse (cloudy): gentle on-beat membrane with ghost metal
 * - dripping (rain/drizzle): irregular membrane + metal like water drops
 * - driving (storm): on-beat membrane, offbeat metal, higher velocity
 * - ghost (fog/snow): nearly silent, single ghost hit per measure
 *
 * Each step: { hit: 'membrane'|'metal'|null, v: velocity, p: probability }
 * Probability gives natural variation — same structure, but some hits drop out.
 */

// ── 16-step pattern templates ──
// Each step runs at '16n' resolution (16 steps per measure)
const PERCUSSION_PATTERNS = {
  minimal: [
    [
      { hit: 'membrane', v: 0.15, p: 0.6 }, null, null, null,
      null, null, null, null,
      null, null, { hit: 'metal', v: 0.08, p: 0.3 }, null,
      null, null, null, null,
    ],
    [
      null, null, null, null,
      { hit: 'metal', v: 0.1, p: 0.4 }, null, null, null,
      null, null, null, null,
      null, null, { hit: 'membrane', v: 0.12, p: 0.5 }, null,
    ],
    [
      { hit: 'membrane', v: 0.12, p: 0.5 }, null, null, null,
      null, null, null, { hit: 'metal', v: 0.06, p: 0.25 },
      null, null, null, null,
      null, null, null, null,
    ],
  ],

  pulse: [
    [
      { hit: 'membrane', v: 0.25, p: 0.8 }, null, null, null,
      { hit: 'metal', v: 0.08, p: 0.3 }, null, null, null,
      { hit: 'membrane', v: 0.18, p: 0.6 }, null, null, null,
      { hit: 'metal', v: 0.06, p: 0.25 }, null, null, null,
    ],
    [
      { hit: 'membrane', v: 0.22, p: 0.75 }, null, null, null,
      null, null, { hit: 'metal', v: 0.07, p: 0.3 }, null,
      { hit: 'membrane', v: 0.15, p: 0.5 }, null, null, null,
      null, null, null, null,
    ],
    [
      { hit: 'membrane', v: 0.2, p: 0.7 }, null, null, { hit: 'metal', v: 0.05, p: 0.2 },
      null, null, null, null,
      { hit: 'membrane', v: 0.2, p: 0.7 }, null, null, null,
      null, null, { hit: 'metal', v: 0.08, p: 0.35 }, null,
    ],
  ],

  dripping: [
    [
      { hit: 'membrane', v: 0.2, p: 0.7 }, null, { hit: 'metal', v: 0.1, p: 0.5 }, null,
      null, { hit: 'membrane', v: 0.12, p: 0.4 }, null, null,
      { hit: 'metal', v: 0.12, p: 0.6 }, null, null, { hit: 'membrane', v: 0.15, p: 0.5 },
      null, null, { hit: 'metal', v: 0.08, p: 0.35 }, null,
    ],
    [
      null, null, { hit: 'membrane', v: 0.18, p: 0.6 }, null,
      { hit: 'metal', v: 0.1, p: 0.5 }, null, null, { hit: 'membrane', v: 0.1, p: 0.4 },
      null, { hit: 'metal', v: 0.12, p: 0.55 }, null, null,
      { hit: 'membrane', v: 0.15, p: 0.5 }, null, null, { hit: 'metal', v: 0.07, p: 0.3 },
    ],
    [
      { hit: 'metal', v: 0.1, p: 0.5 }, null, null, { hit: 'membrane', v: 0.15, p: 0.55 },
      null, { hit: 'metal', v: 0.08, p: 0.4 }, null, null,
      null, null, { hit: 'membrane', v: 0.18, p: 0.6 }, null,
      { hit: 'metal', v: 0.1, p: 0.45 }, null, null, null,
    ],
  ],

  driving: [
    [
      { hit: 'membrane', v: 0.35, p: 0.9 }, null, { hit: 'metal', v: 0.12, p: 0.5 }, null,
      { hit: 'membrane', v: 0.2, p: 0.6 }, null, { hit: 'metal', v: 0.15, p: 0.65 }, null,
      { hit: 'membrane', v: 0.3, p: 0.85 }, null, { hit: 'metal', v: 0.1, p: 0.45 }, null,
      { hit: 'membrane', v: 0.2, p: 0.55 }, null, { hit: 'metal', v: 0.15, p: 0.6 }, null,
    ],
    [
      { hit: 'membrane', v: 0.3, p: 0.85 }, null, null, { hit: 'metal', v: 0.12, p: 0.55 },
      null, { hit: 'membrane', v: 0.18, p: 0.5 }, null, { hit: 'metal', v: 0.14, p: 0.6 },
      { hit: 'membrane', v: 0.3, p: 0.85 }, null, { hit: 'metal', v: 0.1, p: 0.4 }, null,
      null, { hit: 'membrane', v: 0.15, p: 0.45 }, null, { hit: 'metal', v: 0.12, p: 0.5 },
    ],
    [
      { hit: 'membrane', v: 0.35, p: 0.9 }, { hit: 'metal', v: 0.06, p: 0.25 }, null, null,
      { hit: 'metal', v: 0.12, p: 0.55 }, null, { hit: 'membrane', v: 0.2, p: 0.6 }, null,
      { hit: 'membrane', v: 0.3, p: 0.85 }, null, null, { hit: 'metal', v: 0.1, p: 0.5 },
      null, { hit: 'membrane', v: 0.15, p: 0.5 }, { hit: 'metal', v: 0.12, p: 0.55 }, null,
    ],
  ],

  ghost: [
    [
      null, null, null, null,
      null, null, null, null,
      { hit: 'metal', v: 0.05, p: 0.2 }, null, null, null,
      null, null, null, null,
    ],
    [
      null, null, null, null,
      null, null, null, null,
      null, null, null, null,
      null, null, null, { hit: 'membrane', v: 0.06, p: 0.15 },
    ],
    [
      null, null, null, null,
      { hit: 'metal', v: 0.04, p: 0.15 }, null, null, null,
      null, null, null, null,
      null, null, null, null,
    ],
  ],
};

export function createPercussionVoice() {
  const panner = new Tone.Panner(0);

  const membrane = new Tone.MembraneSynth({
    pitchDecay: 0.05,
    octaves: 4,
    oscillator: { type: 'sine' },
    envelope: {
      attack: 0.001,
      decay: 0.8,
      sustain: 0,
      release: 0.8,
    },
  });
  membrane.volume.value = -24;

  const metal = new Tone.MetalSynth({
    frequency: 200,
    envelope: {
      attack: 0.001,
      decay: 0.4,
      release: 0.3,
    },
    harmonicity: 5.1,
    modulationIndex: 16,
    resonance: 4000,
    octaves: 1.5,
  });
  metal.volume.value = -28;

  membrane.connect(panner);
  metal.connect(panner);

  // State
  let currentPatternData = PERCUSSION_PATTERNS.pulse[0];
  let velocityScale = 1.0; // Density now scales velocities
  let sequence = null;

  function buildSequence() {
    const wasPlaying = sequence && sequence.state === 'started';
    if (sequence) {
      sequence.stop();
      sequence.dispose();
    }

    sequence = new Tone.Sequence((time, step) => {
      if (step === null) return;

      const { hit, v, p } = step;
      // Probability check — gives natural variation
      if (Math.random() > p) return;

      const velocity = Math.min(1, v * velocityScale);
      if (velocity < 0.01) return;

      if (hit === 'membrane') {
        const pitch = 40 + Math.random() * 30;
        membrane.triggerAttackRelease(pitch, '8n', time, velocity);
      } else if (hit === 'metal') {
        metal.triggerAttackRelease('16n', time, velocity);
      }
    }, currentPatternData, '16n');

    sequence.humanize = '64n';
    sequence.loop = true;

    if (wasPlaying || Tone.getTransport().state === 'started') {
      sequence.start(0);
    }
  }

  buildSequence();

  return {
    membrane,
    metal,
    panner,
    output: panner,

    start() {
      if (sequence && sequence.state !== 'started') {
        sequence.start(0);
      }
    },

    stop() {
      if (sequence) sequence.stop();
    },

    /** Set the pattern category (weather-driven). */
    setPatternCategory(category) {
      const patterns = PERCUSSION_PATTERNS[category];
      if (!patterns) return;
      currentPatternData = patterns[Math.floor(Math.random() * patterns.length)];
      buildSequence();
    },

    /**
     * Gentle accent on chord change downbeats.
     * Called by the progression player when a new chord starts.
     */
    triggerChordAccent(time) {
      // Offset slightly into the future to avoid colliding with Sequence events
      // that may trigger on the exact same sample frame (causes Tone.js
      // "Start time must be strictly greater than previous start time" error)
      const t = (time ?? Tone.now()) + 0.005;
      // Soft membrane thud to mark the harmonic rhythm
      membrane.triggerAttackRelease(
        50 + Math.random() * 15,
        '8n',
        t,
        0.12 + Math.random() * 0.08
      );
    },

    /**
     * Thunder transient — triggered by lightning flash in the visualizer.
     *
     * Two-hit structure mirrors real thunder acoustics: a sharp initial crack
     * (the direct sound wave) followed by a lower, longer rumble (reflections).
     * Pitch is randomised slightly so each strike sounds distinct.
     */
    triggerThunder() {
      const now = Tone.now();
      // Primary crack — loud, high-pitched, short
      membrane.triggerAttackRelease(
        38 + Math.random() * 12,
        '4n',
        now + 0.005,
        0.65 + Math.random() * 0.25
      );
      // Secondary rumble — quieter, lower, longer decay
      const rumbleDelay = 0.08 + Math.random() * 0.12;
      membrane.triggerAttackRelease(
        28 + Math.random() * 8,
        '2n',
        now + rumbleDelay,
        0.28 + Math.random() * 0.15
      );
    },

    /**
     * Set density — now scales velocities rather than controlling probability.
     * @param {number} value 0-1
     */
    setDensity(value) {
      velocityScale = Math.max(0, Math.min(2, value * 2));
    },

    /** Set stereo panning (-1 left, 0 center, 1 right) */
    setPan(value, rampTime = 5) {
      panner.pan.rampTo(value, rampTime);
    },

    setVolume(db, rampTime = 3) {
      membrane.volume.rampTo(db, rampTime);
      metal.volume.rampTo(db - 4, rampTime); // Metal always slightly quieter
    },

    dispose() {
      this.stop();
      if (sequence) sequence.dispose();
      membrane.dispose();
      metal.dispose();
      panner.dispose();
    },
  };
}
