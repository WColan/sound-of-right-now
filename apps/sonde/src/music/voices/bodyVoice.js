/**
 * Body voice — one continuous, drifting tone per planet.
 *
 * Pitch is fixed (set once from orbital geometry). What moves:
 *   • pan      ← heliocentric longitude (the orbit, heard in the stereo field)
 *   • cutoff   ← heliocentric distance (near the Sun = bright)
 *   • pulse    ← orbital angular velocity (fast inner planets shimmer)
 *   • detune   ← retrograde motion (bends the planet flat)
 *   • volume   ← presence
 *
 * Signal: FatOscillator → filter → tremolo (the shimmer) → panner → out → bus.
 */
import { dbToGain } from '../audio-bus.js';

export function createBodyVoice(Tone, { freq, spread = 8, type = 'sawtooth' } = {}) {
  const osc = new Tone.FatOscillator({ frequency: freq, type, spread, count: 3 });
  const filter = new Tone.Filter(2000, 'lowpass');
  const tremolo = new Tone.Tremolo({ frequency: 0.1, depth: 0.2, spread: 0 }).start();
  const panner = new Tone.Panner(0);
  const out = new Tone.Gain(0);

  osc.connect(filter);
  filter.connect(tremolo);
  tremolo.connect(panner);
  panner.connect(out);

  return {
    output: out,
    baseFreq: freq,

    start() {
      osc.start();
    },

    setVolume(db, ramp = 0.8) {
      out.gain.rampTo(dbToGain(db), ramp);
    },

    setPan(value, ramp = 0.4) {
      panner.pan.rampTo(Math.max(-1, Math.min(1, value)), ramp);
    },

    setCutoff(hz, ramp = 0.6) {
      filter.frequency.rampTo(hz, ramp);
    },

    setPulseRate(hz, ramp = 0.6) {
      tremolo.frequency.rampTo(hz, ramp);
    },

    setPulseDepth(depth, ramp = 0.6) {
      tremolo.depth.rampTo(Math.max(0, Math.min(1, depth)), ramp);
    },

    setDetune(cents, ramp = 0.5) {
      osc.detune.rampTo(cents, ramp);
    },

    stop() {
      out.gain.rampTo(0, 0.2);
    },

    dispose() {
      for (const n of [osc, filter, tremolo, panner, out]) n.dispose?.();
    },
  };
}
