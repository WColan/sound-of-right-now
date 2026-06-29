import { describe, expect, it, vi, beforeEach } from 'vitest';
import {
  CONDUCTOR_ENABLED,
  PERSONALITIES,
  WEATHER_PERSONALITY,
  PHASE_TEMPLATE,
  PHASE_ORDER,
  smoothstep,
  computeIntensity,
  getPhaseAtProgress,
  createMovementConductor,
} from './movement.js';

// ── smoothstep ──────────────────────────────────────────────────────
describe('smoothstep', () => {
  it('returns 0 at t=0', () => {
    expect(smoothstep(0)).toBe(0);
  });

  it('returns 1 at t=1', () => {
    expect(smoothstep(1)).toBe(1);
  });

  it('returns 0.5 at t=0.5', () => {
    expect(smoothstep(0.5)).toBe(0.5);
  });

  it('clamps values below 0', () => {
    expect(smoothstep(-0.5)).toBe(0);
  });

  it('clamps values above 1', () => {
    expect(smoothstep(1.5)).toBe(1);
  });

  it('produces monotonically increasing output for increasing input', () => {
    let prev = 0;
    for (let t = 0; t <= 1; t += 0.05) {
      const val = smoothstep(t);
      expect(val).toBeGreaterThanOrEqual(prev);
      prev = val;
    }
  });
});

// ── computeIntensity ────────────────────────────────────────────────
describe('computeIntensity', () => {
  it('starts near 0.15 at t=0 (breathing start)', () => {
    const val = computeIntensity(0, 1.0);
    expect(val).toBeCloseTo(0.15, 1);
  });

  it('reaches near peakIntensity during climax (t≈0.65)', () => {
    const val = computeIntensity(0.65, 1.0);
    expect(val).toBeGreaterThan(0.85);
  });

  it('falls near 0.03 at t=1 (stillness end)', () => {
    const val = computeIntensity(1.0, 1.0);
    expect(val).toBeCloseTo(0.03, 2);
  });

  it('is always >= 0 and <= peakIntensity for all t', () => {
    for (let t = 0; t <= 1; t += 0.01) {
      const val = computeIntensity(t, 0.7);
      expect(val).toBeGreaterThanOrEqual(0);
      expect(val).toBeLessThanOrEqual(0.7 + 0.01); // tiny float tolerance
    }
  });

  it('scales output with peakScale', () => {
    const full = computeIntensity(0.65, 1.0);
    const half = computeIntensity(0.65, 0.5);
    expect(half).toBeCloseTo(full * 0.5, 1);
  });

  it('handles out-of-range t gracefully', () => {
    expect(computeIntensity(-1, 1.0)).toBeGreaterThanOrEqual(0);
    expect(computeIntensity(2, 1.0)).toBeGreaterThanOrEqual(0);
    expect(computeIntensity(2, 1.0)).toBeLessThanOrEqual(1);
  });

  it('has a rising arc from breathing through building', () => {
    const breathing = computeIntensity(0.05, 1.0);
    const stirring = computeIntensity(0.30, 1.0);
    const building = computeIntensity(0.50, 1.0);
    expect(stirring).toBeGreaterThan(breathing);
    expect(building).toBeGreaterThan(stirring);
  });

  it('has a falling arc from climax through stillness', () => {
    const climax = computeIntensity(0.65, 1.0);
    const descent = computeIntensity(0.80, 1.0);
    const stillness = computeIntensity(0.95, 1.0);
    expect(descent).toBeLessThan(climax);
    expect(stillness).toBeLessThan(descent);
  });

  it('creates a pronounced contrast around the climax peak', () => {
    const prePeak = computeIntensity(0.59, 1.0);
    const peak = computeIntensity(0.64, 1.0);
    const postPeak = computeIntensity(0.71, 1.0);

    expect(peak - prePeak).toBeGreaterThan(0.07);
    expect(peak - postPeak).toBeGreaterThan(0.15);
  });
});

