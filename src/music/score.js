/**
 * The Score — pure function: NowSnapshot → what the orchestra should play.
 *
 * Every section here answers one question: "what in this moment does this
 * instrument stand for, and why would anyone expect it to sound like this?"
 * The `why` strings are shown to the listener in the legend, so each mapping
 * has to survive being read out loud.
 *
 * No Tone.js, no clocks, no randomness unless an rng is passed in.
 */
import { MODE_SPECTRUM } from './scale.js';
import { CATEGORY_TO_MOOD } from './constants.js';
import { clamp, lerp, invLerp, smoothstep, azimuthToPan } from '../now/util.js';
import { ORBITAL_PERIOD_YEARS } from '../now/sky.js';

// Registral zones keep sections from fighting over the same frequencies.
export const ZONES = {
  sub: ['basses', 'earth'],
  low: ['ocean', 'river'],
  mid: ['strings', 'pulse', 'rain'],
  upper: ['winds', 'horns', 'bells', 'storm'],
  high: ['moon', 'spheres', 'aurora', 'meteors', 'life', 'iss', 'air'],
};
export const SECTION_IDS = Object.values(ZONES).flat();
export const ZONE_OF = Object.fromEntries(Object.entries(ZONES).flatMap(([z, ids]) => ids.map((id) => [id, z])));

// Circle of fifths from the flattest to the sharpest key. Colder air → flat
// keys (darker, rounder on strings); warmer → sharp keys (brighter, ringing).
const CIRCLE = ['C#', 'G#', 'D#', 'A#', 'F', 'C', 'G', 'D', 'A', 'E', 'B', 'F#'];

const C_TO_F = (c) => c * 9 / 5 + 32;
const fmtTemp = (c) => `${Math.round(C_TO_F(c))}°F`;

/** Temperature → key centre. Each 6 °C is one step round the circle of fifths. */
export function temperatureToRoot(tempC) {
  const idx = clamp(Math.round((tempC + 16) / 6), 0, CIRCLE.length - 1);
  return CIRCLE[idx];
}

/** Feels-like temperature → mode, dark (locrian) to bright (lydian). */
export function temperatureToMode(feelsC) {
  if (feelsC < -10) return 'locrian';
  if (feelsC < 0) return 'aeolian';
  if (feelsC < 10) return 'dorian';
  if (feelsC < 20) return 'mixolydian';
  if (feelsC < 30) return 'ionian';
  return 'lydian';
}

/** Warm molecules move faster: thermometer → pulse. */
export function temperatureToBpm(tempC) {
  return Math.round(clamp(58 + tempC * 0.7, 48, 92));
}

/** Dolbear's law (1897): cricket chirps/min ≈ 4·°F − 160. */
export function dolbearChirpsPerMinute(tempC) {
  return Math.max(0, 4 * C_TO_F(tempC) - 160);
}

/**
 * Kepler's music of the spheres: a planet's "pitch" is its orbital frequency
 * relative to Earth's. Returns semitones above Earth (Mercury ≈ +25, Saturn ≈ −58).
 */
export function keplerSemitones(planet) {
  return -12 * Math.log2(ORBITAL_PERIOD_YEARS[planet] ?? 1);
}

/** Bird song: a dawn chorus peaking just after sunrise, a smaller dusk chorus. */
export function chorusCurve(sunAltitude, rising) {
  if (rising) return smoothstep(-10, -2, sunAltitude) * (1 - smoothstep(10, 30, sunAltitude) * 0.75);
  return smoothstep(-6, 2, sunAltitude) * (1 - smoothstep(4, 25, sunAltitude)) * 0.55 + smoothstep(25, 50, sunAltitude) * 0.15;
}

const SEASON_BIRDS = { spring: 1, summer: 0.75, autumn: 0.4, winter: 0.2 };

