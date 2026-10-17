/**
 * When is "now"? Local clock, weekday, the turning year, meteor showers and
 * the rhythm of human activity — all computed locally, no network.
 * Pure functions.
 */
import { clamp } from './util.js';
import { getSeasonalFactor, getSeasonName } from '../weather/season.js';

/** Location-local wall clock from a UTC instant + offset. */
export function localClock(nowMs, utcOffsetSeconds = 0) {
  const d = new Date(nowMs + utcOffsetSeconds * 1000);
  const hour = d.getUTCHours() + d.getUTCMinutes() / 60 + d.getUTCSeconds() / 3600;
  const start = Date.UTC(d.getUTCFullYear(), 0, 1);
  return {
    hour,                                   // fractional 0–24
    minute: d.getUTCMinutes(),
    weekday: d.getUTCDay(),                 // 0 = Sunday
    isWeekend: d.getUTCDay() === 0 || d.getUTCDay() === 6,
    dayOfYear: Math.floor((d.getTime() - start) / 86400000) + 1,
    year: d.getUTCFullYear(),
    localDate: d.toISOString().slice(0, 10),
  };
}

/**
 * Human activity 0–1 by local hour: commuter peaks on weekdays, a late lazy
 * hump on weekends/holidays, deep quiet at 3–4 am.
 */
export function humanActivity(hour, { isWeekend = false, isHoliday = false } = {}) {
  const g = (mu, sigma, h = hour) => Math.exp(-0.5 * ((h - mu) / sigma) ** 2);
  const restful = isWeekend || isHoliday;
  const base = restful
    ? 0.15 + 0.55 * g(14, 4.5) + 0.25 * g(20, 2.5)
    : 0.12 + 0.55 * g(8.2, 1.3) + 0.35 * g(12.5, 3) + 0.6 * g(17.6, 1.6) + 0.2 * g(21, 2);
  const nightDip = 1 - 0.85 * g(3.5, 1.8);
  return clamp(base * nightDip, 0.03, 1);
}

// Major annual meteor showers (peak day-of-year in a non-leap year, activity span, ZHR)
export const METEOR_SHOWERS = [
  { name: 'Quadrantids', peak: 3, before: 5, after: 9, zhr: 110 },
  { name: 'Lyrids', peak: 112, before: 8, after: 5, zhr: 18 },
  { name: 'Eta Aquariids', peak: 126, before: 25, after: 22, zhr: 50 },
  { name: 'Southern Delta Aquariids', peak: 211, before: 18, after: 25, zhr: 25 },
  { name: 'Perseids', peak: 224, before: 27, after: 12, zhr: 100 },
  { name: 'Draconids', peak: 281, before: 2, after: 2, zhr: 10 },
  { name: 'Orionids', peak: 294, before: 19, after: 17, zhr: 20 },
  { name: 'Leonids', peak: 321, before: 11, after: 13, zhr: 15 },
  { name: 'Geminids', peak: 348, before: 10, after: 3, zhr: 150 },
  { name: 'Ursids', peak: 356, before: 5, after: 4, zhr: 10 },
];
const SPORADIC_ZHR = 6;

/** Active shower (if any) and its current zenithal hourly rate. */
export function meteorActivity(dayOfYear) {
  let best = null;
  for (const s of METEOR_SHOWERS) {
    let delta = dayOfYear - s.peak;
    if (delta > 182) delta -= 365;
    if (delta < -182) delta += 365;
    const span = delta < 0 ? s.before : s.after;
    if (Math.abs(delta) > span) continue;
    // Activity falls off roughly exponentially either side of peak
    const rate = s.zhr * Math.exp(-3 * (Math.abs(delta) / span));
    if (!best || rate > best.zhr) best = { name: s.name, zhr: rate, daysFromPeak: delta };
  }
  return {
    shower: best,
    zhr: Math.max(SPORADIC_ZHR, best?.zhr ?? 0),
  };
}

/** 0 at equinox, 1 at solstice; plus which solstice we're nearest. */
export function solsticeProximity(dayOfYear, latitude) {
  const phase = ((dayOfYear - 80) / 365.25) * 2 * Math.PI; // 0 at March equinox
  const s = Math.sin(phase);                              // +1 June, −1 December
  const northSummer = s > 0;
  return {
    proximity: Math.abs(s),
    isSummerSolstice: latitude >= 0 ? northSummer : !northSummer,
    isSolsticeDay: Math.abs(s) > 0.9995,
    isEquinoxDay: Math.abs(s) < 0.012,
  };
}

export function computeCalendar({ nowMs, utcOffsetSeconds, latitude, holiday = null }) {
  const clock = localClock(nowMs, utcOffsetSeconds);
  const date = new Date(nowMs);
  return {
    ...clock,
    holiday,
    season: getSeasonName(date, latitude),
    seasonFactor: getSeasonalFactor(date, latitude), // 1 = midsummer
    solstice: solsticeProximity(clock.dayOfYear, latitude),
    meteors: meteorActivity(clock.dayOfYear),
    activity: humanActivity(clock.hour, { isWeekend: clock.isWeekend, isHoliday: Boolean(holiday) }),
  };
}

/** Kept here so score + visuals share one definition of "a fresh hour". */
export function minutesPastHour(hour) {
  return (hour - Math.floor(hour)) * 60;
}
