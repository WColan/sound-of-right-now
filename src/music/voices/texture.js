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

  // Rain drop layer — short noise bursts at randomized intervals
  const rainGain = new Tone.Gain(0);
  const rainNoise = new Tone.Noise({ type: 'white', volume: -20 });
  const rainEnvelope = new Tone.AmplitudeEnvelope({
    attack: 0.005,
    decay: 0.05,
    sustain: 0,
    release: 0.03,
  });
  const rainFilter = new Tone.Filter({ frequency: 6000, type: 'bandpass', Q: 2 });

  rainNoise.connect(rainEnvelope);
  rainEnvelope.connect(rainFilter);
  rainFilter.connect(rainGain);
  rainGain.connect(filter);

  let rainLoop = null;
  let isRaining = false;

  function startRain(intensity = 0.5) {
    if (isRaining) return;
    isRaining = true;
    rainNoise.start();
    rainGain.gain.rampTo(intensity, 2);

    if (rainLoop) rainLoop.dispose();
    // Random-interval rain drops
    rainLoop = new Tone.Loop((time) => {
      if (Math.random() < intensity) {
        rainEnvelope.triggerAttackRelease(0.03, time);
      }
    }, '32n');
    rainLoop.start(0);
  }

  function stopRain() {
    if (!isRaining) return;
    isRaining = false;
    rainGain.gain.rampTo(0, 3);
    setTimeout(() => {
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
      noise.dispose();
      autoFilter.dispose();
      filter.dispose();
      rainNoise.dispose();
      rainEnvelope.dispose();
      rainFilter.dispose();
      rainGain.dispose();
      if (rainLoop) rainLoop.dispose();
    },
  };
}
