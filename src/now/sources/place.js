/**
 * The human layer of a place: how many people live here, and whether today
 * is a day the town celebrates.
 *  - Population: Open-Meteo Geocoding (GeoNames) — nearest named place.
 *  - Holidays:   Nager.Date public holiday API.
 * Both free, keyless, CORS.
 */
import { fetchJson, query } from '../http.js';
import { haversineKm } from '../util.js';

export const GEOCODE_URL = 'https://geocoding-api.open-meteo.com/v1/search';
export const HOLIDAYS_URL = 'https://date.nager.at/api/v3/PublicHolidays';

export function pickNearestPopulation(data, lat, lng, maxKm = 40) {
  let best = null;
  for (const r of data?.results ?? []) {
    const d = haversineKm(lat, lng, r.latitude, r.longitude);
    if (d <= maxKm && (!best || d < best.d)) best = { d, population: r.population ?? null, countryCode: r.country_code ?? null };
  }
  return best;
}

/** Holiday whose date equals the location-local date (YYYY-MM-DD), if any. */
export function findHoliday(holidays, localDate) {
  if (!Array.isArray(holidays)) return null;
  const h = holidays.find((x) => x.date === localDate && (x.global !== false || !x.counties));
  return h ? { name: h.name, localName: h.localName } : null;
}

export async function loadPlace({ lat, lng, placeName, countryCode, localDate, fetchImpl }) {
  let population = null;
  let cc = countryCode ?? null;
  const city = String(placeName || '').split(',')[0].trim();
  if (city) {
    const geo = await fetchJson(`${GEOCODE_URL}?${query({ name: city, count: 10, language: 'en', format: 'json' })}`, { fetchImpl });
    const nearest = pickNearestPopulation(geo, lat, lng);
    if (nearest) {
      population = nearest.population;
      cc = cc ?? nearest.countryCode;
    }
  }
  let holiday = null;
  if (cc && localDate) {
    holiday = findHoliday(await fetchJson(`${HOLIDAYS_URL}/${localDate.slice(0, 4)}/${cc}`, { fetchImpl }), localDate);
  }
  return { population, countryCode: cc, holiday };
}