// ── getPhaseAtProgress ──────────────────────────────────────────────
describe('getPhaseAtProgress', () => {
  it('returns "breathing" at t=0', () => {
    expect(getPhaseAtProgress(0)).toBe('breathing');
  });

  it('returns "stirring" at t=0.3', () => {
    expect(getPhaseAtProgress(0.3)).toBe('stirring');
  });

  it('returns "building" at t=0.5', () => {
    expect(getPhaseAtProgress(0.5)).toBe('building');
  });

  it('returns "climax" at t=0.65', () => {
    expect(getPhaseAtProgress(0.65)).toBe('climax');
  });

  it('returns "descent" at t=0.8', () => {
    expect(getPhaseAtProgress(0.8)).toBe('descent');
  });

  it('returns "stillness" at t=0.95', () => {
    expect(getPhaseAtProgress(0.95)).toBe('stillness');
  });

  it('returns "stillness" at t=1.0', () => {
    expect(getPhaseAtProgress(1.0)).toBe('stillness');
  });

  it('clamps negative t to "breathing"', () => {
    expect(getPhaseAtProgress(-0.5)).toBe('breathing');
  });

  it('clamps t > 1 to "stillness"', () => {
    expect(getPhaseAtProgress(1.5)).toBe('stillness');
  });
});

