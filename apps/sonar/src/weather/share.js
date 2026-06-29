export function buildShareSearch(latitude, longitude, precision = 4) {
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return '';
  const lat = latitude.toFixed(precision);
  const lng = longitude.toFixed(precision);
  return `?lat=${lat}&lng=${lng}`;
}

export function parseSharedCoordinates(search) {
  const params = new URLSearchParams(search || '');
  const lat = Number.parseFloat(params.get('lat'));
  const lng = Number.parseFloat(params.get('lng'));
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { latitude: lat, longitude: lng };
}

/**
 * Resolve startup coordinates and URL policy.
 * Shared links are authoritative and take precedence over browser geolocation.
 */
export function resolveStartupLocation({
  sharedCoords,
  browserLocation,
  fallback = { latitude: 40.7128, longitude: -74.006, name: 'New York, NY' },
}) {
  if (sharedCoords) {
    return {
      latitude: sharedCoords.latitude,
      longitude: sharedCoords.longitude,
      locationName: null,
      updateUrl: true,
      source: 'shared',
    };
  }

  if (browserLocation) {
    return {
      latitude: browserLocation.latitude,
      longitude: browserLocation.longitude,
      locationName: browserLocation.name ?? null,
      updateUrl: false,
      source: 'geolocation',
    };
  }

  return {
    latitude: fallback.latitude,
    longitude: fallback.longitude,
    locationName: fallback.name ?? null,
    updateUrl: false,
    source: 'fallback',
  };
}
