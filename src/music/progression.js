import * as Tone from 'tone';
import {
  getDiatonicChord, getScaleDegreeNote, getScaleNotes,
  getChordTonesForDegree, voiceLead,
  buildDominant7Chord, getChordTonesFromSemitones, NOTE_NAMES, noteToMidi,
} from './scale.js';
import { CATEGORY_TO_MOOD } from './constants.js';

// ── Diatonic chord qualities for each mode ──
// Built by stacking 3rds on each scale degree.
// Qualities: maj7, min7, dom7, min7b5
const DIATONIC_CHORDS = {
  ionian:     ['maj7', 'min7', 'min7', 'maj7', 'dom7', 'min7', 'min7b5'],
  dorian:     ['min7', 'min7', 'maj7', 'dom7', 'min7', 'min7b5', 'maj7'],
  mixolydian: ['dom7', 'min7', 'min7b5', 'maj7', 'min7', 'min7', 'maj7'],
  aeolian:    ['min7', 'min7b5', 'maj7', 'min7', 'min7', 'maj7', 'dom7'],
  lydian:     ['maj7', 'dom7', 'min7', 'min7', 'min7b5', 'maj7', 'min7'],
  locrian:    ['min7b5', 'maj7', 'min7', 'min7', 'maj7', 'dom7', 'min7'],
};