// ── createMovementConductor ─────────────────────────────────────────
describe('createMovementConductor', () => {
  let conductor;

  beforeEach(() => {
    conductor = createMovementConductor();
    // Mock performance.now for deterministic timing
    vi.spyOn(performance, 'now');
  });

  describe('lifecycle', () => {
    it('starts paused', () => {
      expect(conductor.isPaused).toBe(true);
    });

    it('starts first movement on resume()', () => {
      performance.now.mockReturnValue(0);
      conductor.resume();
      expect(conductor.isPaused).toBe(false);
      expect(conductor.movementNumber).toBe(1);
    });

    it('pause() freezes elapsed time', () => {
      performance.now.mockReturnValue(0);
      conductor.resume();

      performance.now.mockReturnValue(5000); // 5 seconds
      conductor.tick();
      const elapsed1 = conductor.elapsed;

      conductor.pause();

      performance.now.mockReturnValue(15000); // 10 more seconds while paused
      conductor.tick(); // Should be no-op

      expect(conductor.elapsed).toBe(elapsed1);
    });

    it('resume() continues from paused time', () => {
      performance.now.mockReturnValue(0);
      conductor.resume();

      performance.now.mockReturnValue(5000);
      conductor.tick();
      const elapsed1 = conductor.elapsed;

      conductor.pause();
      performance.now.mockReturnValue(50000); // Big gap while paused

      conductor.resume();
      performance.now.mockReturnValue(55000); // 5 more seconds after resume
      conductor.tick();

      // Should be approximately elapsed1 + 5 seconds
      expect(conductor.elapsed).toBeCloseTo(elapsed1 + 5, 0);
    });

    it('reset() zeroes everything', () => {
      conductor.resume();
      performance.now.mockReturnValue(0);
      conductor.tick();
      performance.now.mockReturnValue(10000);
      conductor.tick();

      conductor.reset();

      expect(conductor.movementNumber).toBe(0);
      expect(conductor.elapsed).toBe(0);
      expect(conductor.isPaused).toBe(true);
      expect(conductor.personalityName).toBe('');
    });
  });

  describe('expression dimensions', () => {
    it('returns all-zero expression when conductor not started', () => {
      const expr = conductor.getExpression();
      expect(expr.intensity).toBe(0);
      expect(expr.dynamicSwell).toBe(0);
      expect(expr.harmonicTension).toBe(0);
      expect(expr.rhythmicEnergy).toBe(0);
      expect(expr.melodicUrgency).toBe(0);
      expect(expr.effectDepth).toBe(0);
    });

    it('all dimensions are clamped 0–1', () => {
      performance.now.mockReturnValue(0);
      conductor.resume();
      conductor.tick();

      // Run through the whole arc
      const duration = conductor.duration;
      for (let sec = 0; sec <= duration; sec += duration / 50) {
        performance.now.mockReturnValue(sec * 1000);
        conductor.tick();
        const expr = conductor.getExpression();

        for (const [key, val] of Object.entries(expr)) {
          expect(val, `${key} at ${sec}s`).toBeGreaterThanOrEqual(0);
          expect(val, `${key} at ${sec}s`).toBeLessThanOrEqual(1);
        }
      }
    });

    it('harmonicTension leads dynamicSwell (peaks earlier)', () => {
      conductor.setPersonalityOverride('dramatic'); // Full peak intensity
      performance.now.mockReturnValue(0);
      conductor.resume();
      conductor.tick();

      const duration = conductor.duration;
      let peakSwell = { time: 0, val: 0 };
      let peakTension = { time: 0, val: 0 };

      for (let frac = 0; frac <= 1; frac += 0.01) {
        performance.now.mockReturnValue(frac * duration * 1000);
        conductor.tick();
        const expr = conductor.getExpression();

        if (expr.dynamicSwell > peakSwell.val) {
          peakSwell = { time: frac, val: expr.dynamicSwell };
        }
        if (expr.harmonicTension > peakTension.val) {
          peakTension = { time: frac, val: expr.harmonicTension };
        }
      }

      // harmonicTension should peak at same time or earlier than dynamicSwell
      expect(peakTension.time).toBeLessThanOrEqual(peakSwell.time + 0.02);
    });

    it('effectDepth trails dynamicSwell (peaks later)', () => {
      conductor.setPersonalityOverride('dramatic');
      performance.now.mockReturnValue(0);
      conductor.resume();
      conductor.tick();

      const duration = conductor.duration;
      let peakSwell = { time: 0, val: 0 };
      let peakEffect = { time: 0, val: 0 };

      for (let frac = 0; frac <= 1; frac += 0.01) {
        performance.now.mockReturnValue(frac * duration * 1000);
        conductor.tick();
        const expr = conductor.getExpression();

        if (expr.dynamicSwell > peakSwell.val) {
          peakSwell = { time: frac, val: expr.dynamicSwell };
        }
        if (expr.effectDepth > peakEffect.val) {
          peakEffect = { time: frac, val: expr.effectDepth };
        }
      }

      // effectDepth should peak at same time or later than dynamicSwell
      expect(peakEffect.time).toBeGreaterThanOrEqual(peakSwell.time - 0.02);
    });

    it('rhythmicEnergy is scaled by personality.rhythmFocus', () => {
      // Meditative has low rhythmFocus (0.1)
      conductor.setPersonalityOverride('meditative');
      performance.now.mockReturnValue(0);
      conductor.resume();
      conductor.tick();

      // Advance to climax
      const dur = conductor.duration;
      performance.now.mockReturnValue(dur * 0.65 * 1000);
      conductor.tick();
      const meditativeRhythm = conductor.getExpression().rhythmicEnergy;

      // Reset and try dramatic (rhythmFocus 0.7)
      conductor.reset();
      conductor.setPersonalityOverride('dramatic');
      performance.now.mockReturnValue(0);
      conductor.resume();
      conductor.tick();

      const dur2 = conductor.duration;
      performance.now.mockReturnValue(dur2 * 0.65 * 1000);
      conductor.tick();
      const dramaticRhythm = conductor.getExpression().rhythmicEnergy;

      expect(dramaticRhythm).toBeGreaterThan(meditativeRhythm);
    });

    it('expression peaks harder at the climax apex than at climax entry', () => {
      conductor.setPersonalityOverride('dramatic');
      performance.now.mockReturnValue(0);
      conductor.resume();
      conductor.tick();

      const duration = conductor.duration;
      performance.now.mockReturnValue(duration * 0.59 * 1000);
      conductor.tick();
      const earlyClimax = conductor.getExpression();

      performance.now.mockReturnValue(duration * 0.64 * 1000);
      conductor.tick();
      const apex = conductor.getExpression();

      expect(apex.intensity).toBeGreaterThan(earlyClimax.intensity);
      expect(apex.dynamicSwell).toBeGreaterThan(earlyClimax.dynamicSwell);
      expect(apex.rhythmicEnergy).toBeGreaterThanOrEqual(earlyClimax.rhythmicEnergy);
    });

    it('stillness progressively withdraws expression dimensions near movement end', () => {
      conductor.setPersonalityOverride('dramatic');
      performance.now.mockReturnValue(0);
      conductor.resume();
      conductor.tick();

      const duration = conductor.duration;
      performance.now.mockReturnValue(duration * 0.89 * 1000);
      conductor.tick();
      const earlyStillness = conductor.getExpression();

      performance.now.mockReturnValue(duration * 0.99 * 1000);
      conductor.tick();
      const lateStillness = conductor.getExpression();

      expect(lateStillness.dynamicSwell).toBeLessThan(earlyStillness.dynamicSwell * 0.4);
      expect(lateStillness.rhythmicEnergy).toBeLessThan(earlyStillness.rhythmicEnergy * 0.4);
      expect(lateStillness.melodicUrgency).toBeLessThan(earlyStillness.melodicUrgency * 0.4);
      expect(lateStillness.effectDepth).toBeLessThan(earlyStillness.effectDepth * 0.4);
    });
  });

  describe('personality selection', () => {
    it('weather "storm" selects "dramatic" personality', () => {
      conductor.setWeatherContext('storm');
      performance.now.mockReturnValue(0);
      conductor.resume();
      expect(conductor.personalityName).toBe('dramatic');
    });

    it('weather "fog" selects "meditative" personality', () => {
      conductor.setWeatherContext('fog');
      performance.now.mockReturnValue(0);
      conductor.resume();
      expect(conductor.personalityName).toBe('meditative');
    });

    it('weather "clear" selects "contemplative" personality', () => {
      conductor.setWeatherContext('clear');
      performance.now.mockReturnValue(0);
      conductor.resume();
      expect(conductor.personalityName).toBe('contemplative');
    });

    it('weather "rain" selects "restless" personality', () => {
      conductor.setWeatherContext('rain');
      performance.now.mockReturnValue(0);
      conductor.resume();
      expect(conductor.personalityName).toBe('restless');
    });

    it('successive movements pick contrasting personalities', () => {
      conductor.setWeatherContext('storm');
      performance.now.mockReturnValue(0);
      conductor.resume();
      const first = conductor.personalityName;
      expect(first).toBe('dramatic');

      // Simulate movement end
      conductor.tick();
      performance.now.mockReturnValue(conductor.duration * 1000 + 1000);
      conductor.tick();

      const second = conductor.personalityName;
      // After dramatic, should be contemplative or meditative
      expect(['contemplative', 'meditative']).toContain(second);
    });

    it('setPersonalityOverride forces the specified personality', () => {
      conductor.setWeatherContext('clear');
      conductor.setPersonalityOverride('dramatic');
      performance.now.mockReturnValue(0);
      conductor.resume();
      expect(conductor.personalityName).toBe('dramatic');
    });

    it('setPersonalityOverride restarts current movement', () => {
      performance.now.mockReturnValue(0);
      conductor.resume();
      conductor.tick();
      performance.now.mockReturnValue(60000); // 1 minute in
      conductor.tick();

      conductor.setPersonalityOverride('meditative');
      expect(conductor.personalityName).toBe('meditative');
      expect(conductor.elapsed).toBe(0); // Reset for new movement
    });
  });

  describe('callbacks', () => {
    it('fires onMovementChange when a new movement begins', () => {
      const fn = vi.fn();
      conductor.onMovementChange(fn);
      performance.now.mockReturnValue(0);
      conductor.resume();
      expect(fn).toHaveBeenCalledWith(expect.objectContaining({
        movementNumber: 1,
        personality: expect.any(String),
        duration: expect.any(Number),
      }));
    });

    it('fires onMovementChange on movement transition', () => {
      const fn = vi.fn();
      conductor.onMovementChange(fn);
      performance.now.mockReturnValue(0);
      conductor.resume();
      fn.mockClear();

      // Simulate end of movement
      conductor.tick();
      performance.now.mockReturnValue(conductor.duration * 1000 + 1000);
      conductor.tick();

      expect(fn).toHaveBeenCalledWith(expect.objectContaining({
        movementNumber: 2,
      }));
    });

    it('fires onPhaseChange when crossing phase boundaries', () => {
      const fn = vi.fn();
      conductor.onPhaseChange(fn);
      performance.now.mockReturnValue(0);
      conductor.resume();

      const duration = conductor.duration;
      conductor.tick(); // Initial tick, sets lastPhaseName

      // Jump to stirring phase
      performance.now.mockReturnValue(duration * 0.25 * 1000);
      conductor.tick();

      expect(fn).toHaveBeenCalledWith(expect.objectContaining({
        phase: 'stirring',
      }));
    });
  });

  describe('getCurrentPhase', () => {
    it('returns "inactive" when conductor not started', () => {
      const phase = conductor.getCurrentPhase();
      expect(phase.name).toBe('inactive');
      expect(phase.movementNumber).toBe(0);
    });

    it('returns correct phase info when running', () => {
      performance.now.mockReturnValue(0);
      conductor.resume();
      conductor.tick();

      const phase = conductor.getCurrentPhase();
      expect(phase.name).toBe('breathing');
      expect(phase.movementNumber).toBe(1);
      expect(phase.personality).toBeTruthy();
      expect(phase.elapsed).toBeGreaterThanOrEqual(0);
      expect(phase.remaining).toBeGreaterThan(0);
    });

    it('advances phase progress smoothly between ticks while running', () => {
      performance.now.mockReturnValue(0);
      conductor.resume();
      conductor.tick();

      performance.now.mockReturnValue(5000);
      const phase = conductor.getCurrentPhase();
      expect(phase.elapsed).toBeCloseTo(5, 1);
      expect(phase.listeningSeconds).toBeCloseTo(5, 1);
      expect(phase.progress).toBeGreaterThan(0);
    });

    it('does not advance phase progress while paused', () => {
      performance.now.mockReturnValue(0);
      conductor.resume();
      conductor.tick();

      performance.now.mockReturnValue(5000);
      conductor.tick();
      conductor.pause();

      performance.now.mockReturnValue(25000);
      const phase = conductor.getCurrentPhase();
      expect(phase.elapsed).toBeCloseTo(5, 1);
      expect(phase.listeningSeconds).toBeCloseTo(5, 1);
    });
  });

  describe('movement duration', () => {
    it('contemplative movements are 12–18 minutes', () => {
      conductor.setPersonalityOverride('contemplative');
      performance.now.mockReturnValue(0);
      conductor.resume();
      const durMin = conductor.duration / 60;
      expect(durMin).toBeGreaterThanOrEqual(12);
      expect(durMin).toBeLessThanOrEqual(18);
    });

    it('dramatic movements are 8–12 minutes', () => {
      conductor.setPersonalityOverride('dramatic');
      performance.now.mockReturnValue(0);
      conductor.resume();
      const durMin = conductor.duration / 60;
      expect(durMin).toBeGreaterThanOrEqual(8);
      expect(durMin).toBeLessThanOrEqual(12);
    });

    it('meditative movements are 14–20 minutes', () => {
      conductor.setPersonalityOverride('meditative');
      performance.now.mockReturnValue(0);
      conductor.resume();
      const durMin = conductor.duration / 60;
      expect(durMin).toBeGreaterThanOrEqual(14);
      expect(durMin).toBeLessThanOrEqual(20);
    });

    it('restless movements are 8–14 minutes', () => {
      conductor.setPersonalityOverride('restless');
      performance.now.mockReturnValue(0);
      conductor.resume();
      const durMin = conductor.duration / 60;
      expect(durMin).toBeGreaterThanOrEqual(8);
      expect(durMin).toBeLessThanOrEqual(14);
    });
  });
});

// ── Phase template consistency ──────────────────────────────────────
describe('PHASE_TEMPLATE', () => {
  it('phases cover the full 0–1 range without gaps', () => {
    let lastEnd = 0;
    for (const name of PHASE_ORDER) {
      const phase = PHASE_TEMPLATE[name];
      expect(phase.start).toBeCloseTo(lastEnd, 10);
      lastEnd = phase.end;
    }
    expect(lastEnd).toBeCloseTo(1.0, 10);
  });

  it('all phase from/to values are in 0–1 range', () => {
    for (const name of PHASE_ORDER) {
      const phase = PHASE_TEMPLATE[name];
      expect(phase.from).toBeGreaterThanOrEqual(0);
      expect(phase.from).toBeLessThanOrEqual(1);
      expect(phase.to).toBeGreaterThanOrEqual(0);
      expect(phase.to).toBeLessThanOrEqual(1);
    }
  });
});

// ── Feature toggle ──────────────────────────────────────────────────
describe('CONDUCTOR_ENABLED', () => {
  it('is a boolean', () => {
    expect(typeof CONDUCTOR_ENABLED).toBe('boolean');
  });

  it('is true by default', () => {
    expect(CONDUCTOR_ENABLED).toBe(true);
  });
});
