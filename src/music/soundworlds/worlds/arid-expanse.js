/**
 * Arid Expanse — dry, exotic, shimmering desert.
 * Phrygian-dominant color, wide arpeggio, almost no reverb, heat-shimmer detune.
 */
export default {
  id: 'arid-expanse',
  name: 'Arid Expanse',
  blurb: 'Dry, exotic, shimmering desert air',
  match(ctx) {
    const t = ctx.apparentTemperature ?? ctx.temperature ?? 0;
    let s = 0;
    if (ctx.biome === 'desert') s += 0.5;
    if (t >= 28) s += 0.3;
    if (s === 0) return 0; // neither a desert nor genuinely hot → leave to others
    if ((ctx.humidity ?? 100) < 35) s += 0.15;
    if (ctx.category === 'clear') s += 0.1;
    return s;
  },
  voices: { choir: false },
  overrides: {
    scalePool: ['phrygianDominant', 'phrygian', 'mixolydian'],
    grammar: 'arid',
    timbreProfile: 'cool',
    melodyMood: 'gentle',
    arpeggioRhythmPattern: 'flowing',
    percussionPattern: 'minimal',
  },
  form: { personality: 'contemplative' },
  paramOverrides(p) {
    p.reverbWet = Math.max(0.05, p.reverbWet * 0.5);
    p.reverbDecay = Math.max(1.5, p.reverbDecay * 0.7);
    p.arpeggioWidth = Math.min(1, (p.arpeggioWidth ?? 0.5) + 0.2);
    p.padSpread = Math.min(45, p.padSpread + 8); // heat shimmer
    return p;
  },
};
