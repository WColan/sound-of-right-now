/**
 * NOAA Tides & Currents API client.
 *
 * Fetches current water level from the nearest NOAA tide station.
 * Returns null gracefully for inland locations (no nearby station).
 *
 * API docs: https://api.tidesandcurrents.noaa.gov/api/prod/
 */

const STATIONS_URL = 'https://api.tidesandcurrents.noaa.gov/mdapi/prod/webapi/stations.json';
const DATA_URL = 'https://api.tidesandcurrents.noaa.gov/api/prod/datagetter';

// Cache the station list (it doesn't change)
let stationCache = null;

/**
 * Fetch the list of NOAA tide stations.
 * Returns an array of { id, name, lat, lng }.
 */
async function getStations() {
  if (stationCache) return stationCache;

  try {
    const response = await fetch(`${STATIONS_URL}?type=waterlevels&units=english`);
    if (!response.ok) return [];

    const data = await response.json();
    stationCache = (data.stations || []).map((s) => ({
      id: s.id,
      name: s.name,
      lat: s.lat,
      lng: s.lng,
    }));
    return stationCache;
  } catch (err) {
    console.error('Failed to fetch NOAA stations:', err);
    return [];
  }
}

/**
 * Find the nearest NOAA tide station to a given lat/lng.
 * Returns null if no station is within maxDistanceKm.
 *
 * @param {number} lat
 * @param {number} lng
 * @param {number} [maxDistanceKm=80] - Max distance to search
 */
export async function findNearestStation(lat, lng, maxDistanceKm = 80) {
  const stations = await getStations();
  if (stations.length === 0) return null;

  let nearest = null;
  let nearestDist = Infinity;

  for (const station of stations) {
    const dist = haversineKm(lat, lng, station.lat, station.lng);
    if (dist < nearestDist) {
      nearestDist = dist;
      nearest = station;
    }
  }

  if (nearestDist > maxDistanceKm) return null;
  return { ...nearest, distanceKm: nearestDist };
}

/**
 * Fetch the latest water level from a NOAA station.
 *
 * @param {string} stationId
 * @returns {Promise<{waterLevel: number, time: Date}|null>}
 */
export async function fetchTideLevel(stationId) {
  const now = new Date();
  const begin = formatDate(new Date(now.getTime() - 60 * 60 * 1000)); // 1 hour ago
  const end = formatDate(now);

  const params = new URLSearchParams({
    begin_date: begin,
    end_date: end,
    station: stationId,
    product: 'water_level',
    datum: 'MLLW', // Mean Lower Low Water
    units: 'english',
    time_zone: 'gmt',
    format: 'json',
  });

  try {
    const response = await fetch(`${DATA_URL}?${params}`);
    if (!response.ok) return null;

    const data = await response.json();
    if (!data.data || data.data.length === 0) return null;

    // Get the most recent reading
    const latest = data.data[data.data.length - 1];
    return {
      waterLevel: parseFloat(latest.v), // feet above MLLW
      time: new Date(latest.t + ' GMT'),
    };
  } catch (err) {
    console.error('Tide fetch failed:', err);
    return null;
  }
}

/**
 * Create a tide data fetcher for a location.
 * Automatically finds the nearest station and polls for data.
 * Returns null if no nearby station exists (inland location).
 */
export async function createTideFetcher(latitude, longitude) {
  const station = await findNearestStation(latitude, longitude);
  if (!station) {
    console.log('No nearby tide station found (inland location)');
    return null;
  }

  console.log(`Using tide station: ${station.name} (${station.distanceKm.toFixed(1)} km away)`);

  let callback = null;
  let timer = null;
  let lastData = null;

  async function poll() {
    const data = await fetchTideLevel(station.id);
    if (data) {
      lastData = data;
      if (callback) callback(data);
    }
  }

  return {
    stationName: station.name,
    stationDistance: station.distanceKm,

    onUpdate(fn) {
      callback = fn;
    },

    async start() {
      await poll();
      // Tide data updates every 6 minutes from NOAA; poll every 10 minutes
      timer = setInterval(poll, 10 * 60 * 1000);
    },

    stop() {
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
    },

    get lastData() {
      return lastData;
    },
  };
}

// --- Utilities ---

function haversineKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function toRad(deg) {
  return (deg * Math.PI) / 180;
}

function formatDate(date) {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  const h = String(date.getUTCHours()).padStart(2, '0');
  const min = String(date.getUTCMinutes()).padStart(2, '0');
  return `${y}${m}${d} ${h}:${min}`;
}