// ── Markov transition weights ──
// For each mood: degree → { target_degree: weight }
// Weights are relative (normalized at selection time). 0 = never.
// Consecutive self-transitions are blocked in weightedPick().
//
// Musical logic per mood:
//   calm       — Plagal/authentic: I↔IV, I↔V, some vi for color
//   gentle     — Balanced ii-V-I, vi as pivot, ♭VII adds gentle surprise
//   melancholy — Descending: ♭VII, iii, vi motion. Dark cadences.
//   tense      — Wide spread, chromatic-feeling ii-V, vii-III-VI chains
//   suspended  — Narrow orbit around I. Only IV and V as departures.
//   sparse     — Like calm but wider; frequent returns to I
const TRANSITION_WEIGHTS = {
  calm: {
    1: { 1: 0, 2: 1, 3: 2, 4: 8, 5: 6, 6: 4, 7: 1 },
    2: { 1: 3, 2: 0, 3: 1, 4: 2, 5: 5, 6: 1, 7: 1 },
    3: { 1: 4, 2: 1, 3: 0, 4: 5, 5: 1, 6: 3, 7: 1 },
    4: { 1: 8, 2: 2, 3: 1, 4: 0, 5: 4, 6: 3, 7: 1 },
    5: { 1: 8, 2: 1, 3: 1, 4: 4, 5: 0, 6: 3, 7: 1 },
    6: { 1: 4, 2: 2, 3: 1, 4: 6, 5: 3, 6: 0, 7: 1 },
    7: { 1: 5, 2: 1, 3: 2, 4: 3, 5: 1, 6: 2, 7: 0 },
  },
  gentle: {
    1: { 1: 0, 2: 3, 3: 3, 4: 4, 5: 2, 6: 5, 7: 3 },
    2: { 1: 3, 2: 0, 3: 1, 4: 3, 5: 6, 6: 1, 7: 1 },
    3: { 1: 2, 2: 1, 3: 0, 4: 3, 5: 1, 6: 5, 7: 2 },
    4: { 1: 5, 2: 2, 3: 1, 4: 0, 5: 4, 6: 2, 7: 1 },
    5: { 1: 5, 2: 1, 3: 1, 4: 2, 5: 0, 6: 4, 7: 2 },
    6: { 1: 3, 2: 2, 3: 1, 4: 5, 5: 3, 6: 0, 7: 2 },
    7: { 1: 3, 2: 1, 3: 2, 4: 3, 5: 1, 6: 4, 7: 0 },
  },
  melancholy: {
    1: { 1: 0, 2: 1, 3: 3, 4: 4, 5: 1, 6: 5, 7: 5 },
    2: { 1: 2, 2: 0, 3: 2, 4: 1, 5: 3, 6: 2, 7: 3 },
    3: { 1: 2, 2: 1, 3: 0, 4: 4, 5: 1, 6: 4, 7: 3 },
    4: { 1: 2, 2: 1, 3: 4, 4: 0, 5: 1, 6: 4, 7: 5 },
    5: { 1: 3, 2: 1, 3: 2, 4: 2, 5: 0, 6: 3, 7: 4 },
    6: { 1: 2, 2: 1, 3: 3, 4: 2, 5: 1, 6: 0, 7: 6 },
    7: { 1: 4, 2: 1, 3: 4, 4: 2, 5: 1, 6: 4, 7: 0 },
  },
  tense: {
    1: { 1: 0, 2: 4, 3: 3, 4: 4, 5: 4, 6: 3, 7: 4 },
    2: { 1: 3, 2: 0, 3: 3, 4: 2, 5: 5, 6: 3, 7: 3 },
    3: { 1: 2, 2: 3, 3: 0, 4: 3, 5: 2, 6: 5, 7: 3 },
    4: { 1: 4, 2: 3, 3: 2, 4: 0, 5: 4, 6: 2, 7: 4 },
    5: { 1: 4, 2: 2, 3: 3, 4: 3, 5: 0, 6: 4, 7: 3 },
    6: { 1: 2, 2: 4, 3: 3, 4: 4, 5: 3, 6: 0, 7: 3 },
    7: { 1: 4, 2: 2, 3: 4, 4: 3, 5: 3, 6: 3, 7: 0 },
  },
  suspended: {
    1: { 1: 0, 2: 2, 3: 0, 4: 7, 5: 6, 6: 1, 7: 0 },
    2: { 1: 8, 2: 0, 3: 0, 4: 2, 5: 3, 6: 0, 7: 0 },
    3: { 1: 6, 2: 1, 3: 0, 4: 3, 5: 2, 6: 1, 7: 0 },
    4: { 1: 8, 2: 1, 3: 0, 4: 0, 5: 4, 6: 1, 7: 0 },
    5: { 1: 9, 2: 1, 3: 0, 4: 3, 5: 0, 6: 1, 7: 0 },
    6: { 1: 6, 2: 1, 3: 0, 4: 4, 5: 3, 6: 0, 7: 0 },
    7: { 1: 7, 2: 0, 3: 1, 4: 3, 5: 2, 6: 0, 7: 0 },
  },
  sparse: {
    1: { 1: 0, 2: 1, 3: 3, 4: 5, 5: 5, 6: 4, 7: 1 },
    2: { 1: 5, 2: 0, 3: 1, 4: 2, 5: 4, 6: 1, 7: 1 },
    3: { 1: 6, 2: 1, 3: 0, 4: 3, 5: 2, 6: 2, 7: 1 },
    4: { 1: 7, 2: 1, 3: 1, 4: 0, 5: 3, 6: 2, 7: 1 },
    5: { 1: 7, 2: 1, 3: 1, 4: 3, 5: 0, 6: 2, 7: 1 },
    6: { 1: 5, 2: 1, 3: 2, 4: 4, 5: 2, 6: 0, 7: 1 },
    7: { 1: 5, 2: 1, 3: 2, 4: 3, 5: 2, 6: 2, 7: 0 },
  },
};

// ── Starting degree weights per mood ──
const STARTING_WEIGHTS = {
  calm:       { 1: 10, 2: 0, 3: 1, 4: 2, 5: 1, 6: 1, 7: 0 },
  gentle:     { 1: 7,  2: 1, 3: 1, 4: 3, 5: 1, 6: 3, 7: 1 },
  melancholy: { 1: 5,  2: 0, 3: 1, 4: 2, 5: 0, 6: 4, 7: 2 },
  tense:      { 1: 4,  2: 3, 3: 1, 4: 2, 5: 2, 6: 1, 7: 1 },
  suspended:  { 1: 10, 2: 0, 3: 0, 4: 1, 5: 1, 6: 0, 7: 0 },
  sparse:     { 1: 8,  2: 0, 3: 1, 4: 3, 5: 1, 6: 1, 7: 0 },
};

