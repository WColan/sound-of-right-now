/**
 * NowSnapshot — everything we know about this moment, in one object.
 * Pure: raw source state + clock → snapshot. Missing sources are null and
 * flagged in `availability`, so the score can simply leave them silent.
 */
import { computeCalendar } from './calendar.js';
import { computeSky } from './sky.js';

export const SOURCE_IDS = [
  'weather', 'air', 'marine', 'tide', 'river', 'space', 'quakes', 'iss', 'life', 'place', 'biome',
];

/**
 * @param {object} state - { lat, lng, name, weather, air, marine, tide, river, space, quakes, iss, life, place, biome }
 * @param {number} nowMs
 */
export function buildSnapshot(state, nowMs = Date.now()) {
  const weather = state.weather ?? null;
  const utcOffsetSeconds = weather?.utcOffsetSeconds ?? Math.round(state.lng / 15) * 3600;
  const calendar = computeCalendar({
    nowMs,
    utcOffsetSeconds,
    latitude: state.lat,
    holiday: state.place?.holiday ?? null,
  });
  const sky = computeSky({ lat: state.lat, lng: state.lng, elevation: weather?.elevation ?? 0, date: new Date(nowMs) });

  const availability = Object.fromEntries(SOURCE_IDS.map((id) => [id, state[id] != null]));
  return {
    at: nowMs,
    location: {
      lat: state.lat,
      lng: state.lng,
      name: state.name ?? null,
      elevation: weather?.elevation ?? 0,
      biome: state.biome ?? 'grassland',
      population: state.place?.population ?? null,
      countryCode: state.place?.countryCode ?? null,
    },
    calendar,
    sky,
    weather,
    air: state.air ?? null,
    marine: state.marine ?? null,
    tide: state.tide ?? null,
    river: state.river ?? null,
    space: state.space ?? null,
    quakes: state.quakes ?? null,
    iss: state.iss ?? null,
    life: state.life ?? null,
    availability,
  };
}