const BIOME_HALL = {
  forest:    { decayMul: 1.25, wetMul: 1.15, echo: null, early: 0.1, label: 'forest canopy diffuses sound' },
  mountain:  { decayMul: 1.1, wetMul: 1.0, echo: { time: 0.48, feedback: 0.38 }, early: 0.05, label: 'valley walls return echoes' },
  urban:     { decayMul: 0.8, wetMul: 0.9, echo: { time: 0.11, feedback: 0.15 }, early: 0.5, label: 'hard façades give short early reflections' },
  desert:    { decayMul: 0.6, wetMul: 0.55, echo: null, early: 0.0, label: 'open dry ground swallows reverb' },
  coastal:   { decayMul: 1.15, wetMul: 1.05, echo: null, early: 0.05, label: 'open water carries long tails' },
  arctic:    { decayMul: 1.3, wetMul: 0.8, echo: { time: 0.6, feedback: 0.25 }, early: 0.05, label: 'cold still air rings clear' },
  wetland:   { decayMul: 1.1, wetMul: 1.2, echo: null, early: 0.05, label: 'damp reeds soften every edge' },
  tropical:  { decayMul: 1.2, wetMul: 1.25, echo: null, early: 0.1, label: 'humid canopy, dense and enveloping' },
  grassland: { decayMul: 0.9, wetMul: 0.85, echo: null, early: 0.02, label: 'open fields, little to reflect from' },
};

function entry(on, level, salience, extra = {}) {
  return { on: Boolean(on) && level > 0.001, level: clamp(level), salience: clamp(salience), ...extra };
}

/**
 * @param {object} snapshot - NowSnapshot (src/now/snapshot.js)
 * @param {object} [ctx]
 * @param {number} [ctx.listenMinutes=0] - how long this listener has been here
 * @param {() => number} [ctx.rng=Math.random]
 * @param {string} [ctx.previousMode] - keeps the storm minor variant stable
 */
