import { describe, expect, it } from 'vitest';
import {
  DEFAULT_RECIPE, mergeRecipe, applyRecipeToParams, MUTED_DB, VOICE_VOLUME_PARAMS,
} from './recipe.js';

function baseParams() {
  return {
    rootNote: 'C',
    scaleType: 'ionian',
    bpm: 80,
    padVolume: -16,
    arpeggioVolume: -18,
    bassVolume: -14,
    melodyVolume: -20,
    textureVolume: -24,
    percussionVolume: -22,
    droneVolume: -30,
    windChimeVolume: -16,
    choirVolume: -18,
    reverbDecay: 4,
    reverbWet: 0.3,
    chorusDepth: 0.5,
    padBrightness: 0.5,
    padSpread: 15,
    grammar: null,
  };
}

describe('mergeRecipe', () => {
  it('fills in missing fields from the default recipe', () => {
    const merged = mergeRecipe({ id: 'x', name: 'X' });
    expect(merged.voices.pad).toBe(true);          // from default
    expect(merged.overrides).toEqual({});          // from default
    expect(typeof merged.match).toBe('function');
    expect(typeof merged.paramOverrides).toBe('function');
  });

  it('merges partial voices over the default (others stay enabled)', () => {
    const merged = mergeRecipe({ voices: { arpeggio: false } });
    expect(merged.voices.arpeggio).toBe(false);
    expect(merged.voices.pad).toBe(true);
    expect(merged.voices.choir).toBe(true);
  });

  it('keeps a provided match and paramOverrides', () => {
    const match = () => 0.9;
    const paramOverrides = (p) => p;
    const merged = mergeRecipe({ match, paramOverrides });
    expect(merged.match).toBe(match);
    expect(merged.paramOverrides).toBe(paramOverrides);
  });
});

describe('applyRecipeToParams', () => {
  it('is an identity transform for the default recipe', () => {
    const params = baseParams();
    const out = applyRecipeToParams(params, mergeRecipe(DEFAULT_RECIPE));
    expect(out).toEqual(params);
  });

  it('silences disabled voices via their volume params', () => {
    const recipe = mergeRecipe({ voices: { arpeggio: false, percussion: false } });
    const out = applyRecipeToParams(baseParams(), recipe);
    expect(out.arpeggioVolume).toBe(MUTED_DB);
    expect(out.percussionVolume).toBe(MUTED_DB);
    // Enabled voices are untouched
    expect(out.padVolume).toBe(-16);
  });

  it('maps every voice name to a real volume param', () => {
    for (const param of Object.values(VOICE_VOLUME_PARAMS)) {
      expect(baseParams()).toHaveProperty(param);
    }
  });

  it('applies discrete overrides (grammar, timbre, mood, patterns)', () => {
    const recipe = mergeRecipe({
      overrides: {
        grammar: 'glacial',
        timbreProfile: 'cold',
        melodyMood: 'sparse',
        noiseType: 'white',
        arpeggioRhythmPattern: 'ethereal',
        percussionPattern: 'ghost',
      },
    });
    const out = applyRecipeToParams(baseParams(), recipe);
    expect(out.grammar).toBe('glacial');
    expect(out.timbreProfile).toBe('cold');
    expect(out.melodyMood).toBe('sparse');
    expect(out.noiseType).toBe('white');
    expect(out.arpeggioRhythmPattern).toBe('ethereal');
    expect(out.percussionPattern).toBe('ghost');
  });

  it('constrains scaleType to the scale pool only when outside it', () => {
    const inPool = mergeRecipe({ overrides: { scalePool: ['ionian', 'lydian'] } });
    expect(applyRecipeToParams(baseParams(), inPool).scaleType).toBe('ionian'); // kept

    const outOfPool = mergeRecipe({ overrides: { scalePool: ['phrygianDominant', 'phrygian'] } });
    expect(applyRecipeToParams(baseParams(), outOfPool).scaleType).toBe('phrygianDominant');
  });

  it('runs paramOverrides last for numeric fine-tuning', () => {
    const recipe = mergeRecipe({
      paramOverrides: (p) => { p.reverbWet = 0.05; p.bpm = p.bpm - 10; return p; },
    });
    const out = applyRecipeToParams(baseParams(), recipe);
    expect(out.reverbWet).toBe(0.05);
    expect(out.bpm).toBe(70);
  });

  it('returns params unchanged when no recipe is given', () => {
    const params = baseParams();
    expect(applyRecipeToParams(params, null)).toBe(params);
  });
});
