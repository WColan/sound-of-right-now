/**
 * The Stage — an attention budget so twenty sources never become noise.
 *
 * Rules:
 *  - At most MAX_FOREGROUND sections are "featured" at once (allowed motifs,
 *    +gain). Everything else that's on sits in the bed.
 *  - One featured section per registral zone, so features never mask each other.
 *  - Hysteresis: a featured section keeps a bonus and a minimum hold time, so
 *    the spotlight doesn't flicker as data jitters.
 *  - Spotlight events (quake, hour bell, ISS pass…) duck everything else.
 *
 * Pure: (score, previous stage state, now) → stage state.
 */
import { ZONE_OF, SECTION_IDS } from './score.js';

export const MAX_FOREGROUND = 3;
export const MIN_HOLD_MS = 90_000;
export const INCUMBENT_BONUS = 0.12;
export const FOREGROUND_DB = 3;
export const BED_DB = -2;
export const SPOTLIGHT_DUCK_DB = -7;
// The harmonic bed never yields its place entirely.
const ALWAYS_BED = new Set(['strings', 'basses']);

export function createStageState() {
  return { foreground: [], since: {}, spotlight: null };
}

/**
 * @param {object} score - from composeScore()
 * @param {object} prev - previous stage state (createStageState())
 * @param {number} nowMs
 * @param {object} [spotlight] - { id, until } of an active event, if any
 */
export function arrangeStage(score, prev = createStageState(), nowMs = Date.now(), spotlight = null) {
  const candidates = SECTION_IDS
    .filter((id) => score.sections[id]?.on)
    .map((id) => {
      const s = score.sections[id];
      const incumbent = prev.foreground.includes(id);
      const held = incumbent && nowMs - (prev.since[id] ?? nowMs) < MIN_HOLD_MS;
      return { id, zone: ZONE_OF[id], score: s.salience + (incumbent ? INCUMBENT_BONUS : 0), held };
    })
    .filter((c) => c.score > 0.2 || c.held)
    .sort((a, b) => (b.held - a.held) || (b.score - a.score));

  const foreground = [];
  const zonesTaken = new Set();
  for (const c of candidates) {
    if (foreground.length >= MAX_FOREGROUND) break;
    if (zonesTaken.has(c.zone)) continue;
    foreground.push(c.id);
    zonesTaken.add(c.zone);
  }

  const since = {};
  for (const id of foreground) since[id] = prev.foreground.includes(id) ? (prev.since[id] ?? nowMs) : nowMs;

  const activeSpotlight = spotlight && spotlight.until > nowMs ? spotlight : null;
  const roles = {};
  const gainDb = {};
  for (const id of SECTION_IDS) {
    const s = score.sections[id];
    if (!s?.on) {
      roles[id] = 'silent';
      gainDb[id] = -Infinity;
      continue;
    }
    roles[id] = foreground.includes(id) ? 'foreground' : 'bed';
    let db = roles[id] === 'foreground' ? FOREGROUND_DB : BED_DB;
    if (activeSpotlight && activeSpotlight.id !== id) db += ALWAYS_BED.has(id) ? SPOTLIGHT_DUCK_DB / 2 : SPOTLIGHT_DUCK_DB;
    gainDb[id] = db;
  }

  return { foreground, since, spotlight: activeSpotlight, roles, gainDb };
}
