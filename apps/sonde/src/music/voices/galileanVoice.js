/**
 * Galilean voice — Jupiter's polyrhythm.
 *
 * Io, Europa and Ganymede are locked in a 1:2:4 Laplace resonance, so their
 * orbital phases advance at rates 4:2:1. We pluck a note each time a moon
 * completes an orbit, and tune the three moons to stacked octaves — turning a
 * real celestial resonance into an audible, ever-shifting cross-rhythm.
 *
 * `updatePhases()` is called once per clock sample with phases in [0, 1); a
 * wrap (phase decreasing past 0) marks a completed orbit and fires a pluck.
 */
import { dbToGain } from '../audio-bus.js';

const MOON_PITCH = { io: 698.46, europa: 349.23, ganymede: 174.61 }; // stacked octaves (F5/F4/F3)

export function createGalileanVoice(Tone, { jupiterFreq } = {}) {
  // If Jupiter's tuned frequency is provided, derive stacked octaves from it so
  // the polyrhythm sits in tune with the Jupiter drone; else use defaults.
  const pitch = jupiterFreq
    ? { io: jupiterFreq * 8, europa: jupiterFreq * 4, ganymede: jupiterFreq * 2 }
    : MOON_PITCH;

  const out = new Tone.Gain(0);
  const plucks = {
    io: new Tone.PluckSynth({ attackNoise: 1, dampening: 5000, resonance: 0.9 }).connect(out),
    europa: new Tone.PluckSynth({ attackNoise: 1, dampening: 4000, resonance: 0.92 }).connect(out),
    ganymede: new Tone.PluckSynth({ attackNoise: 1, dampening: 3000, resonance: 0.94 }).connect(out),
  };

  const last = { io: null, europa: null, ganymede: null };

  return {
    output: out,

    setVolume(db, ramp = 1) {
      out.gain.rampTo(dbToGain(db), ramp);
    },

    /** @param {{io:number, europa:number, ganymede:number}} phases - each in [0,1) */
    updatePhases(phases, time) {
      for (const moon of ['io', 'europa', 'ganymede']) {
        const p = phases[moon];
        const prev = last[moon];
        // A completed orbit shows up as the phase wrapping from high back to low.
        if (prev != null && p < prev - 0.5) {
          plucks[moon].triggerAttack(pitch[moon], time);
        }
        last[moon] = p;
      }
    },

    dispose() {
      for (const n of [plucks.io, plucks.europa, plucks.ganymede, out]) n.dispose?.();
    },
  };
}
