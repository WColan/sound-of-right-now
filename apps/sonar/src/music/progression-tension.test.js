import { describe, expect, it } from 'vitest';
import { blendWeights, generateProgression } from './progression.js';

// ── blendWeights ────────────────────────────────────────────────────
describe('blendWeights', () => {
  const weightsA = {
    1: { 1: 0, 2: 1, 3: 2, 4: 8, 5: 6, 6: 4, 7: 1 },
    2: { 1: 3, 2: 0, 3: 1, 4: 2, 5: 5, 6: 1, 7: 1 },
  };

  const weightsB = {
    1: { 1: 0, 2: 4, 3: 3, 4: 4, 5: 4, 6: 3, 7: 4 },
    2: { 1: 3, 2: 0, 3: 3, 4: 2, 5: 5, 6: 3, 7: 3 },
  };

  it('at t=0, output equals weightsA exactly', () => {
    const result = blendWeights(weightsA, weightsB, 0);
    expect(result).toBe(weightsA); // Same reference
  });

  it('at t=1, output equals weightsB exactly', () => {
    const result = blendWeights(weightsA, weightsB, 1);
    expect(result).toBe(weightsB); // Same reference
  });

  it('at t=0.5, output is average of weightsA and weightsB', () => {
    const result = blendWeights(weightsA, weightsB, 0.5);
    // degree 1, target 2: A=1, B=4, average=2.5
    expect(result[1][2]).toBeCloseTo(2.5);
    // degree 1, target 4: A=8, B=4, average=6
    expect(result[1][4]).toBeCloseTo(6);
    // degree 2, target 3: A=1, B=3, average=2
    expect(result[2][3]).toBeCloseTo(2);
  });

  it('all weights are >= 0', () => {
    const result = blendWeights(weightsA, weightsB, 0.5);
    for (const degree of Object.keys(result)) {
      for (const target of Object.keys(result[degree])) {
        expect(result[degree][target]).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it('clamps t below 0 to 0', () => {
    const result = blendWeights(weightsA, weightsB, -0.5);
    expect(result).toBe(weightsA);
  });

  it('clamps t above 1 to 1', () => {
    const result = blendWeights(weightsA, weightsB, 1.5);
    expect(result).toBe(weightsB);
  });

  it('interpolates linearly at t=0.25', () => {
    const result = blendWeights(weightsA, weightsB, 0.25);
    // degree 1, target 2: A=1, B=4, at 0.25 = 1 + (4-1)*0.25 = 1.75
    expect(result[1][2]).toBeCloseTo(1.75);
  });
});

// ── tensionLevel in generateProgression ─────────────────────────────
describe('generateProgression with tensionLevel', () => {
  it('tensionLevel=0 produces same structure as before (backward compat)', () => {
    const prog = generateProgression('C', 'ionian', 'clear', 0.5, 0);
    expect(prog).toBeDefined();
    expect(prog.chords.length).toBeGreaterThanOrEqual(3);
    expect(prog.harmonicRhythm).toBeTruthy();
  });

  it('tensionLevel=0 uses weather mood length range', () => {
    // 'clear' → calm → {min:4, max:6}
    // Run many times to verify length stays in calm range
    for (let i = 0; i < 30; i++) {
      const prog = generateProgression('C', 'ionian', 'clear', 0.5, 0);
      // calm base: 4-6, but secondary dominants can add more chords
      // So we check the diatonic chord count is within range
      const diatonicCount = prog.chords.filter(c => !c.isSecondaryDominant).length;
      expect(diatonicCount).toBeGreaterThanOrEqual(4);
      expect(diatonicCount).toBeLessThanOrEqual(6);
    }
  });

  it('tensionLevel=1 produces longer progressions (blended toward tense range)', () => {
    // tense → {min:6, max:10}
    // At tensionLevel=1, calm lengths blend fully to tense lengths
    const lengths = [];
    for (let i = 0; i < 50; i++) {
      const prog = generateProgression('C', 'ionian', 'clear', 0.5, 1);
      const diatonicCount = prog.chords.filter(c => !c.isSecondaryDominant).length;
      lengths.push(diatonicCount);
    }
    const avgLength = lengths.reduce((a, b) => a + b, 0) / lengths.length;
    // At tension=1, min=6, max=10. Average should be around 8.
    expect(avgLength).toBeGreaterThan(6);
  });

  it('higher tension increases secondary dominant count (statistical)', () => {
    let lowTensionSecDoms = 0;
    let highTensionSecDoms = 0;
    const runs = 100;

    for (let i = 0; i < runs; i++) {
      const lowProg = generateProgression('C', 'ionian', 'clear', 0.5, 0);
      lowTensionSecDoms += lowProg.chords.filter(c => c.isSecondaryDominant).length;

      const highProg = generateProgression('C', 'ionian', 'clear', 0.5, 0.8);
      highTensionSecDoms += highProg.chords.filter(c => c.isSecondaryDominant).length;
    }

    // Higher tension should produce more secondary dominants on average
    expect(highTensionSecDoms).toBeGreaterThan(lowTensionSecDoms);
  });

  it('generated chords are valid regardless of tension level', () => {
    for (const tension of [0, 0.25, 0.5, 0.75, 1]) {
      const prog = generateProgression('D', 'dorian', 'rain', 0.3, tension);
      for (const chord of prog.chords) {
        expect(chord.notes).toBeDefined();
        expect(chord.notes.length).toBeGreaterThan(0);
        expect(chord.bassNote).toBeDefined();
        expect(chord.chordTones).toBeDefined();
        expect(chord.scaleTones).toBeDefined();
      }
    }
  });

  it('default tensionLevel parameter is 0 (omitting it works)', () => {
    // Calling without tension param should work (backward compat)
    const prog = generateProgression('E', 'aeolian', 'cloudy', 0.5);
    expect(prog).toBeDefined();
    expect(prog.chords.length).toBeGreaterThanOrEqual(3);
  });
});
