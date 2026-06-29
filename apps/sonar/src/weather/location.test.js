import { afterEach, describe, expect, it, vi } from 'vitest';
import { formatLocation, reverseGeocode } from './location.js';

describe('location display formatting', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('omits United States country label variants in formatted location', () => {
    expect(formatLocation({
      name: 'Boston',
      admin1: 'MA',
      country: 'United States',
    })).toBe('Boston, MA');

    expect(formatLocation({
      name: 'Boston',
      admin1: '',
      country: 'United States of America (the)',
    })).toBe('Boston');
  });

  it('normalizes reverse geocode output for US place names', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      json: async () => ({
        city: 'Boston',
        principalSubdivision: 'Massachusetts',
        principalSubdivisionCode: 'US-MA',
        countryName: 'United States of America (the)',
        countryCode: 'US',
      }),
    }));

    await expect(reverseGeocode(42.3601, -71.0589)).resolves.toBe('Boston, MA');
  });

  it('keeps country for non-US place names', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      json: async () => ({
        city: 'Paris',
        countryName: 'France',
        countryCode: 'FR',
      }),
    }));

    await expect(reverseGeocode(48.8566, 2.3522)).resolves.toBe('Paris, France');
  });
});
