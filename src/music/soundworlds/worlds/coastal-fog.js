/**
 * Coastal Fog — suspended, cavernous, blurred.
 * Drone + pad + choir in a huge reverb; no arpeggio or percussion.
 */
export default {
  id: 'coastal-fog',
  name: 'Coastal Fog',
  blurb: 'Suspended, cavernous, blurred horizons',
  match(ctx) {
    if (ctx.category !== 'fog') return 0;
    let s = 0.6;
    if (ctx.biome === 'coastal') s += 0.25;
    if ((ctx.humidity ?? 0) > 80) s += 0.1;
    return s;
  },
  voices: { arpeggio: false, percussion: false },
  overrides: {
    scalePool: ['dorian', 'aeolian'],
    grammar: 'suspended',
    timbreProfile: 'cool',
    melodyMood: 'suspended',
    noiseType: 'pink',
  },
  form: { personality: 'meditative' },
  paramOverrides(p) {
    p.reverbDecay = Math.min(15, p.reverbDecay * 1.4);
    p.reverbWet = Math.min(0.85, p.reverbWet + 0.15);
    p.padSpread = Math.min(45, p.padSpread + 6);
    return p;
  },
};
