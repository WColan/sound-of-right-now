#!/usr/bin/env node
/**
 * Build the compact star catalogue + constellation lines used by the visualizer.
 *
 * Usage:
 *   node scripts/build-sky-data.mjs <path-to-d3-celestial/data>
 *   (npm pack d3-celestial && tar xzf d3-celestial-*.tgz → package/data)
 *
 * Output: src/visual/data/sky.json
 *   stars: flat [raDeg, decDeg, mag, bv, ...] for mag ≤ 5.2
 *   lines: flat [ra1, dec1, ra2, dec2, ...] constellation stick-figure segments
 *
 * Source data © Olaf Frohn, d3-celestial (BSD-3-Clause), derived from the
 * Hipparcos catalogue.
 */
import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const dataDir = process.argv[2];
if (!dataDir) {
  console.error('usage: node scripts/build-sky-data.mjs <d3-celestial/data>');
  process.exit(1);
}
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const round = (v, p = 2) => Math.round(v * 10 ** p) / 10 ** p;
const norm = (ra) => round(((ra % 360) + 360) % 360);

const stars = [];
for (const f of JSON.parse(readFileSync(join(dataDir, 'stars.6.json'))).features) {
  const { mag, bv } = f.properties;
  if (mag > 5.2) continue;
  const [ra, dec] = f.geometry.coordinates;
  stars.push(norm(ra), round(dec), round(mag), round(Number(bv) || 0.6));
}

const lines = [];
for (const f of JSON.parse(readFileSync(join(dataDir, 'constellations.lines.json'))).features) {
  for (const path of f.geometry.coordinates) {
    for (let i = 1; i < path.length; i++) {
      lines.push(norm(path[i - 1][0]), round(path[i - 1][1]), norm(path[i][0]), round(path[i][1]));
    }
  }
}

writeFileSync(join(root, 'src/visual/data/sky.json'), JSON.stringify({
  attribution: 'Star and constellation data © Olaf Frohn, d3-celestial (BSD-3-Clause); Hipparcos catalogue.',
  stars,
  lines,
}));
console.log(`${stars.length / 4} stars, ${lines.length / 4} line segments`);
