import { describe, expect, it } from 'vitest';
import { WORLDS, getWorld, selectWorld, listWorlds } from './index.js';

// A neutral, temperate-clear context that no specialised world matches strongly.
function neutralCtx() {
  return {
    category: 'clear',
    season: 'spring',
    isNight: false,
    temperature: 14,
    apparentTemperature: 14,
    humidity: 50,
    windSpeed: 8,
    latitude: 40,
    biome: 'grassland',
    uvIndex: 3,
    cloudCover: 20,
    elevation: 50,
  };
}

describe('soundworld registry', () => {
  it('registers the default world plus the full slate', () => {
    const ids = WORLDS.map((w) => w.id);
    expect(ids[0]).toBe('default');
    expect(ids).toEqual(expect.arrayContaining([
      'frigid-night', 'warm-afternoon', 'tempest', 'coastal-fog', 'monsoon',
      'arid-expanse', 'snowfall', 'alpine', 'tropical-night',
    ]));
  });

  it('getWorld returns a complete recipe and falls back to default', () => {
    expect(getWorld('tempest').id).toBe('tempest');
    expect(getWorld('nope').id).toBe('default');
    expect(typeof getWorld('alpine').paramOverrides).toBe('function');
  });

  it('listWorlds exposes id/name/blurb metadata only', () => {
    const list = listWorlds();
    expect(list.length).toBe(WORLDS.length);
    for (const entry of list) {
      expect(entry).toHaveProperty('id');
      expect(entry).toHaveProperty('name');
      expect(entry).toHaveProperty('blurb');
      expect(entry).not.toHaveProperty('match');
    }
  });
});

describe('selectWorld', () => {
  it('falls back to the default world for a neutral context', () => {
    expect(selectWorld(neutralCtx()).id).toBe('default');
  });

  it('selects Tempest for a storm', () => {
    expect(selectWorld({ ...neutralCtx(), category: 'storm' }).id).toBe('tempest');
  });

  it('selects Frigid Night for a sub-zero night', () => {
    const ctx = { ...neutralCtx(), isNight: true, temperature: -12, apparentTemperature: -15 };
    expect(selectWorld(ctx).id).toBe('frigid-night');
  });

  it('selects Warm Afternoon for a hot clear summer day', () => {
    const ctx = {
      ...neutralCtx(), category: 'clear', isNight: false,
      temperature: 28, apparentTemperature: 28, season: 'summer',
    };
    expect(selectWorld(ctx).id).toBe('warm-afternoon');
  });

  it('selects Arid Expanse for a hot dry desert', () => {
    const ctx = {
      ...neutralCtx(), biome: 'desert', temperature: 34,
      apparentTemperature: 34, humidity: 15,
    };
    expect(selectWorld(ctx).id).toBe('arid-expanse');
  });

  it('selects Coastal Fog for fog on the coast', () => {
    const ctx = { ...neutralCtx(), category: 'fog', biome: 'coastal', humidity: 95 };
    expect(selectWorld(ctx).id).toBe('coastal-fog');
  });

  it('distinguishes daytime Snowfall from nighttime Frigid Night', () => {
    const day = { ...neutralCtx(), category: 'snow', isNight: false, temperature: -1, apparentTemperature: -1 };
    expect(selectWorld(day).id).toBe('snowfall');
    const night = { ...neutralCtx(), category: 'snow', isNight: true, temperature: -8, apparentTemperature: -10 };
    expect(selectWorld(night).id).toBe('frigid-night');
  });

  it('never throws and always returns a world for an empty context', () => {
    expect(selectWorld({}).id).toBeTruthy();
  });
});
