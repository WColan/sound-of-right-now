import * as Tone from 'tone';
import { noteToMidi, midiToNote } from '../scale.js';

/**
 * Melody voice — occasional short phrases (3-5 notes) triggered probabilistically
 * on chord changes.
 *
 * Creates a call-and-response feel with the pad and arpeggio. Phrases are
 * generated with weighted note selection (70% chord tones, 30% scale tones),
 * mostly stepwise motion (intervals ≤4 semitones), with occasional larger leaps.
 *
 * Weather mood controls:
 * - Phrase probability (25-60% per chord change)
 * - Phrase length (2-5 notes)
 * - Rhythmic character (longer notes for calm, shorter for tense)
 *
 * The melody uses a triangle oscillator for a gentle, flute-like quality
 * that sits above the pad but doesn't dominate the texture.
 */

// Mood configuration: { probability, minNotes, maxNotes, noteDuration, restBetween }
const MOOD_CONFIG = {
  calm:       { probability: 0.50, minNotes: 2, maxNotes: 4, noteDuration: '4n', restBetween: '8n' },
  gentle:     { probability: 0.60, minNotes: 3, maxNotes: 5, noteDuration: '4n', restBetween: '8n' },
  melancholy: { probability: 0.65, minNotes: 3, maxNotes: 5, noteDuration: '4n.', restBetween: '16n' },
  tense:      { probability: 0.75, minNotes: 4, maxNotes: 5, noteDuration: '8n', restBetween: '16n' },
  suspended:  { probability: 0.40, minNotes: 2, maxNotes: 3, noteDuration: '2n', restBetween: '4n' },
  sparse:     { probability: 0.45, minNotes: 2, maxNotes: 4, noteDuration: '2n', restBetween: '8n' },
};