// ── Progression length ranges per mood ──
const PROGRESSION_LENGTHS = {
  calm:       { min: 4, max: 6 },
  gentle:     { min: 4, max: 6 },
  melancholy: { min: 4, max: 6 },
  tense:      { min: 6, max: 10 },
  suspended:  { min: 3, max: 5 },
  sparse:     { min: 3, max: 5 },
};

// ── Progression templates (retained as reference) ──
// These informed the Markov transition weights above.
// eslint-disable-next-line no-unused-vars
const PROGRESSION_TEMPLATES = {
  calm:       [[1,4,1,5],[1,6,4,1],[1,4,6,4],[1,5,6,4],[1,3,4,1],[1,4,5,4]],
  gentle:     [[1,6,2,5],[1,3,6,4],[4,1,5,6],[1,2,4,1],[6,4,1,5],[1,7,6,4]],
  melancholy: [[1,4,7,3],[1,6,3,7],[1,7,6,7],[6,7,1,4],[1,3,4,6],[4,3,6,7]],
  tense:      [[1,2,5,1,7,3,6,4],[1,5,6,2,7,3,4,1],[1,4,7,3,6,2,5,1],[2,5,1,6,3,7,4,1]],
  suspended:  [[1,4,1],[1,5,1],[1,4,5,1],[1,2,1]],
  sparse:     [[1,5,4,1],[1,6,1,4],[1,3,1,5],[4,1,6,1]],
};

/**
 * Pick a degree (1-7) from a weights object using weighted random selection.
 * Optionally excludes one degree (for no consecutive repeats).
 *
 * @param {Object<number, number>} weights - degree → weight
 * @param {number|null} exclude - degree to skip
 * @returns {number} chosen degree (1-indexed)
 */
function weightedPick(weights, exclude = null) {
  let total = 0;
  const entries = [];
  for (const [degree, weight] of Object.entries(weights)) {
    const d = parseInt(degree);
    if (d === exclude || weight <= 0) continue;
    entries.push({ degree: d, weight });
    total += weight;
  }
  if (entries.length === 0) {
    // Fallback: pick any degree except excluded
    const fallback = [1, 2, 3, 4, 5, 6, 7].filter(d => d !== exclude);
    return fallback[Math.floor(Math.random() * fallback.length)];
  }
  let roll = Math.random() * total;
  for (const { degree, weight } of entries) {
    roll -= weight;
    if (roll <= 0) return degree;
  }
  return entries[entries.length - 1].degree;
}

/**
 * Determine harmonic rhythm (measures per chord) from pressure and weather.
 * High pressure = slow changes (stable atmosphere).
 * Low pressure = faster changes (turbulence).
 *
 * @param {number} pressureNorm - 0-1 (0=980hPa low, 1=1050hPa high)
 * @param {string} weatherCategory
 * @returns {string} Tone.js time value like '4m'
 */
function getHarmonicRhythm(pressureNorm, weatherCategory) {
  if (weatherCategory === 'storm') return '2m';
  if (weatherCategory === 'fog') return '8m';

  // 2m (fast) at low pressure → 8m (slow) at high pressure
  const measures = Math.round(2 + pressureNorm * 6);
  return `${measures}m`;
}

// ── Secondary Dominant Injection ──
// Probability of inserting a V7/x chord before eligible target degrees.
// Mood-driven: dramatic moods = more secondary dominants, peaceful = none.
const SEC_DOM_PROBABILITY = {
  tense:      0.30,
  melancholy: 0.20,
  gentle:     0.12,
  calm:       0.08,
  suspended:  0,
  sparse:     0,
};

// Target degrees that benefit from secondary dominant preparation.
// These are the "resolvable" harmonies in tonal music.
const SEC_DOM_TARGETS = new Set([2, 4, 5, 6]); // ii, IV, V, vi

