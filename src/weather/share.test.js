import { describe, expect, it } from 'vitest';
import { buildShareSearch, parseSharedCoordinates } from './share.js';

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
