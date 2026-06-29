/**
 * Tropical Night — lush, humid, gentle nocturne.
 * Choir + wind chimes forward, warm timbre, flowing arpeggio, soft pulse.
 */
export default {
  id: 'tropical-night',
  name: 'Tropical Night',
  blurb: 'Lush, humid, gentle nocturne',
  match(ctx) {
    const t = ctx.apparentTemperature ?? ctx.temperature ?? 0;
    if (!ctx.isNight || t < 16) return 0; // a warm night
    let s = 0.25;
    if (ctx.biome === 'tropical') s += 0.35;
    if (t >= 22) s += 0.2;
    if ((ctx.humidity ?? 0) > 70) s += 0.1;
    return s;
  },
  overrides: {
    scalePool: ['dorian', 'mixolydian', 'lydian'],
    grammar: 'gentle',
    timbreProfile: 'warm',
    melodyMood: 'gentle',
    arpeggioRhythmPattern: 'flowing',
    percussionPattern: 'pulse',
  },
  form: { personality: 'contemplative' },
  paramOverrides(p) {
    p.choirVolume = Math.min(-8, (p.choirVolume ?? -18) + 3);
    p.chorusDepth = Math.min(0.9, (p.chorusDepth ?? 0.5) + 0.1);
    return p;
  },
};
