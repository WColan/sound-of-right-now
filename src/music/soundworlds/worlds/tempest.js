/**
 * Tempest — driving, chromatic, dramatic storm.
 * Driving percussion, brown-noise texture, sub-bass, stormy saw pad.
 */
export default {
  id: 'tempest',
  name: 'Tempest',
  blurb: 'Driving, chromatic, electric storm',
  match(ctx) {
    if (ctx.category !== 'storm') return 0;
    let s = 0.9;
    if ((ctx.windSpeed ?? 0) > 35) s += 0.1;
    return s;
  },
  overrides: {
    scalePool: ['harmonicMinor', 'aeolian', 'phrygian'],
    grammar: 'tempest',
    timbreProfile: 'stormy',
    melodyMood: 'tense',
    noiseType: 'brown',
    arpeggioRhythmPattern: 'cascading',
    percussionPattern: 'driving',
  },
  form: { personality: 'dramatic' },
  paramOverrides(p) {
    p.subBassGain = Math.min(0.7, (p.subBassGain ?? 0.4) + 0.1);
    p.delayFeedback = Math.min(0.5, (p.delayFeedback ?? 0.2) + 0.08);
    return p;
  },
};
