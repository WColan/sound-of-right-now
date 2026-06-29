import { describe, it, expect } from 'vitest';
import { createSkyClock, SPEED_PRESETS } from './clock.js';

/** A controllable clock source so we can simulate the passage of real time. */
function fakeNow(startMs) {
  let t = startMs;
  return { now: () => t, advance: (ms) => { t += ms; } };
}

describe('createSkyClock', () => {
  it('at speed 1, simulation time tracks real time', () => {
    const real = fakeNow(1_000_000);
    const clock = createSkyClock({ speed: 1, nowMs: real.now });
    const start = clock.getSimTime().getTime();
    real.advance(5000);
    expect(clock.getSimTime().getTime() - start).toBe(5000);
  });

  it('warps simulation time by the speed multiplier', () => {
    const real = fakeNow(0);
    const clock = createSkyClock({ speed: 86400, nowMs: real.now }); // 1 day/sec
    const start = clock.getSimTime().getTime();
    real.advance(1000); // 1 real second
    expect(clock.getSimTime().getTime() - start).toBe(86400 * 1000);
  });

  it('keeps simulation time continuous across a speed change', () => {
    const real = fakeNow(0);
    const clock = createSkyClock({ speed: 1, nowMs: real.now });
    real.advance(10_000);
    const before = clock.getSimTime().getTime();
    clock.setSpeed(31557600); // crank to 1 yr/sec
    const after = clock.getSimTime().getTime();
    expect(after).toBe(before); // no discontinuity at the moment of change
    real.advance(1000);
    expect(clock.getSimTime().getTime() - after).toBe(31557600 * 1000);
  });

  it('goLive snaps simulation time back to the real present', () => {
    const real = fakeNow(500_000);
    const clock = createSkyClock({ speed: 86400, nowMs: real.now });
    real.advance(10_000); // sim time races far ahead
    expect(clock.getSimTime().getTime()).toBeGreaterThan(real.now());
    clock.goLive();
    expect(clock.getSimTime().getTime()).toBe(real.now());
  });

  it('jumpTo sets an arbitrary instant', () => {
    const real = fakeNow(0);
    const clock = createSkyClock({ speed: 1, nowMs: real.now });
    const target = new Date('2030-01-01T00:00:00Z');
    clock.jumpTo(target);
    expect(clock.getSimTime().getTime()).toBe(target.getTime());
  });

  it('isLive reflects real-time speed', () => {
    const clock = createSkyClock({ speed: 1 });
    expect(clock.isLive()).toBe(true);
    clock.setSpeed(3600);
    expect(clock.isLive()).toBe(false);
  });

  it('fires onSample with the current sim time on start', () => {
    const real = fakeNow(0);
    const samples = [];
    const clock = createSkyClock({ speed: 1, nowMs: real.now, onSample: (d) => samples.push(d) });
    clock.start();
    expect(samples).toHaveLength(1);
    expect(samples[0]).toBeInstanceOf(Date);
    clock.stop();
  });

  it('exposes a sensible ladder of speed presets', () => {
    expect(SPEED_PRESETS[0].value).toBe(1);
    const values = SPEED_PRESETS.map((p) => p.value);
    for (let i = 1; i < values.length; i++) expect(values[i]).toBeGreaterThan(values[i - 1]);
  });
});
