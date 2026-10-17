/**
 * iNaturalist — who lives here. Species observed nearby in the last 30 days,
 * split into birds, insects and amphibians.
 * https://api.inaturalist.org/v1/docs (free, keyless, CORS)
 *
 * Observation counts reflect observer effort as much as abundance, so the
 * score only uses these as a gentle multiplier on a season/time-of-day model.
 */
import { fetchJson, query } from '../http.js';

export const INAT_URL = 'https://api.inaturalist.org/v1/observations/species_counts';

export function buildLifeUrl(lat, lng, nowMs = Date.now()) {
  const d1 = new Date(nowMs - 30 * 86400000).toISOString().slice(0, 10);
  return `${INAT_URL}?${query({
    lat: lat.toFixed(3),
    lng: lng.toFixed(3),
    radius: 25,
    d1,
    iconic_taxa: 'Aves,Insecta,Amphibia',
    quality_grade: 'research',
    per_page: 200,
  })}`;
}

export function normalizeLife(data) {
  if (!Array.isArray(data?.results)) return null;
  const tally = { Aves: [], Insecta: [], Amphibia: [] };
  for (const r of data.results) {
    const group = r.taxon?.iconic_taxon_name;
    if (tally[group]) tally[group].push(r);
  }
  const names = (rows) => rows
    .sort((a, b) => (b.count ?? 0) - (a.count ?? 0))
    .slice(0, 5)
    .map((r) => r.taxon?.preferred_common_name || r.taxon?.name)
    .filter(Boolean);
  // Orthoptera = crickets, katydids, grasshoppers — the night singers
  const singers = tally.Insecta.filter((r) => /cricket|katydid|cicada|grasshopper/i.test(r.taxon?.preferred_common_name ?? ''));
  return {
    birdSpecies: tally.Aves.length,
    insectSpecies: tally.Insecta.length,
    singingInsects: singers.length,
    amphibianSpecies: tally.Amphibia.length,
    topBirds: names(tally.Aves),
    topSingers: names(singers),
    topAmphibians: names(tally.Amphibia),
  };
}

export async function loadLife({ lat, lng, now = Date.now(), fetchImpl }) {
  return normalizeLife(await fetchJson(buildLifeUrl(lat, lng, now), { fetchImpl }));
}
