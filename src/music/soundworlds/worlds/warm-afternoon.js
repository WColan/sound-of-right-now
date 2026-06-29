/**
 * Warm Afternoon — radiant, lush, lydian/ionian daylight.
 * Fat warm pad, flowing arpeggio + melody, light pulse percussion, deep chorus.
 */
export default {
  id: 'warm-afternoon',
  name: 'Warm Afternoon',
  blurb: 'Radiant, lush, sun-warmed daylight',
  match(ctx) {
    const t = ctx.apparentTemperature ?? ctx.temperature ?? 0;
    if (ctx.isNight || t < 18) return 0; // a genuinely warm daytime
    let s = t >= 24 ? 0.6 : 0.4;
    if (ctx.category === 'clear') s += 0.2;
    else if (ctx.category === 'cloudy') s += 0.1;
    if (ctx.season === 'summer') s += 0.15;
    return s;
  },
  overrides: {
    scalePool: ['lydian', 'ionian', 'mixolydian'],
    grammar: 'radiant',
    timbreProfile: 'warm',
    melodyMood: 'gentle',
    arpeggioRhythmPattern: 'flowing',
    percussionPattern: 'pulse',
  },
  form: { personality: 'contemplative' },
  paramOverrides(p) {
    p.chorusDepth = Math.min(0.9, (p.chorusDepth ?? 0.5) + 0.15);
    p.padBrightness = Math.min(0.95, p.padBrightness + 0.08);
    return p;
  },
};
