/**
 * Display — the textual "what am I hearing" overlay: simulation date/time, time
 * warp factor, which planets are retrograde, the strongest current alignments,
 * and the moon phase. Reads the mapper's _meta; never touches audio.
 */

const ASPECT_GLYPH = {
  conjunction: '☌', // ☌
  sextile: '⚹',     // ⚹
  square: '□',      // □
  trine: '△',       // △
  opposition: '☍',  // ☍
};

const DATE_FMT = new Intl.DateTimeFormat('en-GB', {
  day: '2-digit', month: 'short', year: 'numeric',
  hour: '2-digit', minute: '2-digit', timeZone: 'UTC', hour12: false,
});

function moonPhaseName(illumination) {
  if (illumination < 0.04) return 'New';
  if (illumination < 0.46) return 'Crescent';
  if (illumination < 0.54) return 'Quarter';
  if (illumination < 0.96) return 'Gibbous';
  return 'Full';
}

export function createDisplay({
  timeEl = document.getElementById('sonde-time'),
  speedEl = document.getElementById('sonde-speed-label'),
  nowPlayingEl = document.getElementById('sonde-nowplaying'),
} = {}) {
  return {
    setSpeedLabel(label) {
      if (speedEl) speedEl.textContent = label;
    },

    update(meta, { speedLabel } = {}) {
      if (!meta) return;
      if (timeEl) timeEl.textContent = `${DATE_FMT.format(meta.simTime)} UTC`;
      if (speedLabel && speedEl) speedEl.textContent = speedLabel;

      if (!nowPlayingEl) return;
      const lines = [];

      const moonPct = Math.round((meta.moonIllumination ?? 0) * 100);
      lines.push(`<span class="np-label">Moon</span> ${moonPhaseName(meta.moonIllumination ?? 0)} · ${moonPct}%`);

      if (meta.aspects?.length) {
        const top = meta.aspects
          .slice(0, 3)
          .map((a) => `${a.a} ${ASPECT_GLYPH[a.name] ?? '·'} ${a.b}`)
          .join('<br>');
        lines.push(`<span class="np-label">Aligning</span><br>${top}`);
      } else {
        lines.push('<span class="np-label">Aligning</span> —');
      }

      if (meta.retrogradeBodies?.length) {
        lines.push(`<span class="np-label">Retrograde</span> ${meta.retrogradeBodies.join(', ')}`);
      }

      nowPlayingEl.innerHTML = lines.join('<br><br>');
    },
  };
}
