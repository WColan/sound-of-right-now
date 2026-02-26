/**
 * Biome classification — detect terrain type for a location.
 *
 * Uses the Overpass API (OpenStreetMap) to query landuse/natural tags
 * within a ~5km radius, then classifies into one of the biome categories.
 * Falls back to elevation + latitude heuristics if the API is unavailable.
 *
 * Result is cached per location (biome doesn't change during a session).
 */

const OVERPASS_URL = 'https://overpass-api.de/api/interpreter';

/**
 * @typedef {'coastal'|'desert'|'forest'|'mountain'|'urban'|'grassland'|'arctic'|'wetland'|'tropical'} BiomeType
 */

// Cache: `"lat,lng"` → biome string (rounded to 2 decimals for cache key)
const biomeCache = new Map();

/**
 * Classify the biome at a given location.
 *
 * @param {number} latitude
 * @param {number} longitude
 * @param {object} [options]
 * @param {number} [options.elevation] - Meters above sea level (from Open-Meteo)
 * @returns {Promise<BiomeType>}
 */
export async function classifyBiome(latitude, longitude, options = {}) {
  const key = `${latitude.toFixed(2)},${longitude.toFixed(2)}`;
  if (biomeCache.has(key)) return biomeCache.get(key);

  let biome;
  try {
    biome = await classifyViaOverpass(latitude, longitude);
  } catch {
    // API unavailable — use heuristic fallback
    biome = classifyHeuristic(latitude, longitude, options.elevation ?? 0);
  }

  biomeCache.set(key, biome);
  return biome;
}

/**
 * Query OpenStreetMap Overpass API for landuse/natural tags in a 5km radius.
 * Returns the most dominant biome type from the results.
 */
async function classifyViaOverpass(latitude, longitude) {
  const radius = 5000; // 5km
  const query = `
    [out:json][timeout:10];
    (
      way["natural"](around:${radius},${latitude},${longitude});
      way["landuse"](around:${radius},${latitude},${longitude});
      relation["natural"](around:${radius},${latitude},${longitude});
      relation["landuse"](around:${radius},${latitude},${longitude});
    );
    out tags 50;
  `;

  const response = await fetch(OVERPASS_URL, {
    method: 'POST',
    body: `data=${encodeURIComponent(query)}`,
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    signal: AbortSignal.timeout(10000),
  });

  if (!response.ok) throw new Error(`Overpass API ${response.status}`);
  const data = await response.json();

  return classifyFromOSMTags(data.elements || []);
}

// OSM tag → biome category mapping (priority order)
const TAG_BIOME_MAP = [
  // Natural features
  { key: 'natural', value: 'coastline', biome: 'coastal' },
  { key: 'natural', value: 'beach', biome: 'coastal' },
  { key: 'natural', value: 'bay', biome: 'coastal' },
  { key: 'natural', value: 'water', biome: 'wetland' },
  { key: 'natural', value: 'wetland', biome: 'wetland' },
  { key: 'natural', value: 'marsh', biome: 'wetland' },
  { key: 'natural', value: 'wood', biome: 'forest' },
  { key: 'natural', value: 'tree_row', biome: 'forest' },
  { key: 'natural', value: 'scrub', biome: 'grassland' },
  { key: 'natural', value: 'heath', biome: 'grassland' },
  { key: 'natural', value: 'grassland', biome: 'grassland' },
  { key: 'natural', value: 'sand', biome: 'desert' },
  { key: 'natural', value: 'bare_rock', biome: 'mountain' },
  { key: 'natural', value: 'scree', biome: 'mountain' },
  { key: 'natural', value: 'glacier', biome: 'arctic' },
  // Landuse
  { key: 'landuse', value: 'residential', biome: 'urban' },
  { key: 'landuse', value: 'commercial', biome: 'urban' },
  { key: 'landuse', value: 'industrial', biome: 'urban' },
  { key: 'landuse', value: 'retail', biome: 'urban' },
  { key: 'landuse', value: 'forest', biome: 'forest' },
  { key: 'landuse', value: 'farmland', biome: 'grassland' },
  { key: 'landuse', value: 'meadow', biome: 'grassland' },
  { key: 'landuse', value: 'orchard', biome: 'grassland' },
  { key: 'landuse', value: 'vineyard', biome: 'grassland' },
  { key: 'landuse', value: 'basin', biome: 'wetland' },
];

/**
 * Count biome votes from OSM elements and return the majority winner.
 */
function classifyFromOSMTags(elements) {
  const votes = {};

  for (const el of elements) {
    const tags = el.tags || {};
    for (const { key, value, biome } of TAG_BIOME_MAP) {
      if (tags[key] === value) {
        votes[biome] = (votes[biome] || 0) + 1;
        break; // First match per element wins
      }
    }
  }

  // Return the biome with the most votes, or 'grassland' as default
  let best = 'grassland';
  let bestCount = 0;
  for (const [biome, count] of Object.entries(votes)) {
    if (count > bestCount) {
      best = biome;
      bestCount = count;
    }
  }

  return best;
}

/**
 * Heuristic fallback: classify biome from elevation + latitude alone.
 * Used when the Overpass API is unavailable.
 */
function classifyHeuristic(latitude, longitude, elevation) {
  const absLat = Math.abs(latitude);

  if (absLat > 65) return 'arctic';
  if (elevation > 2000) return 'mountain';
  if (elevation > 1000 && absLat > 40) return 'mountain';

  // Tropical band: within 23.5° of equator, low elevation
  if (absLat < 23.5 && elevation < 500) return 'tropical';

  // Desert bands: 15-35° latitude, low elevation (Hadley cell deserts)
  if (absLat > 15 && absLat < 35 && elevation < 800) return 'desert';

  return 'grassland';
}
