/**
 * Sound profile system — weather-driven instrument character presets.
 *
 * Rather than replacing the weather-to-music mapping, profiles *flavor* it:
 * harmony, key, melody patterns, and mood remain weather-driven. The profile
 * changes the *timbres and mix* so the same weather-derived music sounds like
 * a different ensemble.
 *
 * Profiles:
 *   ambient   — Current synth behavior (warm electronic pads, subtle percussion)
 *   symphonic — Orchestral character: strings pad, arco bass, flute melody, choral choir
 *   rock      — Electric band: distorted guitar pad, punchy bass, lead guitar melody, heavy kit
 *   jazz      — Jazz ensemble: piano chord stabs, upright bass pluck, sax melody, brush kit
 *
 * Weather → profile mapping:
 *   storm            → rock      (heavy weather = heavy band)
 *   clear + daytime  → symphonic (open sky = majestic orchestra)
 *   clear + night    → jazz      (clear night = intimate jazz club)
 *   everything else  → ambient   (atmospheric conditions = atmospheric synths)
 */

/**
 * Detect which sound profile matches the current weather conditions.
 *
 * @param {object} params - Musical params from mapWeatherToMusic()
 * @param {string} params.weatherCategory - e.g. 'clear', 'storm', 'rain'
 * @param {number} params.globalVelocityScale - 0.4 (night) to 1.0 (noon)
 * @returns {'ambient'|'symphonic'|'rock'|'jazz'}
 */
export function detectSoundProfile({ weatherCategory, globalVelocityScale }) {
  const isNight = (globalVelocityScale ?? 1) < 0.55;

  if (weatherCategory === 'storm') return 'rock';
  if (weatherCategory === 'clear') return isNight ? 'jazz' : 'symphonic';
  return 'ambient';
}
