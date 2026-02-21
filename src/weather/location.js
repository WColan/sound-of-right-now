const GEOCODING_URL = 'https://geocoding-api.open-meteo.com/v1/search';
const US_COUNTRY_NAMES = new Set([
  'United States',
  'United States of America',
  'USA',
  'US',
]);

function normalizeCountryName(value) {
  return String(value || '').replace(/\s*\((?:the)\)\s*$/i, '').trim();
}

function isUnitedStatesName(value) {
  return US_COUNTRY_NAMES.has(normalizeCountryName(value));
}

function getUSStateLabel(data) {
  const code = String(data?.principalSubdivisionCode || '');
  const suffix = code.split('-').pop();
  if (suffix && /^[A-Za-z]{2}$/.test(suffix)) {
    return suffix.toUpperCase();
  }
  return String(data?.principalSubdivision || '').trim();
}

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
 * Uses BigDataCloud's free reverse geocoding API (no key required).
 */
export async function reverseGeocode(latitude, longitude) {
  try {
    const url = `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${latitude}&longitude=${longitude}&localityLanguage=en`;
    const response = await fetch(url);
    const data = await response.json();

    const city = data.city || data.locality || data.principalSubdivision;
    const country = normalizeCountryName(data.countryName);
    const countryCode = String(data.countryCode || '').toUpperCase();
    const admin1 = countryCode === 'US' ? getUSStateLabel(data) : '';

    if (city) {
      return formatLocation({
        name: city,
        admin1,
        country,
      });
    }
    if (data.principalSubdivision) {
      return formatLocation({
        name: data.principalSubdivision,
        admin1: '',
        country,
      });
    }
    if (country) return country;
  } catch (err) {
    // Fallback: just show coordinates
  }

  return `${latitude.toFixed(2)}, ${longitude.toFixed(2)}`;
}

/**
 * Format a location result for display.
 */
export function formatLocation(result) {
  const name = String(result?.name || '').trim();
  const admin1 = String(result?.admin1 || '').trim();
  const country = normalizeCountryName(result?.country || '');

  const parts = [];
  if (name) parts.push(name);
  if (admin1) parts.push(admin1);
  if (country && !isUnitedStatesName(country)) parts.push(country);
  return parts.join(', ');
}
