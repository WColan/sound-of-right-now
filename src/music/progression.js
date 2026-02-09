import * as Tone from 'tone';
import {
  getDiatonicChord, getScaleDegreeNote, getScaleNotes,
  getChordTonesForDegree, voiceLead,
} from './scale.js';

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

// ── Progression templates by weather mood ──
// Arrays of 1-indexed scale degrees.
const PROGRESSION_TEMPLATES = {
  calm: [
    [1, 4, 1, 5],
    [1, 6, 4, 1],
    [1, 4, 6, 4],
    [1, 5, 6, 4],
    [1, 3, 4, 1],
    [1, 4, 5, 4],
  ],
  gentle: [
    [1, 6, 2, 5],
    [1, 3, 6, 4],
    [4, 1, 5, 6],
    [1, 2, 4, 1],
    [6, 4, 1, 5],
    [1, 7, 6, 4],
  ],
  melancholy: [
    [1, 4, 7, 3],
    [1, 6, 3, 7],
    [1, 7, 6, 7],
    [6, 7, 1, 4],
    [1, 3, 4, 6],
    [4, 3, 6, 7],
  ],
  tense: [
    [1, 2, 5, 1, 7, 3, 6, 4],
    [1, 5, 6, 2, 7, 3, 4, 1],
    [1, 4, 7, 3, 6, 2, 5, 1],
    [2, 5, 1, 6, 3, 7, 4, 1],
  ],
  suspended: [
    [1, 4, 1],
    [1, 5, 1],
    [1, 4, 5, 1],
    [1, 2, 1],
  ],
  sparse: [
    [1, 5, 4, 1],
    [1, 6, 1, 4],
    [1, 3, 1, 5],
    [4, 1, 6, 1],
  ],
};

// ── Weather category → template pool ──
const CATEGORY_TO_TEMPLATE = {
  clear:   'calm',
  cloudy:  'gentle',
  fog:     'suspended',
  drizzle: 'melancholy',
  rain:    'melancholy',
  snow:    'sparse',
  storm:   'tense',
};

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

/**
 * Generate a chord progression for the given musical context.
 *
 * @param {string} root - Root note (e.g. 'D')
 * @param {string} mode - Mode name (e.g. 'dorian')
 * @param {string} weatherCategory - e.g. 'clear', 'rain', 'storm'
 * @param {number} pressureNorm - 0-1 normalized pressure
 * @returns {Progression}
 */
export function generateProgression(root, mode, weatherCategory, pressureNorm) {
  const templateKey = CATEGORY_TO_TEMPLATE[weatherCategory] || 'calm';
  const templates = PROGRESSION_TEMPLATES[templateKey];
  const template = templates[Math.floor(Math.random() * templates.length)];

  const harmonicRhythm = getHarmonicRhythm(pressureNorm, weatherCategory);
  const qualities = DIATONIC_CHORDS[mode] || DIATONIC_CHORDS.ionian;

  const chords = template.map(degree => {
    const degreeIndex = degree - 1; // Convert to 0-indexed
    const quality = qualities[degreeIndex];
    const chordRootName = getScaleDegreeNote(root, mode, degreeIndex);

    // Build chord for pad (root position, will be voice-led by the player)
    const notes = getDiatonicChord(root, mode, degreeIndex, 4);

    // Bass note (chord root in octave 2)
    const bassNote = `${chordRootName}2`;

    // Chord tones spread across arpeggio range
    const chordTones = getChordTonesForDegree(root, mode, degreeIndex, 3, 5);

    // All scale tones for passing notes
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
  });

  return {
    chords,
    harmonicRhythm,
    length: template.length,
  };
}

/**
 * Should a weather category change trigger an immediate progression swap?
 * Only for dramatic shifts — otherwise queue for next cycle end.
 */
export function shouldImmediatelyChange(oldCategory, newCategory) {
  if (oldCategory === newCategory) return false;
  // Storm onset/offset is dramatic
  if (newCategory === 'storm' || oldCategory === 'storm') return true;
  return false;
}

/**
 * Create a progression player that advances chords on Transport-synced measure boundaries.
 *
 * Uses a Tone.Loop that fires at the harmonic rhythm interval.
 * The first chord plays immediately when a progression is set.
 * At the end of a cycle, it either loops or advances to a queued progression.
 *
 * @param {{ onChordChange: (chord, index, total) => void }} callbacks
 */
export function createProgressionPlayer(callbacks) {
  let currentProgression = null;
  let nextProgression = null;
  let chordIndex = 0;
  let chordLoop = null;

  function startLoop() {
    if (chordLoop) {
      chordLoop.stop();
      chordLoop.dispose();
    }

    if (!currentProgression) return;

    const { chords, harmonicRhythm } = currentProgression;

    // Fire the first chord immediately
    callbacks.onChordChange(chords[0], 0, chords.length);

    chordLoop = new Tone.Loop((time) => {
      chordIndex++;

      // End of progression?
      if (chordIndex >= chords.length) {
        // Swap in queued progression if available
        if (nextProgression) {
          currentProgression = nextProgression;
          nextProgression = null;
          // Update loop interval if harmonic rhythm changed
          chordLoop.interval = currentProgression.harmonicRhythm;
        }
        chordIndex = 0;
      }

      const chord = currentProgression.chords[chordIndex];
      callbacks.onChordChange(chord, chordIndex, currentProgression.chords.length);
    }, harmonicRhythm);

    // Start after the first interval (first chord was already fired)
    chordLoop.start('+' + harmonicRhythm);
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
        chordIndex = 0;
        startLoop();
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

    stop() {
      if (chordLoop) {
        chordLoop.stop();
        chordLoop.dispose();
        chordLoop = null;
      }
      currentProgression = null;
      nextProgression = null;
      chordIndex = 0;
    },

    dispose() {
      this.stop();
    },
  };
}