export function composeScore(snapshot, ctx = {}) {
  const { listenMinutes = 0, rng = Math.random } = ctx;
  const w = snapshot.weather ?? {
    temperature: 12, apparentTemperature: 12, humidity: 55, pressure: 1013, pressureTendency: 0,
    windSpeed: 6, windGusts: 10, windDirection: 220, category: 'clear', cloudCover: 20,
    precipitation: 0, snowfall: 0, visibility: 20000, cape: 0, snowDepth: 0, uvIndex: 0,
  };
  const { sky, calendar } = snapshot;
  const sunAlt = sky.sun.altitude;
  const dark = sky.darkness;
  const cloud = clamp((w.cloudCover ?? 0) / 100);
  const category = w.category ?? 'clear';
  const legend = [];
  const why = (source, reading, effect, reason, section) => legend.push({ source, reading, effect, why: reason, section });

  // ── Harmony: temperature is the key signature of the air ──
  const feels = w.apparentTemperature ?? w.temperature;
  const root = temperatureToRoot(w.temperature);
  let mode = temperatureToMode(feels);
  if (category === 'storm' && (mode === 'aeolian' || mode === 'dorian')) {
    mode = ['harmonicMinor', 'melodicMinor'].includes(ctx.previousMode) ? ctx.previousMode : (rng() < 0.5 ? 'harmonicMinor' : 'melodicMinor');
  }
  const bpm = temperatureToBpm(w.temperature);
  const pressureNorm = invLerp(980, 1045, w.pressure ?? 1013);
  const mood = CATEGORY_TO_MOOD[category] ?? 'calm';
  why('Temperature', `${fmtTemp(w.temperature)} (feels ${fmtTemp(feels)})`, `${root} ${mode}, ${bpm} BPM`,
    'Warmer air sits in sharper, brighter keys and modes and a quicker pulse; cold air in flatter, darker ones.', 'strings');
  why('Pressure', `${Math.round(w.pressure ?? 1013)} hPa`, pressureNorm > 0.6 ? 'light basses, slow settled chord changes' : 'heavy basses, restless chord changes',
    'The weight of the air is the weight of the low end. High pressure is stable — the harmony lingers; low pressure keeps it moving.', 'basses');

  // ── Light: the sun's height is the orchestra's brightness ──
  const light = clamp(smoothstep(-8, 35, sunAlt) * (1 - cloud * 0.45));
  const haze = smoothstep(50, 200, snapshot.air?.aqi ?? 0);
  const snowDamp = smoothstep(0.02, 0.4, w.snowDepth ?? 0);
  const masterCutoff = lerp(2600, 15000, light) * (1 - haze * 0.45) * (1 - snowDamp * 0.3);

  // ── Space: humidity, visibility and land shape the hall ──
  const hum = clamp((w.humidity ?? 50) / 100);
  const biome = snapshot.location.biome ?? 'grassland';
  const hallShape = BIOME_HALL[biome] ?? BIOME_HALL.grassland;
  const visKm = (w.visibility ?? 20000) / 1000;
  const veil = 1 - smoothstep(0.5, 10, visKm); // fog: the orchestra recedes
  const hall = {
    decay: clamp(lerp(2.2, 8, hum) * hallShape.decayMul + veil * 2, 1.2, 12),
    wet: clamp((lerp(0.18, 0.42, hum) + veil * 0.15) * hallShape.wetMul, 0.08, 0.7),
    echo: hallShape.echo,
    early: hallShape.early,
    distance: veil,
  };
  why('Humidity', `${Math.round(hum * 100)}%`, `${hall.decay.toFixed(1)} s hall`, 'Moist air carries sound further and longer — the room grows.', 'strings');
  why('Land', biome, hallShape.label, 'The landscape around you is the concert hall.', 'strings');
  if (veil > 0.15) why('Visibility', `${visKm.toFixed(1)} km`, 'orchestra recedes into the distance', 'In fog everything sounds farther away and softer-edged.', 'strings');
  if (snowDamp > 0.05) why('Snow cover', `${Math.round((w.snowDepth ?? 0) * 100)} cm`, 'muffled highs, longer silences', 'Fresh snow absorbs sound — the world goes hushed.', 'strings');

  const sections = {};

  // Strings: the harmonic bed, always present. Violins rise with the sun.
  sections.strings = entry(true, lerp(0.55, 0.75, 1 - light * 0.3), 0.15, {
    violins: clamp(0.25 + light * 0.75),
    brightness: light,
    vibrato: smoothstep(-10, 30, w.temperature),
  });

  // Basses: the weight of the air
  const falling = clamp(-(w.pressureTendency ?? 0) / 4);
  sections.basses = entry(true, lerp(0.75, 0.4, pressureNorm), 0.1 + falling * 0.6, {
    depth: 1 - pressureNorm,
    tremor: falling,
  });
  if (falling > 0.25) why('Barometer', `falling ${Math.abs(w.pressureTendency).toFixed(1)} hPa / 3 h`, 'basses grow uneasy', 'A falling barometer means weather is coming — the low end stirs first.', 'basses');

  // Ocean: celli + basses breathing at the real wave period
  const sea = snapshot.marine;
  const tide = snapshot.tide;
  if (sea || tide) {
    const height = sea?.waveHeight ?? 0.6;
    sections.ocean = entry(true, clamp(0.25 + smoothstep(0, 3.5, height) * 0.65), smoothstep(1.5, 4, height) * 0.8 + 0.15, {
      period: clamp(sea?.wavePeriod ?? 8, 3, 20),
      height,
      warmth: sea?.seaSurfaceTemp != null ? smoothstep(4, 28, sea.seaSurfaceTemp) : 0.5,
      pan: sea ? azimuthToPan(sea.waveDirection) * 0.6 : 0,
      tideLift: tide ? clamp(tide.trend, -1, 1) : 0,
    });
    if (sea) why('Waves', `${height.toFixed(1)} m every ${Math.round(sea.wavePeriod)} s`, 'cello swells on the same breath', 'Each swell rises and falls with the actual period of the waves offshore.', 'ocean');
    if (tide) why('Tide', `${tide.level.toFixed(1)} ft, ${tide.trend >= 0 ? 'rising' : 'falling'}`, tide.trend >= 0 ? 'swells climb' : 'swells settle', 'A flooding tide lifts the line; an ebbing tide lets it sink.', 'ocean');
  }

  // River: a running low-string figure, faster in flood
  const river = snapshot.river;
  if (river && !sea) {
    sections.river = entry(true, clamp(0.25 + smoothstep(0.5, 3, river.ratio) * 0.5), smoothstep(1.8, 4, river.ratio) * 0.8, {
      rate: clamp(1.2 + Math.log2(1 + river.ratio) * 1.6, 1, 6),
      ratio: river.ratio,
    });
    why('River', `${Math.round(river.discharge)} m³/s (${Math.round(river.ratio * 100)}% of normal)`, 'flowing cello figure', 'Running water runs: the figure quickens as the river swells.', 'river');
  }

  // Winds: wind is breath
  const windNorm = smoothstep(3, 45, w.windSpeed ?? 0);
  const gustiness = clamp(((w.windGusts ?? 0) - (w.windSpeed ?? 0)) / Math.max(8, w.windSpeed ?? 0));
  // In a thunderstorm the gusts belong to the storm: let the drums lead
  sections.winds = entry((w.windSpeed ?? 0) > 2, 0.2 + windNorm * 0.7, smoothstep(15, 55, w.windGusts ?? 0) * (category === 'storm' ? 0.7 : 1), {
    speed: windNorm,
    gustiness,
    pan: azimuthToPan(w.windDirection ?? 0),
    chimes: (w.windSpeed ?? 0) > 5,
    chimeDecay: lerp(0.75, 1.4, hum), // dry air rings crisp, humid air lingers
  });
  why('Wind', `${Math.round(w.windSpeed ?? 0)} km/h, gusts ${Math.round(w.windGusts ?? 0)}`, 'flutes & clarinets breathe; chimes stir', 'Wind is breath — woodwinds swell on every gust, from the side it blows.', 'winds');

  // Horns: the sun's fanfare
  const golden = smoothstep(-5, -1, sunAlt) * (1 - smoothstep(6, 12, sunAlt));
  const hornMode = golden > 0.2 ? (sky.sun.rising ? 'dawn' : 'dusk') : sunAlt > 0 ? 'day' : 'off';
  sections.horns = entry(hornMode !== 'off',
    hornMode === 'day' ? smoothstep(0, 60, sunAlt) * (1 - cloud * 0.8) * 0.45 : golden * (1 - cloud * 0.5),
    golden * 0.9, { mode: hornMode, warmth: golden });
  if (hornMode === 'dawn') why('Sunrise', `sun at ${sunAlt.toFixed(1)}°`, 'horn call', 'Brass is gold: the horns announce the sun as it clears the horizon.', 'horns');
  else if (hornMode === 'dusk') why('Sunset', `sun at ${sunAlt.toFixed(1)}°`, 'horn chorale', 'The horns sing the light down at golden hour.', 'horns');
  else if (hornMode === 'day') why('Sun', `${sunAlt.toFixed(0)}° high, ${Math.round(cloud * 100)}% cloud`, 'distant warm horns', 'Sunlight warms the middle of the orchestra; clouds mute it.', 'horns');

  // Rain / snow: droplets are plucks
  const precip = w.precipitation ?? 0;
  const snowing = category === 'snow' || (w.snowfall ?? 0) > 0;
  const wet = precip > 0.05 || ['rain', 'drizzle', 'storm', 'snow'].includes(category);
  sections.rain = entry(wet, 0.3 + smoothstep(0, 6, precip) * 0.6, smoothstep(0.1, 5, precip) * 0.8 + (wet ? 0.2 : 0), {
    density: snowing ? 0.4 + smoothstep(0, 3, w.snowfall ?? 0) * 1.6 : 0.6 + smoothstep(0, 8, precip) * 7,
    instrument: snowing ? 'snow' : category === 'drizzle' ? 'drizzle' : 'rain',
    hiss: smoothstep(0, 8, precip),
  });
  if (wet) why(snowing ? 'Snowfall' : 'Rain', `${precip.toFixed(1)} mm/h`, snowing ? 'slow glockenspiel flakes' : 'harp & piano droplets',
    snowing ? 'Snowflakes drift down as soft high bells.' : 'Every droplet is a pluck; heavier rain, denser notes.', 'rain');

  // Storm: the drums of convection
  const capeEnergy = smoothstep(400, 2500, w.cape ?? 0);
  const storming = category === 'storm';
  sections.storm = entry(storming || (capeEnergy > 0.5 && precip > 0.5), storming ? 0.6 + capeEnergy * 0.4 : capeEnergy * 0.4, storming ? 1 : capeEnergy * 0.4, {
    energy: storming ? Math.max(0.6, capeEnergy) : capeEnergy * 0.5,
    thunderPerMinute: storming ? 0.6 + capeEnergy * 2 : 0,
  });
  if (sections.storm.on) why('Thunderstorm', `CAPE ${Math.round(w.cape ?? 0)} J/kg`, 'timpani rolls, low brass, thunder', 'Storm energy is drum energy — the more unstable the air, the harder they roll.', 'storm');

  // Moon: cold silver light → celesta
  const moon = sky.moon;
  const moonUp = smoothstep(-2, 6, moon.altitude);
  const moonLevel = moonUp * (0.15 + moon.illumination * 0.75) * lerp(0.35, 1, dark) * (1 - cloud * 0.6);
  sections.moon = entry(moonUp > 0, moonLevel, moonUp * (moon.illumination > 0.95 ? 0.75 : 0.25) * dark,
    { illumination: moon.illumination, waxing: moon.waxing, pan: azimuthToPan(moon.azimuth) * 0.7 });
  if (sections.moon.on) why('Moon', `${Math.round(moon.illumination * 100)}% lit, ${moon.altitude.toFixed(0)}° up`, 'celesta motif', 'Moonlight is cold and silver — a celesta, louder as the moon fills.', 'moon');

  // Spheres: the visible planets, each at its Keplerian pitch
  const unlocked = listenMinutes >= 20;
  const tones = sky.planets
    .filter((p) => p.altitude > 0)
    .map((p) => ({
      planet: p.name,
      semitones: keplerSemitones(p.name),
      gain: smoothstep(3, -4.5, p.magnitude) * smoothstep(0, 10, p.altitude),
      pan: azimuthToPan(p.azimuth) * 0.8,
    }))
    .filter((t) => t.gain > 0.02);
  const sphereSky = clamp(smoothstep(0.25, 0.85, dark) * (1 - cloud * 0.9));
  sections.spheres = entry(tones.length > 0 && sphereSky > 0.05, sphereSky * (unlocked ? 0.75 : 0.35), sphereSky * tones.length * 0.12, {
    tones,
    unlocked,
  });
  if (sections.spheres.on) why('Planets', tones.map((t) => t.planet).join(', '), unlocked ? 'the full chord of the spheres' : 'faint pure tones (listen longer…)',
    'Kepler heard each planet sing at its orbital speed — inner planets high, outer planets low.', 'spheres');

  // Aurora: a shimmering sky → high string tremolo
  const space = snapshot.space;
  const auroraLevel = space ? clamp(space.auroraReach * smoothstep(0.3, 0.8, dark) * (1 - cloud) ** 0.7) : 0;
  sections.aurora = entry(auroraLevel > 0.05, auroraLevel, auroraLevel, {
    kp: space?.kp ?? 0,
    wind: space?.solarWindSpeed ? smoothstep(300, 800, space.solarWindSpeed) : 0.3,
  });
  if (space) why('Space weather', `Kp ${space.kp.toFixed(1)}${space.solarWindSpeed ? `, solar wind ${Math.round(space.solarWindSpeed)} km/s` : ''}`,
    sections.aurora.on ? 'violin tremolo shimmer' : 'quiet', 'When the magnetic field trembles the sky shimmers — high strings tremble with it.', 'aurora');

  // Meteors: sparks in the dark
  const meteorsPerHour = calendar.meteors.zhr * dark ** 2 * (1 - cloud) * 0.5;
  sections.meteors = entry(dark > 0.6 && meteorsPerHour > 0.5, clamp(0.3 + meteorsPerHour / 60), calendar.meteors.shower && meteorsPerHour > 8 ? 0.6 : 0.1, {
    perMinute: meteorsPerHour / 60,
    shower: calendar.meteors.shower?.name ?? null,
  });
  if (sections.meteors.on) why('Meteors', calendar.meteors.shower ? `${calendar.meteors.shower.name}, ~${Math.round(meteorsPerHour)}/h` : `sporadic, ~${Math.round(meteorsPerHour)}/h`,
    'bright crotale pings', 'Each shooting star is a single spark of metal.', 'meteors');

  // Life: birds at dawn, crickets keep the temperature, frogs on wet nights
  const life = snapshot.life;
  const richness = life ? clamp(Math.log1p(life.birdSpecies) / Math.log(80)) : 0.5;
  const weatherHush = 1 - smoothstep(0.5, 4, precip) * 0.8 - smoothstep(25, 55, w.windSpeed ?? 0) * 0.6;
  const birds = clamp(chorusCurve(sunAlt, sky.sun.rising) * (SEASON_BIRDS[calendar.season] ?? 0.5) * lerp(0.5, 1.2, richness) * weatherHush);
  const chirpRate = dolbearChirpsPerMinute(w.temperature);
  const cricketSeason = calendar.season === 'summer' ? 1 : calendar.season === 'autumn' ? 0.8 : calendar.season === 'spring' ? 0.3 : 0;
  const crickets = clamp(smoothstep(12, 18, w.temperature) * smoothstep(0.2, 0.7, dark) * cricketSeason
    * (life ? lerp(0.6, 1.2, smoothstep(0, 4, life.singingInsects)) : 0.8) * weatherHush);
  const frogs = clamp(smoothstep(65, 90, w.humidity ?? 0) * smoothstep(8, 16, w.temperature) * smoothstep(0.3, 0.8, dark)
    * (calendar.season === 'spring' ? 1 : calendar.season === 'summer' ? 0.7 : 0.1)
    * (life ? (life.amphibianSpecies > 0 ? 1 : 0.3) : ['wetland', 'forest', 'tropical'].includes(biome) ? 0.8 : 0.3));
  sections.life = entry(birds + crickets + frogs > 0.04, clamp(Math.max(birds, crickets, frogs)), clamp(birds * 0.9 + crickets * 0.4),
    { birds, crickets, frogs, chirpRate, topBirds: life?.topBirds ?? [] });
  if (birds > 0.05) why('Birds', life?.topBirds?.length ? life.topBirds.slice(0, 3).join(', ') : `${calendar.season} ${sky.sun.rising ? 'dawn' : 'evening'}`,
    'piccolo-voiced bird calls', 'The dawn chorus — as rich as the species actually seen near you this month.', 'life');
  if (crickets > 0.05) why('Crickets', `${fmtTemp(w.temperature)} → ${Math.round(chirpRate)} chirps/min`, 'cricket pulse', 'Dolbear\'s law: crickets chirp faster in warmer air. Count them and you know the temperature.', 'life');
  if (frogs > 0.05) why('Frogs', `${Math.round(w.humidity)}% humidity, warm night`, 'low croaking chorus', 'Humid spring nights bring out the frogs.', 'life');

  // Pulse: people
  const pop = snapshot.location.population;
  const density = pop ? clamp(Math.log10(Math.max(1, pop)) / 7) : biome === 'urban' ? 0.7 : 0.25;
  const activity = calendar.activity;
  sections.pulse = entry(activity * density > 0.05, clamp(activity * density * 1.3), activity > 0.6 && density > 0.6 ? 0.45 : 0.1, {
    activity,
    density,
  });
  why('People', `${pop ? `${pop.toLocaleString('en-US')} people` : biome}, ${calendar.isWeekend ? 'weekend' : 'weekday'} ${Math.floor(calendar.hour)}:${String(calendar.minute).padStart(2, '0')}`,
    'muted pizzicato pulse', 'A town has a heartbeat — busiest at rush hour, nearly still at 4 am.', 'pulse');

  // Bells: the hour
  const holiday = calendar.holiday;
  sections.bells = entry(true, clamp(0.35 + density * 0.45), holiday ? 0.5 : 0.1, { // strikes take the spotlight; otherwise a bed
    quarters: density > 0.35,
    peal: Boolean(holiday),
    hour: calendar.hour,
  });
  why('Clock', holiday ? `${holiday.name}` : `${Math.floor(calendar.hour) % 12 || 12} o'clock`, holiday ? 'festival peal on the hour' : 'bells strike the hour',
    'Towns ring the hour. Listen and you can count it.', 'bells');

  // Earth: regional seismic restlessness (quakes themselves arrive as events)
  const q = snapshot.quakes;
  const restless = q ? smoothstep(2, 30, q.regionalCount24h) : 0;
  sections.earth = entry(restless > 0.02, restless * 0.6, restless * 0.3, { restless });
  if (q) why('Earthquakes', `${q.regionalCount24h} within 1000 km today${q.audible[0] ? `; latest M${q.audible[0].mag.toFixed(1)} ${q.audible[0].place}` : ''}`,
    'timpani & gong from below', 'The ground speaks in drums — the deeper and closer the quake, the more you feel it, after a delay as the waves travel.', 'earth');

  // ISS: a bright point crossing the sky → a gliding tone with real Doppler
  const iss = snapshot.iss;
  if (iss?.inRange) {
    const visible = iss.sunlit && dark > 0.4 && iss.elevation > 10;
    sections.iss = entry(true, clamp(0.25 + smoothstep(-5, 50, iss.elevation) * 0.6 + (visible ? 0.15 : 0)), 0.85, {
      pan: azimuthToPan(iss.azimuth),
      doppler: clamp(-iss.radialKmS / 7.66, -1, 1), // + approaching (pitch up)
      elevation: iss.elevation,
      visible,
    });
    why('Space Station', `${Math.round(iss.groundKm)} km away, ${iss.elevation.toFixed(0)}° up${visible ? ' — look up!' : ''}`,
      'a gliding tone crossing the sky', 'Something is passing overhead at 7.7 km/s — its pitch bends exactly like a passing siren.', 'iss');
  }

  // Air: what floats in it
  const air = snapshot.air;
  const pollen = air?.pollen != null ? smoothstep(5, 120, air.pollen) : 0;
  sections.air = entry(Boolean(air) && (haze > 0.05 || pollen > 0.05 || (air?.pm25 ?? 0) > 15), clamp(Math.max(haze, pollen) * 0.8 + 0.1), haze * 0.6, {
    haze,
    grain: smoothstep(12, 80, air?.pm25 ?? 0),
    pollen,
  });
  if (air) why('Air quality', `AQI ${air.aqi}, PM2.5 ${Math.round(air.pm25)}${air.pollen != null ? `, pollen ${Math.round(air.pollen)}` : ''}`,
    haze > 0.05 ? 'a dusty haze over the whole orchestra' : pollen > 0.05 ? 'drifting pizzicato motes' : 'clear',
    'Particles in the air blur the light — and the sound.', 'air');

  for (const id of SECTION_IDS) sections[id] ??= entry(false, 0, 0);

  return {
    harmony: { root, mode, bpm, category, mood, pressureNorm },
    master: { cutoff: masterCutoff, light, haze },
    hall,
    sections,
    legend,
    listenMinutes,
  };
}
