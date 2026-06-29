/**
 * Snowfall — hushed, ethereal, daytime snow.
 * White-noise hush, ethereal arpeggio, ghost percussion suppressed, soft pad.
 */
export default {
  id: 'snowfall',
  name: 'Snowfall',
  blurb: 'Hushed, ethereal, drifting flakes',
  match(ctx) {
    const t = ctx.apparentTemperature ?? ctx.temperature ?? 0;
    if (ctx.category !== 'snow') return 0;
    let s = 0.5;
    if (!ctx.isNight) s += 0.15; // deep cold at night leans toward Frigid Night
    if (t >= -5 && t < 2) s += 0.2;
    return s;
  },
  voices: { percussion: false },
  overrides: {
    scalePool: ['dorian', 'aeolian'],
    grammar: 'sparse',
    timbreProfile: 'cold',
    melodyMood: 'sparse',
    noiseType: 'white',
    arpeggioRhythmPattern: 'ethereal',
  },
  form: { personality: 'meditative' },
  paramOverrides(p) {
    p.bpm = Math.max(50, p.bpm - 6);
    p.padBrightness = Math.min(0.95, p.padBrightness + 0.05);
    return p;
  },
};
