/**
 * Sun voice — the gravitational centre, heard as a constant root drone at the
 * Earth-fundamental (1/1) plus a sub-octave. It never modulates: it is the
 * ground the whole solar-system chord rests on.
 */
import { dbToGain } from '../audio-bus.js';

export function createSunVoice(Tone, { freq, subFreq } = {}) {
  const root = new Tone.Oscillator({ frequency: freq, type: 'sine' });
  const sub = new Tone.Oscillator({ frequency: subFreq, type: 'sine' });
  const filter = new Tone.Filter(420, 'lowpass');
  const out = new Tone.Gain(0);

  root.connect(filter);
  sub.connect(filter);
  filter.connect(out);

  return {
    output: out,
    start() { root.start(); sub.start(); },
    setVolume(db, ramp = 2) { out.gain.rampTo(dbToGain(db), ramp); },
    stop() { out.gain.rampTo(0, 0.3); },
    dispose() { for (const n of [root, sub, filter, out]) n.dispose?.(); },
  };
}
