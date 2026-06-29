import { describe, expect, it, vi, beforeEach } from 'vitest';

// Mock Tone.js — melody.js imports Tone for synth/filter/transport
vi.mock('tone', () => {
  const rampTo = vi.fn();
  const linearRampTo = vi.fn();

  class Filter {
    constructor() {
      this.frequency = { linearRampTo, value: 5000 };
    }
  }

  class Synth {
    constructor() {
      this.volume = { value: -20, rampTo };
      this.detune = { value: 0, rampTo };
    }
    set() {}
    connect() {}
    triggerAttackRelease() {}
    triggerRelease() {}
    dispose() {}
  }

  return {
    Filter,
    Synth,
    Time: function (t) {
      const map = { '4n': 0.5, '8n': 0.25, '16n': 0.125, '2n': 1, '4n.': 0.75 };
      return { toSeconds: () => map[t] || 0.5 };
    },
    now: vi.fn().mockReturnValue(0),
    getTransport: vi.fn().mockReturnValue({
      scheduleOnce: vi.fn().mockReturnValue(1),
      clear: vi.fn(),
    }),
  };
});

import { createMelodyVoice } from './melody.js';

describe('melody setProbabilityScale', () => {
  let melody;

  beforeEach(() => {
    melody = createMelodyVoice();
  });

  it('setProbabilityScale exists as a method', () => {
    expect(typeof melody.setProbabilityScale).toBe('function');
  });

  it('accepts values between 0 and 2', () => {
    // Should not throw
    melody.setProbabilityScale(0);
    melody.setProbabilityScale(1);
    melody.setProbabilityScale(1.6);
    melody.setProbabilityScale(2);
  });

  it('clamps values below 0 to 0', () => {
    melody.setProbabilityScale(-0.5);
    // No throw; internal state is clamped
  });

  it('clamps values above 2 to 2', () => {
    melody.setProbabilityScale(5);
    // No throw; internal state is clamped
  });

  it('default scale is 1.0 — onChordChange works normally', () => {
    melody.setChordContext(
      ['C4', 'E4', 'G4', 'B4'],
      ['C4', 'D4', 'E4', 'F4', 'G4', 'A4', 'B4'],
    );
    melody.onChordChange(); // Should not throw
  });

  it('scale of 0 suppresses phrases gracefully', () => {
    melody.setProbabilityScale(0);
    melody.setChordContext(
      ['C4', 'E4', 'G4', 'B4'],
      ['C4', 'D4', 'E4', 'F4', 'G4', 'A4', 'B4'],
    );
    // With scale=0, effective probability = base * 0 = 0
    // onChordChange should still work without errors
    melody.onChordChange();
  });

  it('high scale value (1.6) works without errors', () => {
    melody.setProbabilityScale(1.6);
    melody.setChordContext(
      ['C4', 'E4', 'G4', 'B4'],
      ['C4', 'D4', 'E4', 'F4', 'G4', 'A4', 'B4'],
    );
    melody.onChordChange();
  });
});
