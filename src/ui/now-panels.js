/**
 * Content for the "now" panel (every source we're listening to) and the
 * "legend" panel (what you're hearing, and why). Pure string builders.
 */
import { describeWeatherCode } from '../weather/codes.js';
import { degreesToCompass } from './display.js';

export const SECTION_LABELS = {
  strings: 'strings', basses: 'basses', ocean: 'ocean', river: 'river', winds: 'winds', horns: 'horns',
  rain: 'rain', storm: 'storm', air: 'air', moon: 'moon', spheres: 'planets', aurora: 'aurora',
  meteors: 'meteors', iss: 'iss', life: 'life', pulse: 'people', bells: 'bells', earth: 'earth',
};

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const f = (c) => `${Math.round(c * 9 / 5 + 32)}°F`;
const hint = (s) => `<span class="mapping-hint">${s}</span>`;
const row = (label, value) => `<strong>${esc(label)}:</strong> ${esc(value)}`;

function fmtClock(date, offset) {
  if (!date) return '—';
  const d = new Date(date.getTime() + offset * 1000);
  const h = d.getUTCHours();
  return `${h % 12 || 12}:${String(d.getUTCMinutes()).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
}

function moonName(phaseDeg) {
  const names = ['New moon', 'Waxing crescent', 'First quarter', 'Waxing gibbous', 'Full moon', 'Waning gibbous', 'Last quarter', 'Waning crescent'];
  return names[Math.round(((phaseDeg % 360) + 360) % 360 / 45) % 8];
}

export function buildNowPanel(snapshot) {
  if (!snapshot) return 'Listening…';
  const w = snapshot.weather;
  const { sky, calendar: cal } = snapshot;
  const out = [];
  out.push(hint('── atmosphere ──'));
  if (w) {
    out.push(row('Temperature', `${f(w.temperature)} (feels ${f(w.apparentTemperature)})`));
    out.push(row('Sky', `${describeWeatherCode(w.weatherCode)}, ${Math.round(w.cloudCover)}% cloud`));
    out.push(row('Wind', `${Math.round(w.windSpeed)} km/h ${degreesToCompass(w.windDirection)}, gusts ${Math.round(w.windGusts)}`));
    out.push(row('Pressure', `${Math.round(w.pressure)} hPa (${w.pressureTendency >= 0 ? '+' : ''}${w.pressureTendency.toFixed(1)} / 3 h)`));
    out.push(row('Humidity', `${Math.round(w.humidity)}%${w.visibility != null ? `, visibility ${(w.visibility / 1000).toFixed(1)} km` : ''}`));
    if (w.precipitation > 0) out.push(row('Precipitation', `${w.precipitation.toFixed(1)} mm/h`));
    if (w.cape > 200) out.push(row('Storm energy', `CAPE ${Math.round(w.cape)} J/kg`));
  } else {
    out.push('waiting for the weather…');
  }
  if (snapshot.air) out.push(row('Air', `AQI ${snapshot.air.aqi}, PM2.5 ${Math.round(snapshot.air.pm25)}${snapshot.air.pollen != null ? `, pollen ${Math.round(snapshot.air.pollen)}` : ''}`));

  out.push('', hint('── sky ──'));
  const off = w?.utcOffsetSeconds ?? 0;
  out.push(row('Sun', `${sky.sun.altitude.toFixed(1)}° (${sky.twilight})${w?.sunrise ? ` · rise ${fmtClock(w.sunrise, off)} · set ${fmtClock(w.sunset, off)}` : ''}`));
  out.push(row('Moon', `${moonName(sky.moon.phaseDeg)}, ${Math.round(sky.moon.illumination * 100)}% lit, ${sky.moon.altitude > 0 ? `${sky.moon.altitude.toFixed(0)}° up` : 'below horizon'}`));
  const up = sky.planets.filter((p) => p.altitude > 0).map((p) => p.name);
  out.push(row('Planets up', up.length ? up.join(', ') : 'none'));
  if (snapshot.space) out.push(row('Space weather', `Kp ${snapshot.space.kp.toFixed(1)}${snapshot.space.solarWindSpeed ? `, solar wind ${Math.round(snapshot.space.solarWindSpeed)} km/s` : ''}`));
  if (cal.meteors.shower) out.push(row('Meteors', `${cal.meteors.shower.name} (${Math.round(cal.meteors.zhr)}/h at peak darkness)`));
  if (snapshot.iss) out.push(row('ISS', `${Math.round(snapshot.iss.groundKm).toLocaleString('en-US')} km away${snapshot.iss.inRange ? ' — overhead now' : ''}`));

  out.push('', hint('── water & land ──'));
  if (snapshot.marine) out.push(row('Sea', `${snapshot.marine.waveHeight.toFixed(1)} m waves every ${Math.round(snapshot.marine.wavePeriod)} s${snapshot.marine.seaSurfaceTemp != null ? `, ${f(snapshot.marine.seaSurfaceTemp)}` : ''}`));
  if (snapshot.tide) out.push(row('Tide', `${snapshot.tide.level.toFixed(1)} ft, ${snapshot.tide.trend >= 0 ? 'rising' : 'falling'}`));
  if (snapshot.river) out.push(row('River', `${Math.round(snapshot.river.discharge)} m³/s (${Math.round(snapshot.river.ratio * 100)}% of normal)`));
  out.push(row('Land', `${snapshot.location.biome}, ${Math.round(snapshot.location.elevation)} m`));
  if (snapshot.quakes) out.push(row('Earthquakes', `${snapshot.quakes.regionalCount24h} within 1000 km today`));

  out.push('', hint('── life & people ──'));
  if (snapshot.life) {
    out.push(row('Seen nearby', `${snapshot.life.birdSpecies} bird, ${snapshot.life.insectSpecies} insect, ${snapshot.life.amphibianSpecies} amphibian species (30 days)`));
    if (snapshot.life.topBirds.length) out.push(row('Birds', snapshot.life.topBirds.slice(0, 3).join(', ')));
  }
  if (snapshot.location.population) out.push(row('Population', snapshot.location.population.toLocaleString('en-US')));
  out.push(row('Today', `${cal.season}, ${['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][cal.weekday]}${cal.holiday ? ` — ${cal.holiday.name}` : ''}`));
  return out.join('<br>');
}

export function buildLegendPanel(score, stage) {
  if (!score) return 'Listening…';
  const out = [];
  out.push(hint(`${esc(score.harmony.root)} ${esc(score.harmony.mode)} · ${score.harmony.bpm} BPM`));
  const bySection = new Map();
  for (const l of score.legend) {
    if (!bySection.has(l.section)) bySection.set(l.section, []);
    bySection.get(l.section).push(l);
  }
  const order = [...bySection.keys()].sort((a, b) => {
    const rank = (id) => (stage?.roles?.[id] === 'foreground' ? 0 : score.sections[id]?.on ? 1 : 2);
    return rank(a) - rank(b);
  });
  for (const id of order) {
    const role = stage?.roles?.[id];
    const on = score.sections[id]?.on;
    const badge = role === 'foreground' ? ' ★' : on ? '' : ' · quiet';
    out.push('', hint(`── ${SECTION_LABELS[id] ?? id}${badge} ──`));
    for (const l of bySection.get(id)) {
      out.push(`<strong>${esc(l.source)}</strong> ${esc(l.reading)} ${hint('→')} ${esc(l.effect)}`);
      out.push(`<span class="legend-why">${esc(l.why)}</span>`);
    }
  }
  return out.join('<br>');
}

/** One quiet line describing the scene, for the info display. */
export function buildBlendLine(snapshot, score) {
  const w = snapshot?.weather;
  const parts = [];
  if (w) parts.push(`${f(w.temperature)} ${describeWeatherCode(w.weatherCode)}`);
  if (score) parts.push(`${score.harmony.root} ${score.harmony.mode}`, `${score.harmony.bpm} BPM`);
  return parts.join('  ·  ');
}