/**
 * Build a secondary dominant (V7/x) chord object targeting the given chord.
 * The secondary dominant is a dominant 7th built a perfect 5th above the
 * target chord's root — it wants to resolve down to the target.
 *
 * IMPORTANT: scaleTones is kept from the original mode so arpeggio/melody
 * continue playing in-key even while the harmony briefly departs.
 *
 * @param {object} targetChord - The chord this V7 resolves to
 * @param {string[]} originalScaleTones - Scale tones for current root/mode
 * @returns {object} Secondary dominant chord object
 */
function buildSecondaryDominant(targetChord, originalScaleTones) {
  // A perfect 5th = 7 semitones. The secondary dominant root is 7 semitones
  // ABOVE the target root (V of x). E.g., target = F (index 5), V/F = C (index 0).
  const targetRootIdx = NOTE_NAMES.indexOf(targetChord.chordRootName);
  const secDomRootIdx = (targetRootIdx + 7) % 12;
  const secDomRootName = NOTE_NAMES[secDomRootIdx];

  // Build the dominant 7th chord: root, M3, P5, m7
  const notes = buildDominant7Chord(secDomRootName, 4);

  // Chord tones: all instances of the 4 chromatic dom7 semitones across octaves 3-5
  const DOM7_SEMITONES = [0, 4, 7, 10];
  const chordTones = getChordTonesFromSemitones(secDomRootName, DOM7_SEMITONES, 3, 5);

  return {
    degree: null,           // Non-diatonic — no scale degree
    degreeIndex: null,
    quality: 'dom7',
    notes,
    bassNote: `${secDomRootName}2`,
    chordTones,
    scaleTones: originalScaleTones, // UNCHANGED — melody/arpeggio stay in key
    chordRootName: secDomRootName,
    isSecondaryDominant: true,  // For debugging / chord display
    resolvesDegree: targetChord.degree,
  };
}

/**
 * Replace the octave digit in a note name string.
 * e.g. shiftOctave('E5', 2) → 'E2'
 */
function shiftOctave(noteName, targetOctave) {
  return noteName.replace(/\d+$/, String(targetOctave));
}

/**
 * Choose the inversion of a chord that minimizes the bass leap from the
 * previous chord's bass note. Only considers root, first, and second inversion
 * (using chord.notes[0], [1], [2] as the candidate bass notes, placed in octave 2).
 *
 * Only `bassNote` is changed — pad `notes[]` and `scaleTones[]` are untouched.
 *
 * @param {object} chord - Chord object (output of buildChord or buildSecondaryDominant)
 * @param {string|null} previousBassNote - The bass note from the previous chord
 * @returns {object} Chord with (potentially updated) bassNote
 */
function selectInversion(chord, previousBassNote) {
  if (!previousBassNote || chord.notes.length < 3) return chord;

  // Three candidates: root position, 1st inversion (3rd in bass), 2nd inversion (5th in bass)
  const candidates = [
    chord.bassNote,                          // root position (already in octave 2)
    shiftOctave(chord.notes[1], 2),          // first inversion
    shiftOctave(chord.notes[2], 2),          // second inversion
  ];

  const prevMidi = noteToMidi(previousBassNote);
  let bestBass = candidates[0];
  let bestDist = Math.abs(noteToMidi(candidates[0]) - prevMidi);

  for (let i = 1; i < candidates.length; i++) {
    const dist = Math.abs(noteToMidi(candidates[i]) - prevMidi);
    if (dist < bestDist) {
      bestDist = dist;
      bestBass = candidates[i];
    }
  }

  if (bestBass === chord.bassNote) return chord; // No change needed
  return { ...chord, bassNote: bestBass };
}

/**
 * Build a chord data object for a given scale degree.
 * Used by both the initial generation and the Markov walker.
 *
 * @param {string} root - Scale root (e.g. 'D')
 * @param {string} mode - Mode name
 * @param {number} degree - 1-indexed scale degree
 * @param {string[]} qualities - Diatonic chord quality array for this mode
 * @returns {object} Chord data object
 */
