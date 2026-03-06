import * as Tone from 'tone';

/**
 * Wind chime voice — metallic FM-synthesized tones driven by wind.
 *
 * Each strike uses an FMSynth with non-integer harmonicity (5.4) to produce
 * inharmonic sidebands characteristic of vibrating metal tubes. A shared
 * NoiseSynth adds a brief clapper-strike transient. Four pooled voices allow
 * overlapping rings and cluster strikes during gusts.
 *
 * Scheduling is recursive via Transport.scheduleOnce: each event schedules the
 * next at an interval inversely proportional to wind speed (clamped at 45 km/h
 * to model chimes being pinned in extreme wind). Notes are transposed into
 * octaves 6–7 (small-chime register) with chord-tone preference.
 */

const POOL_SIZE = 4;

/** High-wind ceiling — above this, chimes plateau (tubes get pinned). */
const WIND_CLAMP = 45;

export function createWindChimeVoice() {
  // ── Output bus ────────────────────────────────────────────────────────────
  // A Tone.Volume node so engine can call output.volume.rampTo() (line 830).
  // Initialized to 0 dB — the engine controls overall level via rampTo().
  const outputGain = new Tone.Gain(1);
  const output = new Tone.Volume(0);
  outputGain.connect(output);

  // ── Strike transient (shared) ─────────────────────────────────────────────
  // White noise burst through bandpass ~4 kHz simulates clapper impact.
  const strikeFilter = new Tone.Filter({
    frequency: 4000,
    type: 'bandpass',
    Q: 1.5,
  });
  const strikeNoise = new Tone.NoiseSynth({
    noise: { type: 'white' },
    envelope: { attack: 0.001, decay: 0.015, sustain: 0, release: 0.01 },
    volume: -6,
  });
  strikeNoise.connect(strikeFilter);
  strikeFilter.connect(outputGain);

  // ── FM voice pool ─────────────────────────────────────────────────────────
  // Each voice is micro-detuned for natural beating when tones overlap.
  const chimePool = [];
  for (let i = 0; i < POOL_SIZE; i++) {
    const fm = new Tone.FMSynth({
      harmonicity: 5.4,
      modulationIndex: 12,
      oscillator: { type: 'sine' },
      modulation: { type: 'sine' },
      envelope: { attack: 0.001, decay: 1.8, sustain: 0, release: 0.3 },
      modulationEnvelope: {
        attack: 0.001,
        decay: 0.8,
        sustain: 0.15,
        release: 0.2,
      },
      volume: 0,
    });
    // ±6 cents spread across pool → ~2-5 Hz beating depending on register
    fm.detune.value = (i - (POOL_SIZE - 1) / 2) * 4;
    fm.connect(outputGain);
    chimePool.push({ synth: fm, releaseAt: 0 });
  }

  // Round-robin index for voice allocation
  let nextVoice = 0;

  let scheduledId = null;
  let currentNotes = [];
  let currentChordNotes = [];
  let currentWindSpeed = 0;
  let isActive = false;

  // ── Helpers ───────────────────────────────────────────────────────────────

  /**
   * Transpose note names into octaves 6–7 for the small-chime register.
   * Source tones (typically octaves 3–5) are shifted up; duplicates are removed.
   */
  function transposeToChimeRegister(notes) {
    const seen = new Set();
    const result = [];
    for (const n of notes) {
      const name = n.replace(/\d+$/, '');
      for (const oct of [6, 7]) {
        const key = `${name}${oct}`;
        if (!seen.has(key)) {
          seen.add(key);
          result.push(key);
        }
      }
    }
    return result;
  }

  /**
   * Acquire the next voice via round-robin. Simple and CPU-predictable —
   * with 4 voices and typical chime rates, collisions are rare and the
   * natural tail-off of a stolen voice sounds like physical damping.
   */
  function acquireVoice() {
    const voice = chimePool[nextVoice];
    nextVoice = (nextVoice + 1) % POOL_SIZE;
    return voice;
  }

  /**
   * Compute decay duration from MIDI pitch. Shorter tubes (higher pitch)
   * decay faster — matching real small-chime physics.
   * Octave 6 (MIDI 84–95): ~1.4–0.7s   Octave 7 (MIDI 96–107): ~0.7–0.3s
   */
  function getDecayForNote(noteName) {
    const midi = Tone.Frequency(noteName).toMidi();
    const t = Math.min(1, Math.max(0, (midi - 84) / 24));
    return 1.4 - t * 1.1;
  }

  /**
   * Trigger a single chime strike — FM tone only.
   * Harmonicity is jittered ±0.15 so each strike has unique partial structure.
   * The clapper transient is fired separately (once per cluster, not per note).
   */
  function triggerChime(noteName, time) {
    const voice = acquireVoice();
    const decay = getDecayForNote(noteName);

    voice.synth.set({
      harmonicity: 5.4 + (Math.random() - 0.5) * 0.3,
      envelope: { decay },
      modulationEnvelope: { decay: decay * 0.45 },
    });

    voice.synth.triggerAttackRelease(noteName, decay + 0.3, time);
    voice.releaseAt = time + decay + 0.3;
  }

  /**
   * Pick a note with 65% chord-tone preference for harmonic coherence.
   */
  function pickNote() {
    const preferChord = Math.random() < 0.65;
    const pool =
      preferChord && currentChordNotes.length > 0
        ? currentChordNotes
        : currentNotes;
    if (pool.length === 0) return null;
    return pool[Math.floor(Math.random() * pool.length)];
  }

  /**
   * Interval between strike events. Wind speed shortens it (more frequent
   * strikes), clamped at WIND_CLAMP to prevent unrealistic rapid-fire.
   * Randomized ±50% for organic feel.
   *
   * Curve: 3 km/h → ~10s, 10 km/h → ~4.5s, 20 km/h → ~2s, 40+ km/h → ~1s
   */
  function getInterval() {
    const effectiveWind = Math.min(currentWindSpeed, WIND_CLAMP);
    const base = Math.max(0.8, 12 * Math.exp(-effectiveWind * 0.06));
    return base * (0.5 + Math.random());
  }

  /**
   * Recursive scheduling. On each event, possibly triggers a cluster of
   * 2–3 rapid strikes when wind is strong (simulates clapper swinging
   * through multiple tubes).
   *
   * @param {number} [fromTransportSeconds] - Transport timeline seconds to
   *   chain from. Omit for the initial call (uses relative `+offset`).
   */
  function scheduleNext(fromTransportSeconds) {
    if (!isActive || currentNotes.length === 0) return;
    const transport = Tone.getTransport();
    const interval = getInterval();
    const when = fromTransportSeconds != null ? fromTransportSeconds + interval : `+${interval}`;
    scheduledId = transport.scheduleOnce((time) => {
      if (!isActive) return;

      // Clapper impact — one transient per event (in a cluster the clapper
      // strikes once, then tubes ring each other).
      strikeNoise.triggerAttackRelease('32n', time);

      // Cluster probability scales with wind: 0% at calm → 60% at 40+ km/h
      const clusterChance = Math.min(0.6, currentWindSpeed * 0.015);
      let clusterSize = 1;
      if (Math.random() < clusterChance) {
        clusterSize = Math.random() < 0.4 ? 3 : 2;
      }

      for (let i = 0; i < clusterSize; i++) {
        const note = pickNote();
        if (note) {
          // 30–120ms between cluster members
          const offset = i * (0.03 + Math.random() * 0.09);
          triggerChime(note, time + offset);
        }
      }

      // Schedule against transport timeline seconds, not AudioContext callback
      // time, so pause/resume keeps recursive scheduling stable.
      scheduleNext(transport.seconds);
    }, when);
  }

  // ── Public interface (unchanged from original) ────────────────────────────

  return {
    output,

    setNotes(scaleTones, chordTones = []) {
      // Transpose scale/chord tones up to octaves 6–7 for small-chime register.
      // Source tones are typically in octaves 3–5, so we shift up by octaves.
      currentNotes = transposeToChimeRegister(scaleTones);
      currentChordNotes = transposeToChimeRegister(chordTones);
    },

    setWindSpeed(kmh) {
      currentWindSpeed = kmh;
    },

    setActive(active) {
      if (active === isActive) return;
      isActive = active;
      if (active) {
        scheduleNext();
      } else if (scheduledId !== null) {
        Tone.getTransport().clear(scheduledId);
        scheduledId = null;
      }
    },

    dispose() {
      this.setActive(false);
      chimePool.forEach((v) => v.synth.dispose());
      strikeNoise.dispose();
      strikeFilter.dispose();
      outputGain.dispose();
      output.dispose();
    },
  };
}
