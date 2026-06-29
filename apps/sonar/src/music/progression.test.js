import { beforeEach, describe, expect, it, vi } from 'vitest';

const { loops } = vi.hoisted(() => ({ loops: [] }));

vi.mock('tone', () => {
  class Loop {
    constructor(callback, interval) {
      this.callback = callback;
      this.interval = interval;
      this.state = 'stopped';
      this.disposed = false;
      loops.push(this);
    }

    start() {
      this.state = 'started';
    }

    stop() {
      this.state = 'stopped';
    }

    dispose() {
      this.disposed = true;
    }

    tick(time = 0) {
      this.callback(time);
    }
  }

  return {
    Loop,
    __test: { loops },
  };
});

import * as Tone from 'tone';
import { createProgressionPlayer } from './progression.js';

describe('createProgressionPlayer', () => {
  beforeEach(() => {
    Tone.__test.loops.length = 0;
  });

  it('preserves progression position across pause/resume without retriggering immediately', () => {
    const onChordChange = vi.fn();
    const player = createProgressionPlayer({ onChordChange });
    const progression = {
      chords: [{ id: 'A' }, { id: 'B' }],
      harmonicRhythm: '4m',
      length: 2,
    };

    player.setProgression(progression, true);
    expect(onChordChange).toHaveBeenCalledTimes(1);
    expect(onChordChange.mock.calls[0][0]).toBe(progression.chords[0]);

    const firstLoop = Tone.__test.loops[0];
    firstLoop.tick();
    expect(onChordChange).toHaveBeenCalledTimes(2);
    expect(onChordChange.mock.calls[1][0]).toBe(progression.chords[1]);

    player.pause();
    const callCountBeforeResume = onChordChange.mock.calls.length;

    player.resume();
    expect(onChordChange).toHaveBeenCalledTimes(callCountBeforeResume);

    const resumedLoop = Tone.__test.loops[1];
    resumedLoop.tick();
    expect(onChordChange).toHaveBeenCalledTimes(callCountBeforeResume + 1);
    expect(onChordChange.mock.calls[callCountBeforeResume][0]).toBe(progression.chords[0]);
  });

  it('clears progression state on stop()', () => {
    const player = createProgressionPlayer({ onChordChange: () => {} });
    player.setProgression({
      chords: [{ id: 'A' }],
      harmonicRhythm: '4m',
      length: 1,
    }, true);

    player.stop();

    expect(player.currentChord).toBeNull();
    expect(player.position).toEqual({ index: 0, total: 0 });

    const loopsBeforeResume = Tone.__test.loops.length;
    player.resume();
    expect(Tone.__test.loops.length).toBe(loopsBeforeResume);
  });
});
