/**
 * Frigid Night — crystalline, sparse, sub-zero stillness.
 * Drone + cold pad + sparse choir + wind chimes; no arpeggio or percussion.
 */
export default {
  id: 'frigid-night',
  name: 'Frigid Night',
  blurb: 'Crystalline, sparse, sub-zero stillness',
  match(ctx) {
    const t = ctx.apparentTemperature ?? ctx.temperature ?? 10;
    if (t >= 5) return 0; // only genuinely cold conditions
    let s = t < 0 ? 0.5 : 0.25;
    if (ctx.isNight) s += 0.3;
    if (ctx.category === 'snow') s += 0.15;
    if (ctx.biome === 'arctic') s += 0.2;
    return s;
  },
  voices: { arpeggio: false, percussion: false },
  overrides: {
    scalePool: ['aeolian', 'harmonicMinor', 'phrygian'],
    grammar: 'glacial',
    timbreProfile: 'cold',
    melodyMood: 'sparse',
    noiseType: 'white',
  },
  form: { personality: 'meditative' },
  paramOverrides(p) {
    p.bpm = Math.max(50, p.bpm - 10);
    p.reverbDecay = Math.min(15, p.reverbDecay * 1.3);
    p.reverbWet = Math.min(0.85, p.reverbWet + 0.1);
    p.padSpread = Math.max(8, p.padSpread - 4); // tight, icy
    return p;
  },
};
