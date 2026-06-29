import { describe, expect, it, vi } from 'vitest';

// generateProgression is pure, but progression.js imports 'tone' at module load.
// We don't exercise the Tone-backed player here, so an empty mock is enough.
vi.mock('tone', () => ({}));

import { generateProgression } from '../progression.js';
import { MODES, getScaleNotes, getDiatonicChord } from '../scale.js';

const NEW_GRAMMARS = ['glacial', 'radiant', 'tempest', 'monsoon', 'arid'];
const NEW_SCALES = ['phrygian', 'phrygianDominant', 'doubleHarmonic', 'harmonicMajor'];

function assertValidProgression(prog) {
  expect(prog).toHaveProperty('harmonicRhythm');
  expect(prog.chords.length).toBeGreaterThan(0);
  for (const chord of prog.chords) {
    expect(Array.isArray(chord.notes)).toBe(true);
    expect(chord.notes.length).toBeGreaterThan(0);
    // Diatonic chords carry a degree 1–7; secondary dominants are null.
    if (chord.degree != null) {
      expect(chord.degree).toBeGreaterThanOrEqual(1);
      expect(chord.degree).toBeLessThanOrEqual(7);
    }
  }
}

describe('soundworld grammars', () => {
  it('each new grammar produces a valid progression', () => {
    for (const grammar of NEW_GRAMMARS) {
      const prog = generateProgression('C', 'aeolian', 'clear', 0.5, 0, { grammar });
      assertValidProgression(prog);
    }
  });

  it('an unknown grammar falls back to weather-derived mood', () => {
    const prog = generateProgression('C', 'ionian', 'clear', 0.5, 0, { grammar: 'does-not-exist' });
    assertValidProgression(prog);
  });

  it('omitting the grammar preserves default behavior', () => {
    const prog = generateProgression('D', 'dorian', 'rain', 0.5, 0);
    assertValidProgression(prog);
  });

  it('grammars work with exotic scales (arid + phrygian dominant)', () => {
    const prog = generateProgression('C', 'phrygianDominant', 'clear', 0.5, 0, { grammar: 'arid' });
    assertValidProgression(prog);
  });
});

describe('exotic scale library', () => {
  it('registers the new 7-note scales', () => {
    for (const scale of NEW_SCALES) {
      expect(MODES[scale]).toBeDefined();
      expect(MODES[scale].length).toBe(7); // keeps diatonic chord machinery valid
    }
  });

  it('phrygian dominant has the expected intervals', () => {
    expect(MODES.phrygianDominant).toEqual([0, 1, 4, 5, 7, 8, 10]);
  });

  it('getScaleNotes yields seven notes per octave for a new scale', () => {
    const notes = getScaleNotes('C', 'phrygianDominant', 4, 4);
    expect(notes).toEqual(['C4', 'C#4', 'E4', 'F4', 'G4', 'G#4', 'A#4']);
  });

  it('getDiatonicChord builds a 4-note chord on a new scale', () => {
    const chord = getDiatonicChord('C', 'phrygianDominant', 0, 4);
    expect(chord.length).toBe(4);
    chord.forEach((n) => expect(typeof n).toBe('string'));
  });
});
