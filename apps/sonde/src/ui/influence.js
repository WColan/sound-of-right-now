/**
 * Influence — turns a body + the current sky/music state into human-readable
 * "what is this doing to the sound right now" text, and does pointer hit-testing.
 *
 * Pure and side-effect free (no DOM, no Tone): the orrery calls describeBody()
 * to fill its tooltip and findBodyAt() to map a tap/hover to a body.
 */
import { BODY_TUNING, SUN_TUNING } from '../music/mapper.js';

const INTERVALS = [
  [0, 'unison'], [112, 'minor 2nd'], [204, 'major 2nd'], [316, 'minor 3rd'],
  [386, 'major 3rd'], [498, 'perfect 4th'], [590, 'tritone'], [702, 'perfect 5th'],
  [814, 'minor 6th'], [884, 'major 6th'], [996, 'minor 7th'], [1088, 'major 7th'],
  [1200, 'octave'],
];

/** Nearest just-interval name for a pitch given in cents above the fundamental. */
export function justIntervalName(cents) {
  let best = INTERVALS[0];
  let bestDelta = Infinity;
  for (const entry of INTERVALS) {
    const d = Math.abs(entry[0] - cents);
    if (d < bestDelta) { bestDelta = d; best = entry; }
  }
  return best[1];
}

function moonPhaseName(illumination) {
  if (illumination < 0.04) return 'New moon';
  if (illumination < 0.46) return 'Crescent';
  if (illumination < 0.54) return 'Quarter';
  if (illumination < 0.96) return 'Gibbous';
  return 'Full moon';
}

function panText(v) {
  if (v == null) return null;
  const pct = Math.round(Math.abs(v) * 100);
  if (pct < 8) return 'Centred in the stereo field.';
  return `Panned ${pct}% to the ${v > 0 ? 'right' : 'left'}.`;
}

function line(label, value) {
  return value == null ? null : { label, value };
}

/**
 * Describe a body's current musical influence.
 * @param {string} name - 'Sun' | 'Earth' | 'Moon' | a planet name
 * @param {object} snapshot - from getSkySnapshot()
 * @param {object|null} params - from mapSkyToMusic() (may be null before first sample)
 * @returns {{ title: string, subtitle: string, lines: Array<{label,value}> }}
 */
export function describeBody(name, snapshot, params) {
  if (name === 'Sun') {
    return {
      title: 'Sun',
      subtitle: `${Math.round(SUN_TUNING.freq)} Hz · the fundamental`,
      lines: [
        line('Role', 'A constant root drone — the 1/1 every other body is tuned against.'),
        line('Tuning', "Earth's year sets this fundamental pitch."),
      ],
    };
  }

  if (name === 'Earth') {
    const e = snapshot?.earth;
    return {
      title: 'Earth',
      subtitle: 'your vantage point',
      lines: [
        e ? line('Position', `${Math.round(e.lonHelio)}° longitude · 1.00 AU from the Sun.`) : null,
        line('Role', "Sets the harmonic fundamental but doesn't sound — it's where you're listening from."),
        line('Why it matters', "The retrograde you see in other planets comes from Earth's own motion."),
      ].filter(Boolean),
    };
  }

  if (name === 'Moon') {
    const ill = snapshot?.moon?.illumination ?? 0;
    const pct = Math.round(ill * 100);
    const cutoffKHz = params?.lunarCutoff != null ? (params.lunarCutoff / 1000).toFixed(1) : null;
    return {
      title: 'Moon',
      subtitle: `${moonPhaseName(ill)} · ${pct}% lit`,
      lines: [
        line('Voice', 'A high, breathing lunar shimmer above the planetary drones.'),
        line('Now', `${pct}% illuminated → ${ill > 0.5 ? 'bright and present' : 'dim and quiet'}${cutoffKHz ? ` (filter ~${cutoffKHz} kHz)` : ''}.`),
        line('Arc', 'Swells from dark at new moon to radiant at full.'),
      ].filter(Boolean),
    };
  }

  const t = BODY_TUNING[name];
  const b = snapshot?.bodies?.[name];
  if (!t || !b) {
    return { title: name, subtitle: '', lines: [] };
  }

  const interval = justIntervalName(t.cents);
  const cutoff = params?.[`${name}Cutoff`];
  const pulse = params?.[`${name}PulseHz`];
  const detune = params?.[`${name}Detune`];

  const lines = [
    line('Pitch', `${Math.round(t.freq)} Hz — a ${interval} above the Earth-fundamental.`),
    line('Position', `${Math.round(b.lonHelio)}° longitude · ${b.distanceAU.toFixed(2)} AU from the Sun.`),
    line('Pan', panText(params?.[`${name}Pan`])),
    cutoff != null
      ? line('Brightness', `Filter ~${(cutoff / 1000).toFixed(1)} kHz — ${cutoff > 3000 ? 'bright' : cutoff < 1200 ? 'dark' : 'mid'}.`)
      : null,
    pulse != null
      ? line('Shimmer', `${pulse.toFixed(1)} Hz — ${pulse > 2 ? 'fast glint' : pulse < 0.3 ? 'steady drone' : 'gentle pulse'}.`)
      : null,
    b.retrograde
      ? line('Motion', `Retrograde — bent ${Math.abs(Math.round(detune ?? 0))}¢ flat.`)
      : line('Motion', 'Prograde — in tune.'),
    name === 'Jupiter' ? line('Also', "Conducts the Galilean moons' 1:2:4 polyrhythm.") : null,
  ].filter(Boolean);

  return {
    title: name,
    subtitle: `${interval} · ${Math.round(t.freq)} Hz`,
    lines,
  };
}

/**
 * Nearest hit target within its hit radius, or null.
 * @param {number} x @param {number} y
 * @param {Array<{name, x, y, hitR}>} targets
 */
export function findBodyAt(x, y, targets) {
  let best = null;
  let bestDist = Infinity;
  for (const t of targets) {
    const dist = Math.hypot(x - t.x, y - t.y);
    if (dist <= t.hitR && dist < bestDist) {
      bestDist = dist;
      best = t;
    }
  }
  return best;
}