function buildChord(root, mode, degree, qualities) {
  const degreeIndex = degree - 1;
  const quality = qualities[degreeIndex];
  const chordRootName = getScaleDegreeNote(root, mode, degreeIndex);
  const notes = getDiatonicChord(root, mode, degreeIndex, 4);
  const bassNote = `${chordRootName}2`;
  const chordTones = getChordTonesForDegree(root, mode, degreeIndex, 3, 5);
  const scaleTones = getScaleNotes(root, mode, 3, 5);

  return {
    degree,
    degreeIndex,
    quality,
    notes,
    bassNote,
    chordTones,
    scaleTones,
    chordRootName,
  };
}

/**
 * Generate a chord progression using Markov-chain degree selection.
 *
 * Each mood has transition probability weights that encode its harmonic
 * character. Consecutive degree repeats are prohibited. Progression
 * length varies by mood. Every generated sequence is unique.
 *
 * @param {string} root - Root note (e.g. 'D')
 * @param {string} mode - Mode name (e.g. 'dorian')
 * @param {string} weatherCategory - e.g. 'clear', 'rain', 'storm'
 * @param {number} pressureNorm - 0-1 normalized pressure
 * @returns {Progression}
 */
export function generateProgression(root, mode, weatherCategory, pressureNorm) {
  const mood = CATEGORY_TO_MOOD[weatherCategory] || 'calm';
  const harmonicRhythm = getHarmonicRhythm(pressureNorm, weatherCategory);
  const qualities = DIATONIC_CHORDS[mode] || DIATONIC_CHORDS.ionian;

  // Determine progression length
  const lengths = PROGRESSION_LENGTHS[mood] || { min: 4, max: 6 };
  const length = lengths.min + Math.floor(Math.random() * (lengths.max - lengths.min + 1));

  // Build degree sequence via Markov chain
  const transitions = TRANSITION_WEIGHTS[mood] || TRANSITION_WEIGHTS.calm;
  const startWeights = STARTING_WEIGHTS[mood] || STARTING_WEIGHTS.calm;

  const degrees = [];
  let currentDegree = weightedPick(startWeights);
  degrees.push(currentDegree);

  for (let i = 1; i < length; i++) {
    const weights = transitions[currentDegree] || transitions[1];
    currentDegree = weightedPick(weights, currentDegree); // exclude self
    degrees.push(currentDegree);
  }

  // Build chord objects
  const chords = degrees.map(degree => buildChord(root, mode, degree, qualities));

  // ── Secondary dominant injection ──
  // After building the diatonic sequence, scan for eligible target chords and
  // optionally insert a V7/x chord immediately before them.
  // scaleTones from the first chord represents the full scale (same for all diatonic chords).
  const secDomProb = SEC_DOM_PROBABILITY[mood] ?? 0;
  let finalChords = chords;

  if (secDomProb > 0) {
    const originalScaleTones = chords[0]?.scaleTones ?? getScaleNotes(root, mode, 3, 5);
    const injected = [];
    for (const chord of chords) {
      // Only inject before eligible diatonic targets (not before another secondary dominant)
      if (SEC_DOM_TARGETS.has(chord.degree) && Math.random() < secDomProb) {
        injected.push(buildSecondaryDominant(chord, originalScaleTones));
      }
      injected.push(chord);
    }
    finalChords = injected;
  }

  // ── Chord inversions ──
  // After the full chord list is assembled (including secondary dominants),
  // pick the inversion for each chord that minimizes the bass leap from the previous.
  let previousBassNote = null;
  finalChords = finalChords.map(chord => {
    const voiced = selectInversion(chord, previousBassNote);
    previousBassNote = voiced.bassNote;
    return voiced;
  });

  return {
    chords: finalChords,
    harmonicRhythm,
    length: finalChords.length,
  };
}

/**
 * Should a weather category change trigger an immediate progression swap?
 * Only for dramatic shifts — otherwise queue for next cycle end.
 */
