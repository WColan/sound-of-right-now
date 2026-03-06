import { describe, expect, it } from 'vitest';
import { buildShareSearch, parseSharedCoordinates, resolveStartupLocation } from './share.js';

describe('share coordinate params', () => {
  it('builds a stable share query from coordinates', () => {
    expect(buildShareSearch(42.3601, -71.0589)).toBe('?lat=42.3601&lng=-71.0589');
    expect(buildShareSearch(42.360123, -71.058912)).toBe('?lat=42.3601&lng=-71.0589');
  });

  it('parses shared coordinates from query string', () => {
    expect(parseSharedCoordinates('?lat=42.3601&lng=-71.0589')).toEqual({
      latitude: 42.3601,
      longitude: -71.0589,
    });
    expect(parseSharedCoordinates('?lng=-71.0589&lat=42.3601&x=1')).toEqual({
      latitude: 42.3601,
      longitude: -71.0589,
    });
  });

  it('returns null when share params are missing or invalid', () => {
    expect(parseSharedCoordinates('')).toBeNull();
    expect(parseSharedCoordinates('?lat=abc&lng=-71.0589')).toBeNull();
    expect(parseSharedCoordinates('?lat=42.3601')).toBeNull();
  });
});

describe('resolveStartupLocation', () => {
  it('prefers shared coordinates over browser geolocation', () => {
    const resolved = resolveStartupLocation({
      sharedCoords: { latitude: 48.8566, longitude: 2.3522 },
      browserLocation: { latitude: 40.7128, longitude: -74.006, name: 'New York, NY' },
    });

    expect(resolved).toEqual({
      latitude: 48.8566,
      longitude: 2.3522,
      locationName: null,
      updateUrl: true,
      source: 'shared',
    });
  });

  it('uses browser location when no shared coordinates exist', () => {
    const resolved = resolveStartupLocation({
      sharedCoords: null,
      browserLocation: { latitude: 40.7128, longitude: -74.006, name: null },
    });

    expect(resolved).toEqual({
      latitude: 40.7128,
      longitude: -74.006,
      locationName: null,
      updateUrl: false,
      source: 'geolocation',
    });
  });

  it('falls back to New York when neither shared nor browser location is available', () => {
    const resolved = resolveStartupLocation({
      sharedCoords: null,
      browserLocation: null,
    });

    expect(resolved).toEqual({
      latitude: 40.7128,
      longitude: -74.006,
      locationName: 'New York, NY',
      updateUrl: false,
      source: 'fallback',
    });
  });
});
