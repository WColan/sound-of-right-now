/**
 * Soundworld registry + selector.
 *
 * Holds every world recipe and picks the best match for a given environmental
 * context. The default world ("Aurora") carries a low baseline affinity, so it
 * only wins when no specialised world matches strongly.
 *
 * A world is "navigable": weather selects a default, but the UI can lock any
 * world by id via getWorld().
 */
import { DEFAULT_RECIPE, mergeRecipe } from './recipe.js';
import frigidNight from './worlds/frigid-night.js';
import warmAfternoon from './worlds/warm-afternoon.js';
import tempest from './worlds/tempest.js';
import coastalFog from './worlds/coastal-fog.js';
import monsoon from './worlds/monsoon.js';
import aridExpanse from './worlds/arid-expanse.js';
import snowfall from './worlds/snowfall.js';
import alpine from './worlds/alpine.js';
import tropicalNight from './worlds/tropical-night.js';

// Ordered list of all worlds (default first). Each entry is a complete recipe.
export const WORLDS = [
  mergeRecipe(DEFAULT_RECIPE),
  mergeRecipe(frigidNight),
  mergeRecipe(warmAfternoon),
  mergeRecipe(tempest),
  mergeRecipe(coastalFog),
  mergeRecipe(monsoon),
  mergeRecipe(aridExpanse),
  mergeRecipe(snowfall),
  mergeRecipe(alpine),
  mergeRecipe(tropicalNight),
];

const WORLDS_BY_ID = new Map(WORLDS.map((w) => [w.id, w]));

/**
 * Get a world recipe by id. Falls back to the default world.
 * @param {string} id
 * @returns {object} A complete recipe
 */
export function getWorld(id) {
  return WORLDS_BY_ID.get(id) || WORLDS_BY_ID.get('default');
}

/**
 * Select the highest-affinity world for an environmental context.
 *
 * @param {object} ctx - { category, season, isNight, temperature,
 *   apparentTemperature, humidity, windSpeed, latitude, biome, uvIndex,
 *   cloudCover, elevation }
 * @returns {object} The winning complete recipe
 */
export function selectWorld(ctx = {}) {
  let best = WORLDS_BY_ID.get('default');
  let bestScore = -Infinity;
  for (const world of WORLDS) {
    let score = 0;
    try {
      score = world.match(ctx) ?? 0;
    } catch {
      score = 0;
    }
    if (score > bestScore) {
      bestScore = score;
      best = world;
    }
  }
  return best;
}

/**
 * Lightweight metadata for UI listings (no functions).
 * @returns {Array<{id, name, blurb}>}
 */
export function listWorlds() {
  return WORLDS.map(({ id, name, blurb }) => ({ id, name, blurb }));
}