export function createMelodyVoice() {
  const filter = new Tone.Filter({
    frequency: 5000,
    type: 'lowpass',
    rolloff: -12,
  });

  const synth = new Tone.Synth({
    oscillator: {
      type: 'triangle',
    },
    envelope: {
      attack: 0.1,
      decay: 0.4,
      sustain: 0.3,
      release: 2.0,
    },
  });

  synth.volume.value = -20;
  synth.connect(filter);

  // State
  let currentChordTones = ['C4', 'E4', 'G4', 'B4'];
  let currentScaleTones = ['C4', 'D4', 'E4', 'F4', 'G4', 'A4', 'B4'];
  let currentMood = 'calm';
  let phraseEvents = []; // Track scheduled events for cleanup
  let lastNoteMidi = 67; // G4 — starting reference point

  /**
   * Pick the next note for a phrase using weighted selection + stepwise preference.
   * @param {boolean} preferChordTone - If true, 70% chord tone chance; else 30%
   * @returns {string} Note name with octave
   */
  function pickNote(preferChordTone = true) {
    const chordProb = preferChordTone ? 0.7 : 0.3;
    const pool = Math.random() < chordProb ? currentChordTones : currentScaleTones;
    if (pool.length === 0) return 'C4';

    // Prefer stepwise motion: find notes within 4 semitones of last note
    const nearby = pool.filter(n => {
      const dist = Math.abs(noteToMidi(n) - lastNoteMidi);
      return dist > 0 && dist <= 4;
    });

    // 80% chance of stepwise, 20% chance of larger leap
    let chosen;
    if (nearby.length > 0 && Math.random() < 0.8) {
      chosen = nearby[Math.floor(Math.random() * nearby.length)];
    } else {
      // Larger leap — pick from full pool, prefer within an octave
      const withinOctave = pool.filter(n => {
        const dist = Math.abs(noteToMidi(n) - lastNoteMidi);
        return dist > 0 && dist <= 12;
      });
      const leapPool = withinOctave.length > 0 ? withinOctave : pool;
      chosen = leapPool[Math.floor(Math.random() * leapPool.length)];
    }

    lastNoteMidi = noteToMidi(chosen);
    return chosen;
  }

  /**
   * Generate and schedule a melodic phrase.
   * Called after a slight delay from chord change for call-and-response feel.
   */
  function generatePhrase() {
    const config = MOOD_CONFIG[currentMood] || MOOD_CONFIG.calm;

    // Roll probability check
    if (Math.random() > config.probability) return;

    // Determine phrase length
    const noteCount = config.minNotes +
      Math.floor(Math.random() * (config.maxNotes - config.minNotes + 1));

    // Schedule phrase notes
    const now = Tone.now();
    const noteDurSec = Tone.Time(config.noteDuration).toSeconds();
    const restDurSec = Tone.Time(config.restBetween).toSeconds();
    const stepTime = noteDurSec + restDurSec;

    // Slight humanization offset per note
    for (let i = 0; i < noteCount; i++) {
      const humanize = (Math.random() - 0.5) * 0.05; // ±25ms
      const time = now + i * stepTime + humanize;

      // First note is always a chord tone, rest are mixed
      const isChordTone = i === 0 || Math.random() < 0.7;
      const note = pickNote(isChordTone);

      // Velocity variation — first and last notes accented for phrase shape
      const isAccent = i === 0 || i === noteCount - 1;
      const velocity = isAccent
        ? 0.50 + Math.random() * 0.15
        : 0.38 + Math.random() * 0.12;

      const eventId = Tone.getTransport().scheduleOnce((t) => {
        synth.triggerAttackRelease(note, config.noteDuration, t, velocity);
      }, time);

      phraseEvents.push(eventId);
    }
  }

  /**
   * Clean up any previously scheduled phrase events.
   */
  function clearPhraseEvents() {
    for (const id of phraseEvents) {
      Tone.getTransport().clear(id);
    }
    phraseEvents = [];
  }

  return {
    synth,
    filter,
    output: filter,

    /**
     * Update chord and scale tone pools.
     * @param {string[]} chordTones
     * @param {string[]} scaleTones
     */
    setChordContext(chordTones, scaleTones) {
      if (chordTones.length > 0) currentChordTones = chordTones;
      if (scaleTones.length > 0) currentScaleTones = scaleTones;
    },

    /**
     * Set the mood (weather-driven).
     * @param {string} mood - One of: calm, gentle, melancholy, tense, suspended, sparse
     */
    setMood(mood) {
      if (MOOD_CONFIG[mood]) {
        currentMood = mood;
      }
    },

    /**
     * Called on chord change. Triggers a phrase with a slight delay
     * for a call-and-response feel.
     */
    onChordChange() {
      clearPhraseEvents();

      // Delay phrase start by 0.5-1.5 beats for call-and-response
      const delaySec = Tone.Time('4n').toSeconds() * (0.5 + Math.random());
      const eventId = Tone.getTransport().scheduleOnce(() => {
        generatePhrase();
      }, Tone.now() + delaySec);

      phraseEvents.push(eventId);
    },

    setVolume(db, rampTime = 8) {
      synth.volume.rampTo(db, rampTime);
    },

    setFilterCutoff(freq, rampTime = 8) {
      filter.frequency.linearRampTo(freq, rampTime);
    },

    /**
     * Apply a weather timbre profile — changes oscillator type and envelope.
     * Takes effect on the next melody phrase.
     *
     *   warm   — Triangle with slow bloom: gentle, flute-like but lush
     *   cool   — Triangle (default): clean, balanced
     *   cold   — Sine: pure, thin, crystalline
     *   stormy — Sawtooth: bright, edgy, urgent
     */
    setTimbreProfile(profile) {
      const profiles = {
        warm:   { type: 'triangle', attack: 0.15, release: 2.5 },
        cool:   { type: 'triangle', attack: 0.10, release: 2.0 },
        cold:   { type: 'sine',     attack: 0.05, release: 1.5 },
        stormy: { type: 'sawtooth', attack: 0.03, release: 0.8 },
      };
      const p = profiles[profile] || profiles.cool;
      synth.set({
        oscillator: { type: p.type },
        envelope:   { attack: p.attack, release: p.release },
      });
    },

    stop() {
      clearPhraseEvents();
      synth.triggerRelease();
    },

    dispose() {
      this.stop();
      synth.dispose();
      filter.dispose();
    },
  };
}
