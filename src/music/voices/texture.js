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
  const rainNoise = new Tone.Noise({ type: 'white', volume: -17 });

  // Band definitions: [centerFreq, Q, baseDecay, volume]
  // Wider Q values (lower numbers) give each drop more body/character.
  // Boosted volumes ensure drops are audible against the texture noise layer.
  const RAIN_BANDS = [
    { freq: 1200, q: 0.8, decay: 0.09, vol: -15 },  // heavy/plop — large drops
    { freq: 3500, q: 1.2, decay: 0.05, vol: -17 },  // medium — typical drops
    { freq: 8000, q: 1.8, decay: 0.03, vol: -19 },  // light/tick — fine spray
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
  const rainMistFilter = new Tone.Filter({ frequency: 5000, type: 'highpass', rolloff: -12 });
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

  function startRain(intensity = 0.5) {
    if (rainStopTimeout) {
      clearTimeout(rainStopTimeout);
      rainStopTimeout = null;
    }
    if (!isRaining) {
      isRaining = true;
      rainNoise.start();
    }
    rainOutputGain.gain.rampTo(intensity * 1.3, 2);
    rainMistGain.gain.rampTo(intensity * 0.45, 2);

    if (rainLoop) rainLoop.dispose();
    rainLoop = new Tone.Loop((time) => {
      // Light drops (high-freq band) — most frequent; pitch varies per drop for realism
      if (Math.random() < Math.min(intensity * 1.1, 1.0)) {
        rainBands[2].bandFilter.frequency.value = 8000 * (0.8 + Math.random() * 0.4);
        rainBands[2].panner.pan.value = (Math.random() * 2 - 1) * 0.8;
        rainBands[2].envelope.decay = 0.02 + Math.random() * 0.02;
        rainBands[2].envelope.triggerAttackRelease(0.02 + Math.random() * 0.015, time);
      }
      // Medium drops
      if (Math.random() < intensity * 0.75) {
        rainBands[1].bandFilter.frequency.value = 3500 * (0.8 + Math.random() * 0.4);
        rainBands[1].panner.pan.value = (Math.random() * 2 - 1) * 0.7;
        rainBands[1].envelope.decay = 0.04 + Math.random() * 0.02;
        rainBands[1].envelope.triggerAttackRelease(0.04 + Math.random() * 0.02, time);
      }
      // Heavy drops — lower threshold so they appear in lighter rain too
      if (intensity > 0.25 && Math.random() < (intensity - 0.25) * 0.7) {
        rainBands[0].bandFilter.frequency.value = 1200 * (0.75 + Math.random() * 0.5);
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

    dispose() {
      this.stop();
      if (rainStopTimeout) clearTimeout(rainStopTimeout);
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
    },
  };
}
