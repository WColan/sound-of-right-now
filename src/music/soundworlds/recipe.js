/**
 * Soundworld recipes.
 *
 * A *recipe* is a declarative object that reconfigures the existing engine into
 * a structurally distinct "song" — different orchestration, harmonic vocabulary,
 * timbre, form, and effect character — without rewriting any audio code.
 *
 * Everything a recipe expresses flows through the EXISTING parameter pipeline
 * (mapper → interpolator → engine). `applyRecipeToParams()` post-processes the
 * base mapper output:
 *   - orchestration mask  → silences absent voices (volume = MUTED_DB)
 *   - discrete overrides  → timbre / mood / noise / arpeggio + percussion patterns
 *   - scale pool          → constrains scaleType to the world's allowed scales
 *   - harmonic grammar    → selects a named progression grammar (see progression.js)
 *   - paramOverrides()    → final numeric fine-tuning (reverb, bpm bias, spread…)
 *
 * The DEFAULT_RECIPE is a faithful pass-through: applying it changes nothing, so
 * the original "Aurora" experience is preserved by construction.
 */

// Silenced voices are pulled to this level. Matches the engine's existing mute
// behavior (the mix panel uses -80 dB) — wind chime also deactivates below -70.
export const MUTED_DB = -80;

// Voice name → the volume parameter that controls it (mirrors main.js).
export const VOICE_VOLUME_PARAMS = {
  pad: 'padVolume',
  arpeggio: 'arpeggioVolume',
  bass: 'bassVolume',
  melody: 'melodyVolume',
  texture: 'textureVolume',
  percussion: 'percussionVolume',
  drone: 'droneVolume',
  windChime: 'windChimeVolume',
  choir: 'choirVolume',
};

// Discrete params a recipe may override directly. These already travel through
// the interpolator's DISCRETE_PARAMS machinery, so no engine change is needed
// for any of them except `grammar` (which the engine reads when generating
// progressions).
const OVERRIDE_KEYS = [
  'timbreProfile',
  'seasonalPalette',
  'melodyMood',
  'noiseType',
  'arpeggioRhythmPattern',
  'percussionPattern',
  'arpeggioPattern',
  'grammar',
];

/**
 * The default world — a no-op pass-through that reproduces the original
 * weather-driven experience exactly.
 */
export const DEFAULT_RECIPE = {
  id: 'default',
  name: 'Aurora',
  blurb: 'The original weather-driven ambient drift',
  // Low baseline affinity — only wins when nothing else matches.
  match: () => 0.1,
  voices: {
    pad: true, arpeggio: true, bass: true, drone: true, melody: true,
    texture: true, percussion: true, windChime: true, choir: true,
  },
  // Empty overrides → grammar stays weather-driven, scaleType stays temperature-driven.
  overrides: {},
  form: { personality: null },
  paramOverrides: (params) => params,
};

/**
 * Merge a partial world recipe over the default recipe so every field is present.
 * @param {object} partial - A world's partial recipe definition
 * @returns {object} A complete recipe
 */
export function mergeRecipe(partial = {}) {
  return {
    ...DEFAULT_RECIPE,
    ...partial,
    voices: { ...DEFAULT_RECIPE.voices, ...(partial.voices || {}) },
    overrides: { ...DEFAULT_RECIPE.overrides, ...(partial.overrides || {}) },
    form: { ...DEFAULT_RECIPE.form, ...(partial.form || {}) },
    match: typeof partial.match === 'function' ? partial.match : DEFAULT_RECIPE.match,
    paramOverrides: typeof partial.paramOverrides === 'function'
      ? partial.paramOverrides
      : DEFAULT_RECIPE.paramOverrides,
  };
}

/**
 * Apply a recipe to a set of base mapper params, returning a reshaped copy.
 *
 * Pure function — safe to unit test without Tone.js. With DEFAULT_RECIPE this
 * is an identity transform (the risk firewall for the original experience).
 *
 * @param {object} params - Base output of mapWeatherToMusic()
 * @param {object} recipe - A complete recipe (see mergeRecipe)
 * @param {object} [ctx] - Environmental context (passed to paramOverrides)
 * @param {object} [weather] - Raw weather state (passed to paramOverrides)
 * @returns {object} Reshaped params
 */
export function applyRecipeToParams(params, recipe, ctx = {}, weather = {}) {
  if (!recipe) return params;
  const out = { ...params };

  // ── Orchestration mask: silence absent voices ──
  for (const [voice, enabled] of Object.entries(recipe.voices || {})) {
    if (enabled === false) {
      const volParam = VOICE_VOLUME_PARAMS[voice];
      if (volParam) out[volParam] = MUTED_DB;
    }
  }

  // ── Discrete overrides ──
  const ov = recipe.overrides || {};
  for (const key of OVERRIDE_KEYS) {
    if (ov[key] != null) out[key] = ov[key];
  }

  // ── Scale pool constraint ──
  // Keep the temperature-derived scale if it's allowed; otherwise snap to the
  // world's primary scale. Worlds can do finer mapping in paramOverrides.
  if (Array.isArray(ov.scalePool) && ov.scalePool.length > 0
      && !ov.scalePool.includes(out.scaleType)) {
    out.scaleType = ov.scalePool[0];
  }

  // ── Final numeric fine-tuning ──
  if (typeof recipe.paramOverrides === 'function') {
    return recipe.paramOverrides(out, weather, ctx) || out;
  }
  return out;
}
