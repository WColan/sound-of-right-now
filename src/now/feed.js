/**
 * The Now feed — polls every source on its own natural cadence and emits a
 * fresh NowSnapshot whenever anything changes (plus a slow clock tick, since
 * the sky moves even when the data doesn't).
 *
 * Generation-safe: stop() / a new feed invalidate in-flight responses.
 */
import { buildSnapshot } from './snapshot.js';
import { loadWeather } from './sources/weather.js';
import { loadAir } from './sources/air.js';
import { loadMarine } from './sources/marine.js';
import { loadRiver } from './sources/river.js';
import { loadSpace } from './sources/space.js';
import { loadQuakes } from './sources/quakes.js';
import { loadIss, ISS_RANGE_KM } from './sources/iss.js';
import { loadLife } from './sources/life.js';
import { loadPlace } from './sources/place.js';
import { loadTide } from './sources/tide.js';
import { classifyBiome } from '../weather/biome.js';

const MIN = 60000;
const CLOCK_TICK_MS = 20000;

export function createNowFeed({ lat, lng, name = null, fetchImpl, now = () => Date.now(), classify = classifyBiome } = {}) {
  const state = { lat, lng, name, weather: null, air: null, marine: null, tide: null, river: null,
    space: null, quakes: null, iss: null, life: null, place: null, biome: null };
  const timers = new Set();
  const snapshotListeners = new Set();
  const eventListeners = new Set();
  const seenQuakes = new Set();
  let running = false;
  let generation = 0;
  let emitTimer = null;
  let lastSnapshot = null;
  let tideStation;
  let placeInfo = { name, countryCode: null };
  let placeLoaded = false;
  let firstQuakeLoad = true;

  const ctx = () => ({ lat, lng, now: now(), fetchImpl });

  function emitSoon() {
    if (emitTimer) return;
    emitTimer = setTimeout(() => {
      emitTimer = null;
      if (!running) return;
      lastSnapshot = buildSnapshot(state, now());
      snapshotListeners.forEach((fn) => fn(lastSnapshot));
    }, 150);
  }

  function emitEvent(event) {
    eventListeners.forEach((fn) => fn(event));
  }

  function every(ms, task) {
    const gen = generation;
    let handle = null;
    const run = async () => {
      if (gen !== generation) return;
      let next = ms;
      try {
        const result = await task(gen);
        if (typeof result === 'number') next = result; // task can reschedule itself
        if (result === false) return;                  // or stop permanently
      } catch (err) {
        console.warn('[now] source failed', err);
      }
      if (gen !== generation) return;
      timers.delete(handle);
      handle = setTimeout(run, next);
      timers.add(handle);
    };
    run();
  }

  function set(key, value, gen) {
    if (gen !== generation) return false;
    state[key] = value;
    emitSoon();
    return true;
  }

  async function maybeLoadPlace(gen) {
    if (placeLoaded || !placeInfo.name || !state.weather) return;
    placeLoaded = true;
    const localDate = new Date(now() + state.weather.utcOffsetSeconds * 1000).toISOString().slice(0, 10);
    set('place', await loadPlace({ lat, lng, placeName: placeInfo.name, countryCode: placeInfo.countryCode, localDate, fetchImpl }), gen);
  }

  function startSources() {
    every(1 * MIN, async (gen) => {
      const w = await loadWeather(ctx());
      if (!w) return 30000;
      const first = !state.weather;
      set('weather', w, gen);
      if (first) {
        classify(lat, lng, { elevation: w.elevation }).then((b) => set('biome', b, gen)).catch(() => {});
        maybeLoadPlace(gen);
      }
    });
    every(15 * MIN, async (gen) => { set('air', await loadAir(ctx()), gen); });
    every(15 * MIN, async (gen) => {
      const m = await loadMarine(ctx());
      set('marine', m, gen);
      return m ? undefined : false; // inland: never ask again for this location
    });
    every(180 * MIN, async (gen) => {
      const r = await loadRiver(ctx());
      set('river', r, gen);
      return r ? undefined : false;
    });
    every(10 * MIN, async (gen) => {
      const { station, tide } = await loadTide({ ...ctx(), station: tideStation });
      tideStation = station;
      set('tide', tide, gen);
      return station ? undefined : false;
    });
    every(5 * MIN, async (gen) => { set('space', await loadSpace(ctx()), gen); });
    every(3 * MIN, async (gen) => {
      const q = await loadQuakes(ctx());
      if (!set('quakes', q, gen) || !q) return;
      // New audible quakes become events. On the first load only the most
      // recent quake from the last hour is replayed, so arriving "now" means
      // hearing what the ground just did.
      const fresh = q.audible.filter((x) => !seenQuakes.has(x.id));
      fresh.forEach((x) => seenQuakes.add(x.id));
      const toAnnounce = firstQuakeLoad ? fresh.filter((x) => x.ageMinutes <= 60).slice(0, 1) : fresh.filter((x) => x.ageMinutes <= 30);
      firstQuakeLoad = false;
      toAnnounce.reverse().forEach((quake) => emitEvent({ type: 'quake', quake }));
    });
    every(15000, async (gen) => {
      const iss = await loadIss({ ...ctx(), previous: state.iss });
      set('iss', iss, gen);
      if (!iss) return 60000;
      // Far away → poll slowly; near → keep the Doppler smooth
      return iss.groundKm > ISS_RANGE_KM * 3 ? 60000 : iss.inRange ? 5000 : 15000;
    });
    every(24 * 60 * MIN, async (gen) => { set('life', await loadLife(ctx()), gen); });
    every(CLOCK_TICK_MS, async () => { emitSoon(); });
  }

  return {
    start() {
      if (running) return;
      running = true;
      generation++;
      startSources();
    },
    stop() {
      running = false;
      generation++;
      timers.forEach(clearTimeout);
      timers.clear();
      if (emitTimer) clearTimeout(emitTimer);
      emitTimer = null;
    },
    onSnapshot(fn) {
      snapshotListeners.add(fn);
      return () => snapshotListeners.delete(fn);
    },
    onEvent(fn) {
      eventListeners.add(fn);
      return () => eventListeners.delete(fn);
    },
    /** Called once the location name / country is known (reverse geocode). */
    setPlaceInfo(info) {
      placeInfo = { ...placeInfo, ...info };
      state.name = placeInfo.name;
      maybeLoadPlace(generation);
      emitSoon();
    },
    get snapshot() {
      return lastSnapshot;
    },
    get state() {
      return state;
    },
  };
}
