/**
 * The true sky over the listener: sun, moon, planets and the star sphere.
 * Wraps astronomy-engine (MIT) — all local computation.
 */
import * as Astronomy from 'astronomy-engine';
import { toRad, toDeg } from './util.js';

export const PLANETS = ['Mercury', 'Venus', 'Mars', 'Jupiter', 'Saturn'];

// Sidereal orbital periods in Earth years (for the "music of the spheres")
export const ORBITAL_PERIOD_YEARS = {
  Mercury: 0.2408, Venus: 0.6152, Earth: 1, Mars: 1.8809, Jupiter: 11.862, Saturn: 29.457,
};

function horizontal(body, date, observer) {
  const eq = Astronomy.Equator(body, date, observer, true, true);
  const h = Astronomy.Horizon(date, observer, eq.ra, eq.dec, 'normal');
  return { altitude: h.altitude, azimuth: h.azimuth, ra: eq.ra, dec: eq.dec };
}

export function twilightName(sunAlt) {
  if (sunAlt > 6) return 'day';
  if (sunAlt > -0.833) return 'golden';
  if (sunAlt > -6) return 'civil';
  if (sunAlt > -12) return 'nautical';
  if (sunAlt > -18) return 'astronomical';
  return 'night';
}

/** 0 = full daylight … 1 = astronomical darkness (stars fully out). */
export function darkness(sunAlt) {
  return Math.min(1, Math.max(0, (2 - sunAlt) / 20));
}

export function computeSky({ lat, lng, elevation = 0, date = new Date() }) {
  const observer = new Astronomy.Observer(lat, lng, elevation);
  const sun = horizontal(Astronomy.Body.Sun, date, observer);
  const moon = horizontal(Astronomy.Body.Moon, date, observer);
  const moonPhaseDeg = Astronomy.MoonPhase(date); // 0 new, 90 first qtr, 180 full
  const moonIllum = Astronomy.Illumination(Astronomy.Body.Moon, date);
  // Sun altitude an hour ago tells us dawn vs. dusk
  const sunEarlier = horizontal(Astronomy.Body.Sun, new Date(date.getTime() - 3600000), observer);

  const planets = PLANETS.map((name) => {
    const pos = horizontal(Astronomy.Body[name], date, observer);
    const illum = Astronomy.Illumination(Astronomy.Body[name], date);
    return { name, altitude: pos.altitude, azimuth: pos.azimuth, magnitude: illum.mag };
  });

  return {
    sun: { altitude: sun.altitude, azimuth: sun.azimuth, rising: sun.altitude > sunEarlier.altitude },
    moon: {
      altitude: moon.altitude,
      azimuth: moon.azimuth,
      phaseDeg: moonPhaseDeg,
      illumination: moonIllum.phase_fraction, // 0–1 lit fraction
      waxing: moonPhaseDeg < 180,
    },
    planets,
    twilight: twilightName(sun.altitude),
    darkness: darkness(sun.altitude),
    // Local sidereal time (hours) — rotates the star sphere
    lst: ((Astronomy.SiderealTime(date) + lng / 15) % 24 + 24) % 24,
  };
}

/** Equatorial (RA deg, Dec deg) → horizontal (alt, az deg) for a given LST/lat. */
export function equatorialToHorizontal(raDeg, decDeg, lstHours, latDeg) {
  const ha = toRad(lstHours * 15 - raDeg);
  const dec = toRad(decDeg);
  const lat = toRad(latDeg);
  const sinAlt = Math.sin(dec) * Math.sin(lat) + Math.cos(dec) * Math.cos(lat) * Math.cos(ha);
  const alt = Math.asin(Math.max(-1, Math.min(1, sinAlt)));
  const cosAz = (Math.sin(dec) - Math.sin(alt) * Math.sin(lat)) / (Math.cos(alt) * Math.cos(lat) || 1e-9);
  let az = toDeg(Math.acos(Math.max(-1, Math.min(1, cosAz))));
  if (Math.sin(ha) > 0) az = 360 - az;
  return { altitude: toDeg(alt), azimuth: az };
}
