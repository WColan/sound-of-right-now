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
