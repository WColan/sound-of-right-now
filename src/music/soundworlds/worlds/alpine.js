/**
 * Alpine — vast, open, high-altitude air.
 * Lydian openness, prominent drone + choir, enormous reverb, sparse motion.
 */
export default {
  id: 'alpine',
  name: 'Alpine',
  blurb: 'Vast, open, thin mountain air',
  match(ctx) {
    let s = 0;
    if (ctx.biome === 'mountain') s += 0.4;
    if ((ctx.elevation ?? 0) > 1500) s += 0.3;
    if ((ctx.elevation ?? 0) > 2500) s += 0.1;
    return s;
  },
  overrides: {
    scalePool: ['lydian', 'ionian', 'dorian'],
    grammar: 'sparse',
    timbreProfile: 'cool',
    melodyMood: 'suspended',
    arpeggioRhythmPattern: 'ethereal',
    percussionPattern: 'minimal',
  },
  form: { personality: 'meditative' },
  paramOverrides(p) {
    p.reverbDecay = Math.min(15, p.reverbDecay * 1.35);
    p.reverbWet = Math.min(0.85, p.reverbWet + 0.1);
    return p;
  },
};
