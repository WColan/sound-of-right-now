const GEOCODING_URL = 'https://geocoding-api.open-meteo.com/v1/search';

/**
 * Get the user's current location via browser geolocation.
 * Returns { latitude, longitude, name } or null if denied/unavailable.
 */
export function getBrowserLocation() {
  return new Promise((resolve) => {
    if (!navigator.geolocation) {
      resolve(null);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          name: null, // Will be resolved by reverse lookup
        });
      },
      () => {
        resolve(null);
      },
      { timeout: 10000, maximumAge: 300000 }
    );
  });
}

/**
 * Search for cities by name using Open-Meteo's geocoding API.
 * @param {string} query - City name to search
 * @returns {Array<{name: string, latitude: number, longitude: number, country: string, admin1: string}>}
 */
export async function searchCities(query) {
  if (!query || query.length < 2) return [];

  const url = `${GEOCODING_URL}?name=${encodeURIComponent(query)}&count=5&language=en&format=json`;

  try {
    const response = await fetch(url);
    const data = await response.json();

    if (!data.results) return [];

    return data.results.map((r) => ({
      name: r.name,
      latitude: r.latitude,
      longitude: r.longitude,
      country: r.country || '',
      admin1: r.admin1 || '', // State/province
    }));
  } catch (err) {
    console.error('Geocoding search failed:', err);
    return [];
  }
}

/**
 * Reverse geocode coordinates to a place name.
 * Uses Open-Meteo geocoding with a nearby search.
 */
export async function reverseGeocode(latitude, longitude) {
  // Open-Meteo doesn't have a true reverse geocoding endpoint,
  // so we use a simple approach: search with coordinates rounded to get nearby city
  try {
    const url = `${GEOCODING_URL}?name=${latitude.toFixed(1)},${longitude.toFixed(1)}&count=1&language=en&format=json`;
    const response = await fetch(url);
    const data = await response.json();

    if (data.results && data.results.length > 0) {
      const r = data.results[0];
      return `${r.name}, ${r.admin1 || r.country}`;
    }
  } catch (err) {
    // Fallback: just show coordinates
  }

  return `${latitude.toFixed(2)}, ${longitude.toFixed(2)}`;
}

/**
 * Format a location result for display.
 */
export function formatLocation(result) {
  const parts = [result.name];
  if (result.admin1) parts.push(result.admin1);
  if (result.country && result.country !== 'United States') parts.push(result.country);
  return parts.join(', ');
}
