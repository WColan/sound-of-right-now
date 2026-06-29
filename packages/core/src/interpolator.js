/**
 * Generic smooth parameter-transition manager.
 *
 * Sits between a (pure) mapper and an audio engine. When new musical parameters
 * arrive it decides which are continuous (ramp smoothly), which are discrete
 * (snap at a musical boundary), and which are metadata (ignored by audio).
 *
 * This is the domain-agnostic core extracted from SONAR's weather-specific
 * interpolator: each app supplies its own param classification via `config`.
 *
 * Engine contract — the engine passed in must implement:
 *   applyParams(params)                  // bulk apply on first update (snap)
 *   rampParam(key, value, seconds)       // smooth continuous change
 *   scheduleDiscreteChange(key, value)   // snap at next musical boundary
 *
 * @param {object} engine
 * @param {object} config
 * @param {Record<string, number>} config.rampDurations - key → ramp seconds (continuous params)
 * @param {Set<string>} [config.discreteParams] - keys that snap discretely
 * @param {Set<string>} [config.metaParams] - keys ignored by the engine
 * @param {(engine, newParams, prevParams) => void} [config.onUpdate] - extra side-effects per update (e.g. event voices)
 * @param {number} [config.defaultRampSeconds] - fallback ramp for unknown continuous params
 * @returns {{ update: Function, reset: Function, currentParams: object|null }}
 */
export function createParamInterpolator(engine, config = {}) {
  const {
    rampDurations = {},
    discreteParams = new Set(),
    metaParams = new Set(),
    onUpdate = null,
    defaultRampSeconds = 10,
  } = config;

  let currentParams = null;
  let isFirstUpdate = true;

  return {
    update(newParams) {
      if (isFirstUpdate) {
        engine.applyParams(newParams);
        currentParams = { ...newParams };
        isFirstUpdate = false;
        if (onUpdate) onUpdate(engine, newParams, null);
        return;
      }

      for (const [key, value] of Object.entries(newParams)) {
        if (metaParams.has(key)) continue;
        if (currentParams[key] === value) continue;

        if (discreteParams.has(key)) {
          engine.scheduleDiscreteChange(key, value);
        } else if (key in rampDurations) {
          engine.rampParam(key, value, rampDurations[key]);
        } else {
          console.warn(`[interpolator] unknown param "${key}" — add it to rampDurations or discreteParams`);
          engine.rampParam(key, value, defaultRampSeconds);
        }
      }

      if (onUpdate) onUpdate(engine, newParams, currentParams);
      currentParams = { ...newParams };
    },

    get currentParams() {
      return currentParams;
    },

    /** Reset state so the next update() snap-applies instead of ramping. */
    reset() {
      currentParams = null;
      isFirstUpdate = true;
    },
  };
}
