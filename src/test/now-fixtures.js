/**
 * Hand-built NowSnapshots for tests. Sky values are set directly so each
 * scenario is deterministic regardless of the astronomy at test time.
 */
export function baseWeather(overrides = {}) {
  return {
    temperature: 15, apparentTemperature: 15, humidity: 55, dewPoint: 6, pressure: 1015, pressureTendency: 0,
    windSpeed: 8, windGusts: 14, windDirection: 225, weatherCode: 1, category: 'clear', cloudCover: 10,
    precipitation: 0, snowfall: 0, isDay: true, visibility: 24000, radiation: 400, uvIndex: 3, cape: 0,
    snowDepth: 0, sunrise: null, sunset: null, daylightSeconds: 40000, elevation: 20, utcOffsetSeconds: -14400,
    ...overrides,
  };
}

export function makeSnapshot({
  weather = {}, sun = {}, moon = {}, planets = [], darkness, calendar = {}, location = {}, ...rest
} = {}) {
  const sunAlt = sun.altitude ?? 40;
  const dark = darkness ?? Math.min(1, Math.max(0, (2 - sunAlt) / 20));
  return {
    at: Date.UTC(2026, 9, 17, 16),
    location: { lat: 42.36, lng: -71.06, name: 'Boston, MA', elevation: 20, biome: 'urban', population: 650000, countryCode: 'US', ...location },
    calendar: {
      hour: 12, minute: 0, weekday: 3, isWeekend: false, dayOfYear: 290, year: 2026, localDate: '2026-10-17',
      holiday: null, season: 'autumn', seasonFactor: 0.4,
      solstice: { proximity: 0.3, isSummerSolstice: false, isSolsticeDay: false, isEquinoxDay: false },
      meteors: { shower: null, zhr: 6 }, activity: 0.6,
      ...calendar,
    },
    sky: {
      sun: { altitude: sunAlt, azimuth: sun.azimuth ?? 180, rising: sun.rising ?? false },
      moon: { altitude: -20, azimuth: 90, phaseDeg: 90, illumination: 0.5, waxing: true, ...moon },
      planets,
      twilight: sunAlt > 6 ? 'day' : 'night',
      darkness: dark,
      lst: 6,
    },
    weather: baseWeather(weather),
    air: null, marine: null, tide: null, river: null, space: null, quakes: null, iss: null, life: null,
    availability: {},
    ...rest,
  };
}
