/**
 * Smooth parameter transition manager.
 *
 * Sits between the mapper and the engine. When new musical parameters arrive,
 * it determines which are continuous (ramp smoothly) vs discrete (snap at
 * appropriate moments), and tells the engine to transition accordingly.
 */

// Ramp durations in seconds for continuous parameters
const RAMP_DURATIONS = {
  // Volumes (fast)
  padVolume: 5,
  arpeggioVolume: 3,
  bassVolume: 5,
  textureVolume: 8,
  percussionVolume: 3,
  droneVolume: 8,
  melodyVolume: 8,

  // Filters (medium)
  padBrightness: 15,
  bassCutoff: 15,
  masterFilterCutoff: 20,
  textureFilterCutoff: 12,
  arpeggioFilterCutoff: 12,

  // Effects (medium)
  reverbWet: 15,
  reverbDecay: 20,
  chorusDepth: 20,

  // Modulation (medium-slow)
  lfoRate: 25,
  lfoDepth: 20,

  // Spatial (medium)
  percussionPan: 8,
  arpeggioPan: 8,
  melodyPan: 12,

  // Tempo (slow)
  bpm: 45,

  // Rhythm (medium)
  rhythmDensity: 10,

  // Texture atmosphere sweep (medium — wind changes gradually)
  textureAutoFilterRate:  8,
  textureAutoFilterDepth: 8,

  // Drone filter (slow — sub-bass tonality shifts with pressure/category)
  droneCutoff: 20,

  // Sub-bass bus gain (slow — weather-driven physical impact)
  subBassGain: 15,

  // Pressure (slow — affects harmonic rhythm)
  pressureNorm: 30,

  // Global volume (slow — day/night transitions)
  globalVelocityScale: 30,
};

// These parameters snap discretely (not interpolated)
const DISCRETE_PARAMS = new Set([
  'rootNote',
  'scaleType',
  'arpeggioPattern',
  'noiseType',
  'padSpread',
  'noteInterval',
  'timbreProfile',      // Oscillator type + envelope character — snaps at next note
  // Progression-driving discrete params
  'weatherCategory',
  'arpeggioRhythmPattern',
  'percussionPattern',
  'melodyMood',
]);

// These are metadata, not engine params
const META_PARAMS = new Set(['_meta', 'isRaining', 'rainIntensity', 'arpeggioOctave']);

/**
 * Create an interpolator instance.
 * @param {object} engine - The sound engine
 * @returns {{ update: Function }}
 */
export function createInterpolator(engine) {
  let currentParams = null;
  let isFirstUpdate = true;

  return {
    /**
     * Process new musical parameters. On first call, applies immediately.
     * On subsequent calls, ramps continuous params and schedules discrete changes.
     * @param {object} newParams
     */
    update(newParams) {
      if (isFirstUpdate) {
        // First update: apply everything immediately via the engine
        engine.applyParams(newParams);
        currentParams = { ...newParams };
        isFirstUpdate = false;

        // Handle rain on first update too
        if (newParams.isRaining) {
          engine.voices.texture.setRain(true, newParams.rainIntensity);
        }
        return;
      }

      // Process each parameter
      for (const [key, value] of Object.entries(newParams)) {
        // Skip metadata
        if (META_PARAMS.has(key)) continue;

        // Skip if unchanged
        if (currentParams[key] === value) continue;

        if (DISCRETE_PARAMS.has(key)) {
          // Discrete change — schedule at next musical boundary
          engine.scheduleDiscreteChange(key, value);
        } else if (key in RAMP_DURATIONS) {
          // Continuous change — ramp smoothly
          engine.rampParam(key, value, RAMP_DURATIONS[key]);
        } else {
          // Unknown param — try ramping with default duration
          engine.rampParam(key, value, 10);
        }
      }

      // Handle rain state changes
      if (newParams.isRaining !== currentParams.isRaining ||
          newParams.rainIntensity !== currentParams.rainIntensity) {
        engine.voices.texture.setRain(newParams.isRaining, newParams.rainIntensity);
      }

      currentParams = { ...newParams };
    },

    /** Get the current parameter state */
    get currentParams() {
      return currentParams;
    },

    /**
     * Reset interpolation state. Call before connecting this interpolator to
     * a freshly-created engine so the next update() applies immediately
     * (snap-apply) rather than ramping from the old location's values.
     */
    reset() {
      currentParams = null;
      isFirstUpdate = true;
    },
  };
}
