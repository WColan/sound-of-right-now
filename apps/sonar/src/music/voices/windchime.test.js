import { beforeEach, describe, expect, it, vi } from 'vitest';

const toneState = vi.hoisted(() => {
  const transport = {
    seconds: 0,
    scheduleCalls: [],
    clearCalls: [],
    nextId: 1,
    scheduleOnce(callback, time) {
      const id = this.nextId++;
      this.scheduleCalls.push({ id, callback, time });
      return id;
    },
    clear(id) {
      this.clearCalls.push(id);
    },
    reset() {
      this.seconds = 0;
      this.scheduleCalls = [];
      this.clearCalls = [];
      this.nextId = 1;
    },
  };
  return { transport };
});

vi.mock('tone', () => {
  function noteToMidi(note) {
    const m = /^([A-G])(#?)(\d+)$/.exec(String(note));
    if (!m) return 60;
    const [, base, sharp, octaveText] = m;
    const semitone = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }[base] + (sharp ? 1 : 0);
    return (Number(octaveText) + 1) * 12 + semitone;
  }

  class Node {
    connect(target) {
      return target;
    }
    dispose() {}
  }

  class Gain extends Node {}
  class Volume extends Node {
    constructor() {
      super();
      this.volume = { rampTo() {} };
    }
  }
  class Filter extends Node {}
  class NoiseSynth extends Node {
    triggerAttackRelease() {}
  }
  class FMSynth extends Node {
    constructor() {
      super();
      this.detune = { value: 0 };
    }
    set() {}
    triggerAttackRelease() {}
  }

  return {
    Gain,
    Volume,
    Filter,
    NoiseSynth,
    FMSynth,
    Frequency: (note) => ({ toMidi: () => noteToMidi(note) }),
    getTransport: () => toneState.transport,
  };
});

import { createWindChimeVoice } from './windchime.js';

describe('createWindChimeVoice scheduling', () => {
  beforeEach(() => {
    toneState.transport.reset();
  });

  it('uses transport timeline time for recursive scheduling, not callback audio time', () => {
    const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const voice = createWindChimeVoice();
    voice.setNotes(['C4', 'E4', 'G4'], ['C4', 'G4']);
    voice.setWindSpeed(20);

    voice.setActive(true);
    expect(toneState.transport.scheduleCalls).toHaveLength(1);
    expect(typeof toneState.transport.scheduleCalls[0].time).toBe('string');
    expect(toneState.transport.scheduleCalls[0].time.startsWith('+')).toBe(true);

    // Callback receives AudioContext seconds; recursive call should instead use
    // transport timeline seconds from Tone.getTransport().seconds.
    toneState.transport.seconds = 50;
    toneState.transport.scheduleCalls[0].callback(12345);
    expect(toneState.transport.scheduleCalls).toHaveLength(2);
    expect(typeof toneState.transport.scheduleCalls[1].time).toBe('number');
    expect(toneState.transport.scheduleCalls[1].time).toBeGreaterThan(50);
    expect(toneState.transport.scheduleCalls[1].time).toBeLessThan(100);

    randomSpy.mockRestore();
    voice.dispose();
  });

  it('clears pending event on deactivate and reschedules on resume', () => {
    const voice = createWindChimeVoice();
    voice.setNotes(['C4'], ['C4']);
    voice.setWindSpeed(10);

    voice.setActive(true);
    expect(toneState.transport.scheduleCalls).toHaveLength(1);
    const firstId = toneState.transport.scheduleCalls[0].id;

    voice.setActive(false);
    expect(toneState.transport.clearCalls).toContain(firstId);

    voice.setActive(true);
    expect(toneState.transport.scheduleCalls).toHaveLength(2);
    expect(toneState.transport.scheduleCalls[1].id).not.toBe(firstId);

    voice.dispose();
  });
});