export function shouldImmediatelyChange(oldCategory, newCategory) {
  if (oldCategory === newCategory) return false;
  // Storm onset/offset is always dramatic — immediate harmonic shift
  if (newCategory === 'storm' || oldCategory === 'storm') return true;
  // Fog creates a distinct suspended harmonic world — onset/offset should feel immediate
  if (newCategory === 'fog' || oldCategory === 'fog') return true;
  // Snow has a very distinct sparse/ethereal palette — don't make the listener wait 30s
  if (newCategory === 'snow' || oldCategory === 'snow') return true;
  return false;
}

/**
 * Create a progression player that advances chords on Transport-synced measure boundaries.
 *
 * Uses a Tone.Loop that fires at the harmonic rhythm interval.
 * The first chord plays immediately when a progression is set.
 * At the end of a cycle, it either advances to a queued progression,
 * generates a fresh one via onCycleEnd callback, or re-loops.
 *
 * @param {{ onChordChange: (chord, index, total) => void, onCycleEnd?: () => Progression|null }} callbacks
 */
export function createProgressionPlayer(callbacks) {
  let currentProgression = null;
  let nextProgression = null;
  let chordIndex = 0;
  let chordLoop = null;

  function stopLoop() {
    if (chordLoop) {
      chordLoop.stop();
      chordLoop.dispose();
      chordLoop = null;
    }
  }

  function startLoop({ fireCurrentChord = false } = {}) {
    stopLoop();

    if (!currentProgression) return;

    if (fireCurrentChord) {
      const chord = currentProgression.chords[chordIndex];
      callbacks.onChordChange(chord, chordIndex, currentProgression.chords.length);
    }

    chordLoop = new Tone.Loop(() => {
      chordIndex++;

      // End of progression?
      if (chordIndex >= currentProgression.chords.length) {
        if (nextProgression) {
          // Swap in queued progression (weather/key change)
          currentProgression = nextProgression;
          nextProgression = null;
        } else if (callbacks.onCycleEnd) {
          // Generate a fresh progression to keep evolving
          const fresh = callbacks.onCycleEnd();
          if (fresh) currentProgression = fresh;
        }
        // If neither callback nor queue, re-loop current progression
        chordIndex = 0;
      }

      const chord = currentProgression.chords[chordIndex];
      callbacks.onChordChange(chord, chordIndex, currentProgression.chords.length);

      // Secondary dominant chords last half the normal harmonic rhythm — they
      // are a brief chromatic intensification, not a full harmonic station.
      // We set the interval AFTER firing so it governs the *next* wake-up.
      const baseRhythm = currentProgression.harmonicRhythm;
      chordLoop.interval = chord.isSecondaryDominant
        ? baseRhythm.replace(/(\d+)m/, (_, n) => `${Math.max(1, Math.round(parseInt(n) / 2))}m`)
        : baseRhythm;
    }, currentProgression.harmonicRhythm);

    // Start after the first interval (first chord was already fired)
    chordLoop.start('+' + currentProgression.harmonicRhythm);
  }

  return {
    /**
     * Load a progression.
     * @param {object} progression - From generateProgression()
     * @param {boolean} immediate - If true, starts now. If false, queues for next cycle end.
     */
    setProgression(progression, immediate = false) {
      if (immediate || !currentProgression) {
        currentProgression = progression;
        nextProgression = null;
        chordIndex = 0;
        startLoop({ fireCurrentChord: true });
      } else {
        nextProgression = progression;
      }
    },

    get currentChord() {
      if (!currentProgression) return null;
      return currentProgression.chords[chordIndex];
    },

    get position() {
      if (!currentProgression) return { index: 0, total: 0 };
      return { index: chordIndex, total: currentProgression.chords.length };
    },

    /**
     * Restart the chord loop after a pause. Resumes from the current position
     * in the current progression. Called by engine.resume().
     */
    start() {
      if (currentProgression) {
        startLoop({ fireCurrentChord: false });
      }
    },

    /** Pause playback while preserving progression and position. */
    pause() {
      stopLoop();
    },

    /** Alias for start(); explicit name for pause/resume lifecycle. */
    resume() {
      this.start();
    },

    stop() {
      stopLoop();
      currentProgression = null;
      nextProgression = null;
      chordIndex = 0;
    },

    dispose() {
      this.stop();
    },
  };
}
