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

  // Drop layer — three size classes using non-resonant filters so drops are
  // brief wideband clicks/ticks rather than tonal pings (which sound like buzzing).
  // Highpass for light drops (high-freq tick), lowpass for heavy drops (low thud).
  // Very short decays keep each drop click-like, not ring-like.
  const RAIN_BANDS = [
    { freq: 600,  type: 'lowpass',  rolloff: -12, decay: 0.012, vol: -14 },  // heavy/plop
    { freq: 2000, type: 'highpass', rolloff: -12, decay: 0.007, vol: -16 },  // medium click
    { freq: 5500, type: 'highpass', rolloff: -12, decay: 0.004, vol: -18 },  // light tick
  ];

  const rainBands = RAIN_BANDS.map(({ freq, type, rolloff, decay, vol }) => {
    const envelope = new Tone.AmplitudeEnvelope({
      attack: 0.001,
      decay,
      sustain: 0,
      release: decay * 0.5,
    });
    const bandFilter = new Tone.Filter({ frequency: freq, type, rolloff });
    const panner = new Tone.Panner(0);
    const gain = new Tone.Gain(Tone.dbToGain(vol));
    rainNoise.connect(envelope);
    envelope.connect(bandFilter);
    bandFilter.connect(panner);
    panner.connect(gain);
    return { envelope, bandFilter, panner, gain };
  });

  // Constant mist layer: highpass-filtered noise for the continuous rain hiss —
  // this is the primary "rain" sound; the drops sit on top of it.
  const rainMistFilter = new Tone.Filter({ frequency: 4000, type: 'highpass', rolloff: -12 });
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
    rainMistGain.gain.rampTo(intensity * 0.7, 2);

    if (rainLoop) rainLoop.dispose();
    rainLoop = new Tone.Loop((time) => {
      // Light ticks — most frequent, very brief high-freq click
      if (Math.random() < Math.min(intensity * 1.1, 1.0)) {
        rainBands[2].panner.pan.value = (Math.random() * 2 - 1) * 0.8;
        rainBands[2].envelope.triggerAttackRelease(0.003 + Math.random() * 0.002, time);
      }
      // Medium clicks
      if (Math.random() < intensity * 0.65) {
        rainBands[1].panner.pan.value = (Math.random() * 2 - 1) * 0.7;
        rainBands[1].envelope.triggerAttackRelease(0.005 + Math.random() * 0.003, time);
      }
      // Heavy thuds — sparser
      if (intensity > 0.25 && Math.random() < (intensity - 0.25) * 0.5) {
        rainBands[0].panner.pan.value = (Math.random() * 2 - 1) * 0.5;
        rainBands[0].envelope.triggerAttackRelease(0.008 + Math.random() * 0.006, time);
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
