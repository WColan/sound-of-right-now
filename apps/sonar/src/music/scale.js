const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

const MODES = {
  locrian:       [0, 1, 3, 5, 6, 8, 10],
  aeolian:       [0, 2, 3, 5, 7, 8, 10],
  dorian:        [0, 2, 3, 5, 7, 9, 10],
  mixolydian:    [0, 2, 4, 5, 7, 9, 10],
  ionian:        [0, 2, 4, 5, 7, 9, 11],
  lydian:        [0, 2, 4, 6, 7, 9, 11],
  // Extended minor variants — used contextually by mapper.js, not in MODE_SPECTRUM
  harmonicMinor: [0, 2, 3, 5, 7, 8, 11],
  melodicMinor:  [0, 2, 3, 5, 7, 9, 11],
};

// Ordered dark to bright for temperature mapping
const MODE_SPECTRUM = ['locrian', 'aeolian', 'dorian', 'mixolydian', 'ionian', 'lydian'];

/**
 * Convert a note name + octave to MIDI number.
 * e.g. "C4" -> 60, "A3" -> 57
 */
export function noteToMidi(note) {
  const match = note.match(/^([A-G]#?)(\d+)$/);
  if (!match) return 60;
  const [, name, octave] = match;
  return NOTE_NAMES.indexOf(name) + (parseInt(octave) + 1) * 12;
}

/**
 * Convert a MIDI number to note name.
 * e.g. 60 -> "C4", 57 -> "A3"
 */
export function midiToNote(midi) {
  const octave = Math.floor(midi / 12) - 1;
  const name = NOTE_NAMES[midi % 12];
  return `${name}${octave}`;
}

/**
 * Generate an array of note names for a given root, mode, and octave range.
 *
 * @param {string} root - Root note name without octave (e.g. "D")
 * @param {string} mode - Mode name (e.g. "dorian")
 * @param {number} lowOctave - Lowest octave to include
 * @param {number} highOctave - Highest octave to include
 * @returns {string[]} Array of note names (e.g. ["D3", "E3", "F3", ...])
 */
export function getScaleNotes(root, mode, lowOctave = 3, highOctave = 5) {
  const intervals = MODES[mode];
  if (!intervals) return [];

  const rootIndex = NOTE_NAMES.indexOf(root);
  if (rootIndex === -1) return [];

  const notes = [];
  for (let octave = lowOctave; octave <= highOctave; octave++) {
    for (const interval of intervals) {
      const midi = (octave + 1) * 12 + rootIndex + interval;
      const note = midiToNote(midi);
      notes.push(note);
    }
  }
  return notes;
}

/**
 * Get chord tones (root, 3rd, 5th, 7th) from a scale.
 *
 * @param {string} root - Root note name without octave
 * @param {string} mode - Mode name
 * @param {number} octave - Octave for the chord
 * @returns {string[]} Array of 4 note names forming the chord
 */
export function getChordNotes(root, mode, octave = 4) {
  const intervals = MODES[mode];
  if (!intervals) return [];

  const rootIndex = NOTE_NAMES.indexOf(root);
  // Chord tones: scale degrees 1, 3, 5, 7 (indices 0, 2, 4, 6)
  const chordDegrees = [0, 2, 4, 6];
  return chordDegrees.map(degree => {
    const midi = (octave + 1) * 12 + rootIndex + intervals[degree];
    return midiToNote(midi);
  });
}

/**
 * Get the bass note (root, low octave).
 */
export function getBassNote(root, octave = 2) {
  return `${root}${octave}`;
}

// ── New functions for chord progressions ──

/**
 * Get the note name (without octave) for a specific scale degree.
 * @param {string} root - Root note name (e.g. 'D')
 * @param {string} mode - Mode name
 * @param {number} degreeIndex - 0-indexed scale degree (0=root, 1=2nd, etc.)
 * @returns {string} Note name without octave (e.g. 'F#')
 */
export function getScaleDegreeNote(root, mode, degreeIndex) {
  const intervals = MODES[mode];
  if (!intervals) return root;
  const rootIndex = NOTE_NAMES.indexOf(root);
  const semitones = intervals[degreeIndex % 7];
  return NOTE_NAMES[(rootIndex + semitones) % 12];
}

/**
 * Get scale notes as MIDI numbers across an octave range.
 * @returns {number[]}
 */
export function getScaleMidi(root, mode, lowOctave = 3, highOctave = 5) {
  const intervals = MODES[mode];
  if (!intervals) return [];
  const rootIndex = NOTE_NAMES.indexOf(root);
  const result = [];
  for (let octave = lowOctave; octave <= highOctave; octave++) {
    for (const interval of intervals) {
      result.push((octave + 1) * 12 + rootIndex + interval);
    }
  }
  return result;
}

/**
 * Build a 4-note 7th chord on any scale degree by stacking 3rds within the mode.
 *
 * @param {string} root - Scale root (e.g. 'D' for D dorian)
 * @param {string} mode - Mode name
 * @param {number} degreeIndex - 0-indexed degree to build chord on (0=I, 1=ii, etc.)
 * @param {number} octave - Base octave for the chord
 * @returns {string[]} 4 note names [chordRoot, 3rd, 5th, 7th]
 */
export function getDiatonicChord(root, mode, degreeIndex, octave = 4) {
  const intervals = MODES[mode];
  if (!intervals) return [];

  // Get 3 octaves of scale MIDI to avoid wraparound issues
  const allMidi = getScaleMidi(root, mode, octave - 1, octave + 1);
  const degreesPerOctave = 7;
  // Start from the middle octave's instance of our target degree
  const startIndex = degreesPerOctave + degreeIndex;

  // Stack 3rds: every other scale degree (0, 2, 4, 6 steps up the scale)
  return [0, 2, 4, 6].map(offset => {
    const idx = startIndex + offset;
    if (idx >= allMidi.length) return midiToNote(allMidi[allMidi.length - 1]);
    return midiToNote(allMidi[idx]);
  });
}

/**
 * Given a current voiced chord and a target chord in root position,
 * find the voicing of the target that minimizes total semitone movement.
 * This produces smooth, ambient voice leading.
 *
 * @param {string[]} currentVoicing - Currently sounding notes (e.g. ['D4','F#4','A4','C#5'])
 * @param {string[]} targetRootPosition - Target chord in root position
 * @returns {string[]} Voice-led target voicing
 */
export function voiceLead(currentVoicing, targetRootPosition) {
  if (!currentVoicing || currentVoicing.length === 0) return targetRootPosition;
  if (!targetRootPosition || targetRootPosition.length === 0) return targetRootPosition;

  const currentMidi = currentVoicing.map(noteToMidi);
  const targetMidi = targetRootPosition.map(noteToMidi);

  const voiced = targetMidi.map((target, i) => {
    const current = currentMidi[i] ?? currentMidi[0];
    // Try the note in 3 octaves, pick the one closest to current voice
    const candidates = [target - 12, target, target + 12];
    let best = target;
    let bestDist = Infinity;
    for (const c of candidates) {
      const dist = Math.abs(c - current);
      if (dist < bestDist) {
        best = c;
        bestDist = dist;
      }
    }
    return best;
  });

  // Clamp to reasonable range (C3=48 to C6=84)
  const clamped = voiced.map(midi => {
    while (midi < 48) midi += 12;
    while (midi > 84) midi -= 12;
    return midi;
  });

  return clamped.map(midiToNote);
}

/**
 * Get chord tones for a scale degree spread across an octave range.
 * Used by the arpeggio to know which notes are chord tones vs passing tones.
 *
 * @param {string} root - Scale root
 * @param {string} mode - Mode name
 * @param {number} degreeIndex - 0-indexed scale degree
 * @param {number} lowOctave
 * @param {number} highOctave
 * @returns {string[]} Chord tones across the range, sorted low to high
 */
export function getChordTonesForDegree(root, mode, degreeIndex, lowOctave = 3, highOctave = 5) {
  const intervals = MODES[mode];
  if (!intervals) return [];

  const rootIndex = NOTE_NAMES.indexOf(root);

  // The 4 chord tone degree indices (stacked 3rds from degreeIndex)
  const chordDegrees = [0, 2, 4, 6].map(offset => (degreeIndex + offset) % 7);
  const chordSemitones = new Set(chordDegrees.map(d => intervals[d]));

  const notes = [];
  for (let octave = lowOctave; octave <= highOctave; octave++) {
    for (const semi of chordSemitones) {
      const midi = (octave + 1) * 12 + rootIndex + semi;
      notes.push(midiToNote(midi));
    }
  }
  return notes.sort((a, b) => noteToMidi(a) - noteToMidi(b));
}

/**
 * Build a dominant 7th chord (major triad + minor 7th) on any root note.
 * Used for secondary dominants — these are chromatic chords, not diatonic.
 *
 * Intervals from root: 0 (root), 4 (M3), 7 (P5), 10 (m7)
 *
 * @param {string} rootName - Root note name without octave (e.g. 'G')
 * @param {number} octave - Base octave for the chord voicing
 * @returns {string[]} 4 note names [root, M3, P5, m7]
 */
export function buildDominant7Chord(rootName, octave = 4) {
  const rootIdx = NOTE_NAMES.indexOf(rootName);
  if (rootIdx === -1) return [];
  const baseM = (octave + 1) * 12 + rootIdx;
  return [
    midiToNote(baseM),       // root
    midiToNote(baseM + 4),   // major 3rd
    midiToNote(baseM + 7),   // perfect 5th
    midiToNote(baseM + 10),  // minor 7th
  ];
}

/**
 * Get all instances of notes with given semitone offsets from a root,
 * spread across an octave range. Used to populate `chordTones` for
 * non-diatonic chords (e.g. secondary dominants).
 *
 * @param {string} rootName - Root note name without octave (e.g. 'G')
 * @param {number[]} semitoneOffsets - Semitone intervals from root (e.g. [0,4,7,10] for dom7)
 * @param {number} lowOctave
 * @param {number} highOctave
 * @returns {string[]} All matching notes across the octave range, sorted low to high
 */
export function getChordTonesFromSemitones(rootName, semitoneOffsets, lowOctave = 3, highOctave = 5) {
  const rootIdx = NOTE_NAMES.indexOf(rootName);
  if (rootIdx === -1) return [];

  const notes = [];
  for (let octave = lowOctave; octave <= highOctave; octave++) {
    for (const offset of semitoneOffsets) {
      const midi = (octave + 1) * 12 + rootIdx + offset;
      notes.push(midiToNote(midi));
    }
  }
  return notes.sort((a, b) => noteToMidi(a) - noteToMidi(b));
}

export { MODES, MODE_SPECTRUM, NOTE_NAMES };
