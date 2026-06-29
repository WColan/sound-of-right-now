/**
 * Lunar voice — a high, breathing shimmer that tracks the Moon's phase: dark and
 * near-silent at new moon, radiant and open at full. A gentle vibrato keeps it
 * alive above the planetary drones.
 */
import { dbToGain } from '../audio-bus.js';

export function createLunarVoice(Tone, { freq = 523.25 } = {}) {
  const osc = new Tone.Oscillator({ frequency: freq, type: 'triangle' });
  const vibrato = new Tone.Vibrato({ frequency: 0.18, depth: 0.08 });
  const filter = new Tone.Filter(2000, 'lowpass');
  const out = new Tone.Gain(0);

  osc.connect(vibrato);
  vibrato.connect(filter);
  filter.connect(out);

  return {
    output: out,
    start() { osc.start(); },
    setVolume(db, ramp = 1.5) { out.gain.rampTo(dbToGain(db), ramp); },
    setCutoff(hz, ramp = 1.5) { filter.frequency.rampTo(hz, ramp); },
    stop() { out.gain.rampTo(0, 0.3); },
    dispose() { for (const n of [osc, vibrato, filter, out]) n.dispose?.(); },
  };
}
