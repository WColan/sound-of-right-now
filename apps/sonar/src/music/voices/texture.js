import * as Tone from 'tone';

/**
 * Texture voice — noise and atmosphere layer.
 *
 * Uses Noise through an AutoFilter for sweeping atmospheric textures.
 * Noise type and volume are mapped to weather conditions:
 *   clear = silent, rain = pink noise, snow = filtered white, storm = brown, fog = quiet pink
 */
export function createTextureVoice() {
  const filter = new Tone.Filter({
    frequency: 2000,
    type: 'lowpass',
    rolloff: -24,
  });

  const autoFilter = new Tone.AutoFilter({
    frequency: 0.08,
    depth: 0.6,
    baseFrequency: 200,
    octaves: 3,
    wet: 0.8,
  }).start();

  const noise = new Tone.Noise({
    type: 'pink',
    volume: -24,
  });

  noise.connect(autoFilter);
  autoFilter.connect(filter);

  // Rain drop layer — three parallel frequency bands simulate drops of varying size.
  // Each band has its own panner so drops appear at random stereo positions.
  // All bands feed into rainOutputGain, which is exposed as a separate output so
  // engine.js can connect it AFTER the texture lowpass (preserving high-frequency content).
  const rainNoise = new Tone.Noise({ type: 'white', volume: -20 });

  // Band definitions: [centerFreq, Q, baseDecay, volume]
  const RAIN_BANDS = [
    { freq: 1500, q: 1.5, decay: 0.09, vol: -18 },  // heavy/plop — large drops
    { freq: 4000, q: 2.0, decay: 0.05, vol: -20 },  // medium — typical drops
    { freq: 7500, q: 3.0, decay: 0.03, vol: -22 },  // light/tick — fine spray
  ];

  const rainBands = RAIN_BANDS.map(({ freq, q, decay, vol }) => {
    const envelope = new Tone.AmplitudeEnvelope({
      attack: 0.003,
      decay,
      sustain: 0,
      release: decay * 0.6,
    });
    const bandFilter = new Tone.Filter({ frequency: freq, type: 'bandpass', Q: q });
    const panner = new Tone.Panner(0);
    const gain = new Tone.Gain(Tone.dbToGain(vol));
    rainNoise.connect(envelope);
    envelope.connect(bandFilter);
    bandFilter.connect(panner);
    panner.connect(gain);
    return { envelope, bandFilter, panner, gain };
  });

  // Constant mist layer: highpass-filtered noise for the continuous rain hiss
  const rainMistFilter = new Tone.Filter({ frequency: 6000, type: 'highpass', rolloff: -12 });
  const rainMistGain = new Tone.Gain(0);
  rainNoise.connect(rainMistFilter);
  rainMistFilter.connect(rainMistGain);

  // All rain paths merge here; exposed as rainOutput (bypasses texture lowpass)
  const rainOutputGain = new Tone.Gain(0);
  rainBands.forEach(({ gain }) => gain.connect(rainOutputGain));
  rainMistGain.connect(rainOutputGain);

  let rainLoop = null;
  let isRaining = false;
  let rainStopTimeout = null;

  // PM2.5 grain layer — sparse high-frequency crackle for particulate haze
  // (wildfire smoke, heavy smog). Distinct from rain: tighter bandpass (8 kHz),
  // much shorter envelope (0.012s decay vs 0.05s), sparser trigger rate ('16n').
  const grainGain = new Tone.Gain(0);
  const grainNoise = new Tone.Noise({ type: 'white', volume: -24 });
  const grainEnvelope = new Tone.AmplitudeEnvelope({
    attack: 0.001,
    decay: 0.012,
    sustain: 0,
    release: 0.01,
  });
  const grainFilter = new Tone.Filter({ frequency: 8000, type: 'bandpass', Q: 4 });

  grainNoise.connect(grainEnvelope);
  grainEnvelope.connect(grainFilter);
  grainFilter.connect(grainGain);
  grainGain.connect(filter);

  let grainLoop = null;
  let isGraining = false;
  let grainStopTimeout = null;

  function startGrain(intensity) {
    if (grainStopTimeout) {
      clearTimeout(grainStopTimeout);
      grainStopTimeout = null;
    }
    if (!isGraining) {
      isGraining = true;
      grainNoise.start();
    }
    grainGain.gain.rampTo(intensity * 0.6, 8);

    if (grainLoop) grainLoop.dispose();
    grainLoop = new Tone.Loop((time) => {
      if (Math.random() < intensity * 0.4) {
        grainEnvelope.triggerAttackRelease(0.012, time);
      }
    }, '16n');
    grainLoop.start(0);
  }

  function stopGrain() {
    if (!isGraining) return;
    isGraining = false;
    grainGain.gain.rampTo(0, 8);
    grainStopTimeout = setTimeout(() => {
      grainStopTimeout = null;
      if (isGraining) return;
      grainNoise.stop();
      if (grainLoop) {
        grainLoop.stop();
        grainLoop.dispose();
        grainLoop = null;
      }
    }, 8500);
  }

  function startRain(intensity = 0.5) {
    if (rainStopTimeout) {
      clearTimeout(rainStopTimeout);
      rainStopTimeout = null;
    }
    if (!isRaining) {
      isRaining = true;
      rainNoise.start();
    }
    rainOutputGain.gain.rampTo(intensity, 2);
    rainMistGain.gain.rampTo(intensity * 0.35, 2);

    if (rainLoop) rainLoop.dispose();
    rainLoop = new Tone.Loop((time) => {
      // Light drops (high-freq band) — most frequent
      if (Math.random() < intensity * 0.85) {
        rainBands[2].panner.pan.value = (Math.random() * 2 - 1) * 0.8;
        rainBands[2].envelope.decay = 0.02 + Math.random() * 0.02;
        rainBands[2].envelope.triggerAttackRelease(0.02 + Math.random() * 0.015, time);
      }
      // Medium drops
      if (Math.random() < intensity * 0.55) {
        rainBands[1].panner.pan.value = (Math.random() * 2 - 1) * 0.7;
        rainBands[1].envelope.decay = 0.04 + Math.random() * 0.02;
        rainBands[1].envelope.triggerAttackRelease(0.04 + Math.random() * 0.02, time);
      }
      // Heavy drops — only above drizzle threshold
      if (intensity > 0.35 && Math.random() < (intensity - 0.35) * 0.6) {
        rainBands[0].panner.pan.value = (Math.random() * 2 - 1) * 0.5;
        rainBands[0].envelope.decay = 0.07 + Math.random() * 0.03;
        rainBands[0].envelope.triggerAttackRelease(0.06 + Math.random() * 0.03, time);
      }
    }, '32n');
    rainLoop.start(0);
  }

  function stopRain() {
    if (!isRaining) return;
    isRaining = false;
    rainOutputGain.gain.rampTo(0, 3);
    rainMistGain.gain.rampTo(0, 3);
    rainStopTimeout = setTimeout(() => {
      rainStopTimeout = null;
      if (isRaining) return;
      rainNoise.stop();
      if (rainLoop) {
        rainLoop.stop();
        rainLoop.dispose();
        rainLoop = null;
      }
    }, 3500);
  }

  return {
    noise,
    filter,
    autoFilter,
    output: filter,
    rainOutput: rainOutputGain,

    start() {
      noise.start();
    },

    stop() {
      noise.stop();
      stopRain();
      stopGrain();
    },

    setNoiseType(type) {
      if (!type) {
        noise.volume.rampTo(-60, 2);
        stopRain();
        return;
      }
      noise.type = type;
    },

    setVolume(db, rampTime = 8) {
      noise.volume.rampTo(db, rampTime);
    },

    setFilterCutoff(freq, rampTime = 10) {
      filter.frequency.linearRampTo(freq, rampTime);
    },

    /**
     * Set the autoFilter sweep rate and depth.
     * rate controls how fast the filter sweeps; depth controls how wide.
     * @param {number|null} rate  - Hz (e.g. 0.05 = slow, 0.4 = fast)
     * @param {number|null} depth - 0-1 (e.g. 0.3 = shallow, 0.9 = deep)
     * @param {number} rampTime   - Seconds to ramp
     */
    setAutoFilter(rate, depth, rampTime = 8) {
      if (rate != null) autoFilter.frequency.rampTo(rate, rampTime);
      if (depth != null) autoFilter.depth.rampTo(depth, rampTime);
    },

    /** Enable/disable rain drop texture */
    setRain(enabled, intensity = 0.5) {
      if (enabled) {
        startRain(intensity);
      } else {
        stopRain();
      }
    },

    /** Set PM2.5 particulate grain intensity (0 = silent, 1 = full crackle). */
    setGrainIntensity(intensity, rampTime = 8) {
      if (intensity > 0) {
        startGrain(intensity);
      } else {
        stopGrain();
      }
    },

    dispose() {
      this.stop();
      if (rainStopTimeout) clearTimeout(rainStopTimeout);
      if (grainStopTimeout) clearTimeout(grainStopTimeout);
      noise.dispose();
      autoFilter.dispose();
      filter.dispose();
      rainNoise.dispose();
      rainBands.forEach(({ envelope, bandFilter, panner, gain }) => {
        envelope.dispose();
        bandFilter.dispose();
        panner.dispose();
        gain.dispose();
      });
      rainMistFilter.dispose();
      rainMistGain.dispose();
      rainOutputGain.dispose();
      if (rainLoop) rainLoop.dispose();
      grainNoise.dispose();
      grainEnvelope.dispose();
      grainFilter.dispose();
      grainGain.dispose();
      if (grainLoop) grainLoop.dispose();
    },
  };
}
