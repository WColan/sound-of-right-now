/**
 * Monsoon — flowing, restless, warm rain.
 * Rippling arpeggio, prominent rain texture, dripping percussion, modal motion.
 */
export default {
  id: 'monsoon',
  name: 'Monsoon',
  blurb: 'Flowing, restless, warm rain',
  match(ctx) {
    const t = ctx.apparentTemperature ?? ctx.temperature ?? 0;
    if (ctx.category !== 'rain' && ctx.category !== 'drizzle') return 0;
    if (t < 14) return 0; // cooler rain stays in the default world
    let s = ctx.category === 'rain' ? 0.4 : 0.3;
    if (t >= 20) s += 0.15;
    if ((ctx.humidity ?? 0) > 75) s += 0.2;
    if (ctx.biome === 'tropical') s += 0.2;
    return s;
  },
  overrides: {
    scalePool: ['dorian', 'mixolydian'],
    grammar: 'monsoon',
    timbreProfile: 'warm',
    melodyMood: 'gentle',
    noiseType: 'pink',
    arpeggioRhythmPattern: 'rippling',
    percussionPattern: 'dripping',
  },
  form: { personality: 'restless' },
  paramOverrides(p) {
    p.textureVolume = Math.min(-8, p.textureVolume + 3);
    return p;
  },
};
