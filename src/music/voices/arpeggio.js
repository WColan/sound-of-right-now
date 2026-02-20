import * as Tone from 'tone';
import { noteToMidi } from '../scale.js';

/**
 * Arpeggio voice — plucky melodic patterns, the movement layer.
 *
 * Chord-aware: receives separate chord tone and scale tone pools
 * from the progression player. Uses rhythmic pattern templates that
 * emphasize chord tones on strong beats and passing tones on weak beats.
 */

// ── Rhythmic pattern templates ──
// 'C' = chord tone, 'S' = scale/passing tone, null = rest
const ARPEGGIO_PATTERNS = {
  ethereal: [
    ['C', null, null, null, 'S', null, null, null],
    ['C', null, 'S', null, null, null, null, null],
    [null, null, 'C', null, null, null, 'S', null],
  ],
  flowing: [
    ['C', null, 'S', null, 'C', null, 'S', null],
    ['C', 'S', null, 'C', null, 'S', null, null],
    ['C', null, 'C', 'S', null, 'C', null, 'S'],
  ],
  rippling: [
    ['C', 'S', 'C', null, 'S', 'C', 'S', null],
    ['C', 'S', 'S', 'C', null, 'S', 'C', 'S'],
    ['C', null, 'S', 'C', 'S', null, 'C', 'S'],
  ],
  cascading: [
    ['C', 'S', 'C', 'S', 'C', 'S', 'C', 'S'],
    ['C', 'C', 'S', 'C', 'S', 'S', 'C', 'S'],
    ['S', 'C', 'S', 'C', 'C', 'S', 'C', 'C'],
  ],
};

export function createArpeggioVoice() {
  const filter = new Tone.Filter({
    frequency: 4000,
    type: 'lowpass',
    rolloff: -12,
  });

  const synth = new Tone.Synth({
    oscillator: {
      type: 'fatsine',  // Warmer than bare triangle — soft with slight chorus
      count: 2,
      spread: 12,
    },
    envelope: {
      attack: 0.04,     // Slightly softened attack to reduce click
      decay: 0.5,
      sustain: 0.05,
      release: 1.2,     // Longer tail for ambient blend
    },
  });

  synth.volume.value = -18;
  synth.connect(filter);

  // State
  let currentChordTones = ['C4', 'E4', 'G4', 'B4'];
  let currentScaleTones = ['C4', 'D4', 'E4', 'F4', 'G4', 'A4', 'B4'];
  let currentDirection = 'upDown';
  let currentPatternData = ARPEGGIO_PATTERNS.flowing[0];
  let sequence = null;

  // Note selection state
  let chordIdx = 0;
  let chordStep = 1;  // +1 for up, -1 for down (bounce mode)
  let lastChordMidi = 60;

  function pickChordTone() {
    if (currentChordTones.length === 0) return 'C4';

    if (currentDirection === 'random') {
      chordIdx = Math.floor(Math.random() * currentChordTones.length);
    } else if (currentDirection === 'up') {
      chordIdx = (chordIdx + 1) % currentChordTones.length;
    } else if (currentDirection === 'down') {
      chordIdx = (chordIdx - 1 + currentChordTones.length) % currentChordTones.length;
    } else {
      // upDown — bounce between endpoints
      chordIdx += chordStep;
      if (chordIdx >= currentChordTones.length - 1) { chordIdx = currentChordTones.length - 1; chordStep = -1; }
      if (chordIdx <= 0) { chordIdx = 0; chordStep = 1; }
    }

    const note = currentChordTones[chordIdx];
    lastChordMidi = noteToMidi(note);
    return note;
  }

  function pickScaleTone() {
    if (currentScaleTones.length === 0) return 'C4';

    // Pick a scale tone near the last chord tone for melodic continuity
    let best = currentScaleTones[0];
    let bestDist = Infinity;
    for (const s of currentScaleTones) {
      const midi = noteToMidi(s);
      const dist = Math.abs(midi - lastChordMidi);
      if (dist > 0 && dist < bestDist) {
        best = s;
        bestDist = dist;
      }
    }
    // Occasional random jump for variety
    if (Math.random() < 0.2) {
      best = currentScaleTones[Math.floor(Math.random() * currentScaleTones.length)];
    }
    return best;
  }

  function buildSequence() {
    const wasPlaying = sequence && sequence.state === 'started';
    if (sequence) {
      sequence.stop();
      sequence.dispose();
    }

    sequence = new Tone.Sequence((time, type) => {
      if (type === null) return;

      let note, velocity;
      if (type === 'C') {
        note = pickChordTone();
        velocity = 0.35 + Math.random() * 0.15;
      } else {
        note = pickScaleTone();
        velocity = 0.2 + Math.random() * 0.12;
      }

      synth.triggerAttackRelease(note, '8n', time, velocity);
    }, currentPatternData, '8n');

    sequence.humanize = '32n';
    sequence.loop = true;

    if (wasPlaying || Tone.getTransport().state === 'started') {
      sequence.start(0);
    }
  }

  buildSequence();

  return {
    synth,
    filter,
    output: filter,

    start() {
      if (sequence && sequence.state !== 'started') {
        sequence.start(0);
      }
    },

    stop() {
      if (sequence) sequence.stop();
    },

    /** Update chord and scale tone pools (called on each chord change). */
    setChordContext(chordTones, scaleTones) {
      if (chordTones.length > 0) currentChordTones = chordTones;
      if (scaleTones.length > 0) currentScaleTones = scaleTones;
      chordIdx = Math.min(chordIdx, currentChordTones.length - 1);
    },

    /** Set the rhythmic pattern template (weather-driven). */
    setRhythmPattern(patternName) {
      const patterns = ARPEGGIO_PATTERNS[patternName];
      if (!patterns) return;
      currentPatternData = patterns[Math.floor(Math.random() * patterns.length)];
      buildSequence();
    },

    /** Set note movement direction (wind-driven). */
    setDirection(dir) {
      currentDirection = dir;
      chordStep = 1;
    },

    // Legacy compat
    setNotes(notes) { this.setChordContext(notes, notes); },
    setPattern(type) { this.setDirection(type); },
    setInterval() { /* no-op: rhythm patterns control density now */ },

    setVolume(db, rampTime = 3) {
      synth.volume.rampTo(db, rampTime);
    },

    setFilterCutoff(freq, rampTime = 5) {
      filter.frequency.linearRampTo(freq, rampTime);
    },

    /**
     * Apply a weather timbre profile — changes oscillator type and envelope character.
     * Takes effect on the next note trigger.
     *
     *   warm   — Fatsine with long release: melodic, bloomy
     *   cool   — Triangle: clean and balanced (the familiar default)
     *   cold   — Pure sine: sparse, crystalline, short decay
     *   stormy — Fatsawtooth: sharp, raw, agitated
     */
    setTimbreProfile(profile) {
      const profiles = {
        warm:   { type: 'fatsine',     count: 2, attack: 0.06, release: 1.8 },
        cool:   { type: 'triangle',    count: 1, attack: 0.04, release: 1.2 },
        cold:   { type: 'sine',        count: 1, attack: 0.02, release: 0.8 },
        stormy: { type: 'fatsawtooth', count: 2, attack: 0.01, release: 0.6 },
      };
      const p = profiles[profile] || profiles.cool;
      synth.set({
        oscillator: { type: p.type, count: p.count },
        envelope:   { attack: p.attack, release: p.release },
      });
    },

    dispose() {
      this.stop();
      if (sequence) sequence.dispose();
      synth.dispose();
      filter.dispose();
    },
  };
}
