/**
 * Master audio bus for SONDE.
 *
 * Voices connect their .output to `voiceBus`. Signal then flows:
 *
 *   voiceBus → reverb → masterFilter → masterGain → limiter → destination
 *                                          └→ analyser + waveform (for visuals)
 *
 * Pattern lifted from SONAR's engine.js but stripped to what a drone-based
 * celestial piece needs. Tone is injected so the bus is testable with a fake.
 */
export function createAudioBus(Tone, { userGain = 0.0 } = {}) {
  const limiter = new Tone.Limiter(-2).toDestination();
  const masterGain = new Tone.Gain(userGain).connect(limiter);
  const masterFilter = new Tone.Filter(9000, 'lowpass').connect(masterGain);
  const reverb = new Tone.Reverb({ decay: 8, wet: 0.35 }).connect(masterFilter);
  const voiceBus = new Tone.Gain(1).connect(reverb);

  // Metering taps for the orrery visualizer.
  const analyser = new Tone.Analyser('fft', 1024);
  const waveformAnalyser = new Tone.Analyser('waveform', 1024);
  masterGain.connect(analyser);
  masterGain.connect(waveformAnalyser);

  return {
    voiceBus,
    masterFilter,
    masterGain,
    reverb,
    limiter,
    analyser,
    waveformAnalyser,

    /** Ramp the user-facing master level (0–1). */
    setUserGain(value, ramp = 0.1) {
      masterGain.gain.rampTo(Math.max(0, value), ramp);
    },

    setMasterCutoff(hz, ramp = 1.5) {
      masterFilter.frequency.rampTo(hz, ramp);
    },

    setReverbWet(wet, ramp = 2) {
      reverb.wet.rampTo(Math.max(0, Math.min(1, wet)), ramp);
    },

    dispose() {
      for (const node of [voiceBus, reverb, masterFilter, masterGain, limiter, analyser, waveformAnalyser]) {
        node.dispose?.();
      }
    },
  };
}

/** Decibels → linear gain. */
export function dbToGain(db) {
  return Math.pow(10, db / 20);
}
