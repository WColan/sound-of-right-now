import { describe, it, expect } from 'vitest';
import { arrangeStage, createStageState, MAX_FOREGROUND, MIN_HOLD_MS, SPOTLIGHT_DUCK_DB } from './stage.js';
import { SECTION_IDS } from './score.js';

function scoreWith(saliences) {
  const sections = Object.fromEntries(SECTION_IDS.map((id) => [id, { on: false, level: 0, salience: 0 }]));
  for (const [id, sal] of Object.entries(saliences)) sections[id] = { on: true, level: 0.5, salience: sal };
  return { sections };
}

describe('stage', () => {
  it('features at most three sections, one per zone', () => {
    const st = arrangeStage(scoreWith({ winds: 0.9, horns: 0.8, moon: 0.7, aurora: 0.95, ocean: 0.6, strings: 0.2 }), createStageState(), 0);
    expect(st.foreground.length).toBeLessThanOrEqual(MAX_FOREGROUND);
    expect(st.foreground).toContain('aurora');
    expect(st.foreground).toContain('winds');
    expect(st.foreground).not.toContain('horns'); // same zone as winds
    expect(st.foreground).not.toContain('moon');  // same zone as aurora
  });

  it('silent sections get no gain; bed sections sit below featured ones', () => {
    const st = arrangeStage(scoreWith({ winds: 0.9, strings: 0.1 }), createStageState(), 0);
    expect(st.roles.iss).toBe('silent');
    expect(st.roles.strings).toBe('bed');
    expect(st.gainDb.winds).toBeGreaterThan(st.gainDb.strings);
  });

  it('holds a featured section for a minimum time (no flicker)', () => {
    const t0 = 1_000_000;
    const first = arrangeStage(scoreWith({ winds: 0.9, horns: 0.3 }), createStageState(), t0);
    const soon = arrangeStage(scoreWith({ winds: 0.25, horns: 0.6 }), first, t0 + 10_000);
    expect(soon.foreground).toContain('winds');
    const later = arrangeStage(scoreWith({ winds: 0.25, horns: 0.6 }), soon, t0 + MIN_HOLD_MS + 1);
    expect(later.foreground).toContain('horns');
    expect(later.foreground).not.toContain('winds');
  });

  it('a spotlight ducks everything else, the harmonic bed only half as much', () => {
    const st = arrangeStage(scoreWith({ winds: 0.9, strings: 0.1, earth: 0.3 }), createStageState(), 0, { id: 'earth', until: 5000 });
    expect(st.spotlight.id).toBe('earth');
    expect(st.gainDb.winds).toBeLessThan(0);
    expect(st.gainDb.strings - (-2)).toBeCloseTo(SPOTLIGHT_DUCK_DB / 2);
    const expired = arrangeStage(scoreWith({ winds: 0.9 }), st, 6000, { id: 'earth', until: 5000 });
    expect(expired.spotlight).toBeNull();
  });
});
