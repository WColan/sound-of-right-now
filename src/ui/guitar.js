/**
 * Guitar practice panel — hidden feature, G key access only.
 *
 * Shows a chord box diagram and scale neck diagram for the current chord,
 * a countdown bar until the next chord change, and a next-chord preview.
 * Not linked from any menu; intended for personal guitar practice use.
 */

// ── Note helpers ──────────────────────────────────────────────────────────────

const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

function noteNameToPitchClass(noteName) {
  const match = noteName.match(/^([A-G]#?)/);
  return NOTE_NAMES.indexOf(match?.[1] ?? 'C');
}

const QUALITY_LABELS = { maj7: 'maj7', min7: 'm7', dom7: '7', min7b5: 'm7♭5' };

function formatChordName(rootName, quality) {
  const label = QUALITY_LABELS[quality] ?? quality;
  // 'm7' and 'm7♭5' run together (Cm7, Cm7♭5); '7' also runs (G7); only 'maj7' takes a space (G maj7)
  return (label.startsWith('m') || label === '7') ? `${rootName}${label}` : `${rootName} ${label}`;
}

// ── Guitar Chord Voicings ─────────────────────────────────────────────────────
// Format: frets = [low-E, A, D, G, B, high-e], -1 = mute, 0 = open, N = fret
// barre: { fret: N, fromString: S } where S=1(low-E)…6(high-e)

const CHORD_VOICINGS = {
  // ── maj7 ──────────────────────────────────────────────────────────────────
  'C_maj7':    { frets: [-1, 3, 2, 0, 0, 0] },
  'C#_maj7':   { frets: [-1, 4, 3, 1, 1, 1], barre: { fret: 1, fromString: 4 } },
  'D_maj7':    { frets: [-1, -1, 0, 2, 2, 2] },
  'D#_maj7':   { frets: [-1, -1, 1, 3, 3, 3], barre: { fret: 3, fromString: 4 } },
  'E_maj7':    { frets: [0, 2, 1, 1, 0, 0] },
  'F_maj7':    { frets: [1, 3, 2, 2, 1, 1], barre: { fret: 1, fromString: 1 } },
  'F#_maj7':   { frets: [2, 4, 3, 3, 2, 2], barre: { fret: 2, fromString: 1 } },
  'G_maj7':    { frets: [3, 2, 0, 0, 0, 2] },
  'G#_maj7':   { frets: [4, 6, 5, 5, 4, 4], barre: { fret: 4, fromString: 1 } },
  'A_maj7':    { frets: [-1, 0, 2, 1, 2, 0] },
  'A#_maj7':   { frets: [-1, 1, 3, 2, 3, 1], barre: { fret: 1, fromString: 2 } },
  'B_maj7':    { frets: [-1, 2, 4, 3, 4, 2], barre: { fret: 2, fromString: 2 } },

  // ── min7 ──────────────────────────────────────────────────────────────────
  'C_min7':    { frets: [-1, 3, 5, 3, 4, 3], barre: { fret: 3, fromString: 2 } },
  'C#_min7':   { frets: [-1, 4, 6, 4, 5, 4], barre: { fret: 4, fromString: 2 } },
  'D_min7':    { frets: [-1, -1, 0, 2, 1, 1], barre: { fret: 1, fromString: 5 } },
  'D#_min7':   { frets: [-1, 6, 8, 6, 7, 6], barre: { fret: 6, fromString: 2 } },
  'E_min7':    { frets: [0, 2, 0, 0, 0, 0] },
  'F_min7':    { frets: [1, 3, 1, 1, 1, 1], barre: { fret: 1, fromString: 1 } },
  'F#_min7':   { frets: [2, 4, 2, 2, 2, 2], barre: { fret: 2, fromString: 1 } },
  'G_min7':    { frets: [3, 5, 3, 3, 3, 3], barre: { fret: 3, fromString: 1 } },
  'G#_min7':   { frets: [4, 6, 4, 4, 4, 4], barre: { fret: 4, fromString: 1 } },
  'A_min7':    { frets: [-1, 0, 2, 0, 1, 0] },
  'A#_min7':   { frets: [-1, 1, 3, 1, 2, 1], barre: { fret: 1, fromString: 2 } },
  'B_min7':    { frets: [-1, 2, 4, 2, 3, 2], barre: { fret: 2, fromString: 2 } },

  // ── dom7 ──────────────────────────────────────────────────────────────────
  'C_dom7':    { frets: [-1, 3, 2, 3, 1, 0] },
  'C#_dom7':   { frets: [-1, 4, 3, 4, 2, 2], barre: { fret: 2, fromString: 5 } },
  'D_dom7':    { frets: [-1, -1, 0, 2, 1, 2] },
  'D#_dom7':   { frets: [-1, 6, 8, 6, 8, 6], barre: { fret: 6, fromString: 2 } },
  'E_dom7':    { frets: [0, 2, 0, 1, 0, 0] },
  'F_dom7':    { frets: [1, 3, 1, 2, 1, 1], barre: { fret: 1, fromString: 1 } },
  'F#_dom7':   { frets: [2, 4, 2, 3, 2, 2], barre: { fret: 2, fromString: 1 } },
  'G_dom7':    { frets: [3, 2, 0, 0, 0, 1] },
  'G#_dom7':   { frets: [4, 6, 4, 5, 4, 4], barre: { fret: 4, fromString: 1 } },
  'A_dom7':    { frets: [-1, 0, 2, 0, 2, 0] },
  'A#_dom7':   { frets: [-1, 1, 3, 1, 3, 1], barre: { fret: 1, fromString: 2 } },
  'B_dom7':    { frets: [-1, 2, 1, 2, 0, 2] },

  // ── min7b5 (half-diminished) ──────────────────────────────────────────────
  'C_min7b5':  { frets: [-1, 3, 4, 3, 4, -1] },
  'C#_min7b5': { frets: [-1, 4, 5, 4, 5, -1] },
  'D_min7b5':  { frets: [-1, -1, 0, 1, 1, 1], barre: { fret: 1, fromString: 4 } },
  'D#_min7b5': { frets: [-1, 6, 7, 6, 7, -1] },
  'E_min7b5':  { frets: [0, 1, 0, 0, -1, -1] },
  'F_min7b5':  { frets: [1, 2, 3, 1, -1, -1], barre: { fret: 1, fromString: 1 } },
  'F#_min7b5': { frets: [2, 3, 4, 2, -1, -1], barre: { fret: 2, fromString: 1 } },
  'G_min7b5':  { frets: [3, 4, 5, 3, -1, -1], barre: { fret: 3, fromString: 1 } },
  'G#_min7b5': { frets: [4, 5, 6, 4, -1, -1], barre: { fret: 4, fromString: 1 } },
  'A_min7b5':  { frets: [-1, 0, 1, 1, 1, -1], barre: { fret: 1, fromString: 3 } },
  'A#_min7b5': { frets: [-1, 1, 2, 1, 2, -1] },
  'B_min7b5':  { frets: [-1, 2, 3, 2, 3, -1] },
};

// ── SVG helpers ───────────────────────────────────────────────────────────────

function svgEl(tag, attrs = {}) {
  const el = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  return el;
}

// ── Chord Box SVG ─────────────────────────────────────────────────────────────

const BOX = {
  W: 110, H: 148,
  ML: 16,   // left margin (X/O column 0 starts here)
  MT: 30,   // top margin (nut/top bar y)
  SW: 14,   // string spacing
  FH: 18,   // fret height
  STRINGS: 6,
  FRETS: 5,
};

function renderChordBox(rootName, quality) {
  const key = `${rootName}_${quality}`;
  const voicing = CHORD_VOICINGS[key];

  const svg = svgEl('svg', {
    viewBox: `0 0 ${BOX.W} ${BOX.H}`,
    width: String(BOX.W),
    height: String(BOX.H),
    'xmlns': 'http://www.w3.org/2000/svg',
    'aria-hidden': 'true',
  });

  if (!voicing) {
    // Fallback: just show the chord name
    const t = svgEl('text', { x: BOX.W / 2, y: BOX.H / 2, 'text-anchor': 'middle',
      fill: 'rgba(255,255,255,0.4)', 'font-size': '10', 'font-family': 'inherit' });
    t.textContent = 'no voicing';
    svg.appendChild(t);
    return svg;
  }

  const { frets, barre } = voicing;

  // Determine display window
  const activeFrets = frets.filter(f => f > 0);
  const minFret = activeFrets.length ? Math.min(...activeFrets) : 1;
  const baseFret = minFret >= 5 ? minFret : 1;

  // Fret position label (shown when chord is up the neck)
  if (baseFret > 1) {
    const lbl = svgEl('text', {
      x: BOX.ML - 4, y: BOX.MT + BOX.FH * 0.6,
      'text-anchor': 'end', fill: 'rgba(255,255,255,0.5)',
      'font-size': '9', 'font-family': 'inherit',
    });
    lbl.textContent = `${baseFret}fr`;
    svg.appendChild(lbl);
  }

  // Nut (thick bar) or plain top edge
  if (baseFret === 1) {
    svg.appendChild(svgEl('rect', {
      x: BOX.ML, y: BOX.MT - 3,
      width: BOX.SW * (BOX.STRINGS - 1), height: 4,
      fill: 'rgba(255,255,255,0.85)', rx: '1',
    }));
  }

  // Fret lines
  for (let f = 1; f <= BOX.FRETS; f++) {
    svg.appendChild(svgEl('line', {
      x1: BOX.ML, y1: BOX.MT + f * BOX.FH,
      x2: BOX.ML + BOX.SW * (BOX.STRINGS - 1), y2: BOX.MT + f * BOX.FH,
      stroke: 'rgba(255,255,255,0.18)', 'stroke-width': '1',
    }));
  }

  // String lines
  for (let s = 0; s < BOX.STRINGS; s++) {
    const x = BOX.ML + s * BOX.SW;
    svg.appendChild(svgEl('line', {
      x1: x, y1: BOX.MT,
      x2: x, y2: BOX.MT + BOX.FRETS * BOX.FH,
      stroke: 'rgba(255,255,255,0.25)', 'stroke-width': '1',
    }));
  }

  // X / O indicators above nut
  for (let s = 0; s < BOX.STRINGS; s++) {
    const f = frets[s];
    const cx = BOX.ML + s * BOX.SW;
    const cy = BOX.MT - 10;
    if (f === -1) {
      const t = svgEl('text', { x: cx, y: cy + 4, 'text-anchor': 'middle',
        fill: 'rgba(255,255,255,0.45)', 'font-size': '10', 'font-family': 'inherit' });
      t.textContent = '×';
      svg.appendChild(t);
    } else if (f === 0) {
      svg.appendChild(svgEl('circle', { cx, cy,
        r: '4', fill: 'none', stroke: 'rgba(255,255,255,0.55)', 'stroke-width': '1.5' }));
    }
  }

  // Barre bar
  if (barre) {
    const adjustedFret = barre.fret - baseFret + 1;
    const barY = BOX.MT + (adjustedFret - 0.5) * BOX.FH;
    const x1 = BOX.ML + (barre.fromString - 1) * BOX.SW;
    const x2 = BOX.ML + (BOX.STRINGS - 1) * BOX.SW;
    svg.appendChild(svgEl('rect', {
      x: x1, y: barY - 5.5, width: x2 - x1, height: 11,
      rx: '5.5', fill: 'rgba(255,255,255,0.75)',
    }));
  }

  // Finger dots
  for (let s = 0; s < BOX.STRINGS; s++) {
    const f = frets[s];
    if (f <= 0) continue;
    const adjustedFret = f - baseFret + 1;
    if (adjustedFret < 1 || adjustedFret > BOX.FRETS) continue;

    // Skip strings covered by the barre (already drawn as bar)
    const isBarre = barre && f === barre.fret && s >= (barre.fromString - 1);
    if (isBarre) continue;

    const cx = BOX.ML + s * BOX.SW;
    const cy = BOX.MT + (adjustedFret - 0.5) * BOX.FH;
    svg.appendChild(svgEl('circle', { cx, cy, r: '6',
      fill: 'rgba(255,255,255,0.9)' }));
  }

  // Chord label at bottom
  const label = svgEl('text', {
    x: BOX.W / 2, y: BOX.H - 4,
    'text-anchor': 'middle', fill: 'rgba(255,255,255,0.5)',
    'font-size': '9', 'font-family': 'inherit', 'letter-spacing': '0.04em',
  });
  label.textContent = formatChordName(rootName, quality);
  svg.appendChild(label);

  return svg;
}

// ── Scale Neck SVG ────────────────────────────────────────────────────────────

// Standard tuning MIDI for open strings: low-E A D G B high-e
const OPEN_MIDI = [40, 45, 50, 55, 59, 64];
const STRING_LABELS = ['E', 'A', 'D', 'G', 'B', 'e'];
const INLAY_FRETS = new Set([3, 5, 7, 9]);
const DOUBLE_INLAY_FRET = 12;

const NECK = {
  W: 580, H: 108,
  ML: 24,   // left margin (nut x)
  MT: 10,   // top margin (first string y)
  FW: 42,   // fret width
  SH: 16,   // string spacing
  FRETS: 12,
  STRINGS: 6,
};

function renderScaleNeck(scaleTones, chordTones, rootName) {
  // Build pitch class sets
  const scalePCs = new Set((scaleTones ?? []).map(noteNameToPitchClass));
  const chordPCs = new Set((chordTones ?? []).map(noteNameToPitchClass));
  const rootPC = noteNameToPitchClass(rootName);

  const svg = svgEl('svg', {
    viewBox: `0 0 ${NECK.W} ${NECK.H}`,
    width: String(NECK.W),
    height: String(NECK.H),
    'xmlns': 'http://www.w3.org/2000/svg',
    'aria-hidden': 'true',
  });

  // Fret board background
  svg.appendChild(svgEl('rect', {
    x: NECK.ML, y: NECK.MT,
    width: NECK.FW * NECK.FRETS, height: NECK.SH * (NECK.STRINGS - 1),
    fill: 'rgba(255,255,255,0.03)', rx: '2',
  }));

  // Inlay dots (below strings)
  const inlayY = NECK.MT + NECK.SH * (NECK.STRINGS - 1) + 8;
  for (let fr = 1; fr <= NECK.FRETS; fr++) {
    if (INLAY_FRETS.has(fr)) {
      svg.appendChild(svgEl('circle', {
        cx: NECK.ML + (fr - 0.5) * NECK.FW, cy: inlayY,
        r: '3', fill: 'rgba(255,255,255,0.12)',
      }));
    } else if (fr === DOUBLE_INLAY_FRET) {
      svg.appendChild(svgEl('circle', {
        cx: NECK.ML + (fr - 0.5) * NECK.FW - 6, cy: inlayY,
        r: '3', fill: 'rgba(255,255,255,0.12)',
      }));
      svg.appendChild(svgEl('circle', {
        cx: NECK.ML + (fr - 0.5) * NECK.FW + 6, cy: inlayY,
        r: '3', fill: 'rgba(255,255,255,0.12)',
      }));
    }
  }

  // Nut
  svg.appendChild(svgEl('rect', {
    x: NECK.ML - 3, y: NECK.MT - 1,
    width: 3, height: NECK.SH * (NECK.STRINGS - 1) + 2,
    fill: 'rgba(255,255,255,0.6)', rx: '1',
  }));

  // Fret lines
  for (let fr = 1; fr <= NECK.FRETS; fr++) {
    svg.appendChild(svgEl('line', {
      x1: NECK.ML + fr * NECK.FW, y1: NECK.MT,
      x2: NECK.ML + fr * NECK.FW, y2: NECK.MT + NECK.SH * (NECK.STRINGS - 1),
      stroke: 'rgba(255,255,255,0.12)', 'stroke-width': '1',
    }));
  }

  // String lines
  for (let s = 0; s < NECK.STRINGS; s++) {
    const y = NECK.MT + s * NECK.SH;
    const thickness = 1 + (NECK.STRINGS - 1 - s) * 0.2; // low E slightly thicker
    svg.appendChild(svgEl('line', {
      x1: NECK.ML, y1: y,
      x2: NECK.ML + NECK.FW * NECK.FRETS, y2: y,
      stroke: 'rgba(255,255,255,0.2)', 'stroke-width': String(thickness),
    }));
  }

  // String labels
  for (let s = 0; s < NECK.STRINGS; s++) {
    const lbl = svgEl('text', {
      x: NECK.ML - 6, y: NECK.MT + s * NECK.SH + 4,
      'text-anchor': 'end', fill: 'rgba(255,255,255,0.3)',
      'font-size': '8', 'font-family': 'inherit',
    });
    lbl.textContent = STRING_LABELS[s];
    svg.appendChild(lbl);
  }

  // Note dots
  for (let s = 0; s < NECK.STRINGS; s++) {
    for (let fr = 0; fr <= NECK.FRETS; fr++) {
      const midi = OPEN_MIDI[s] + fr;
      const pc = midi % 12;

      if (!scalePCs.has(pc) && !chordPCs.has(pc)) continue;

      const isChordTone = chordPCs.has(pc);
      const isRoot = pc === rootPC;
      const cx = fr === 0 ? NECK.ML - 1 : NECK.ML + (fr - 0.5) * NECK.FW;
      const cy = NECK.MT + s * NECK.SH;

      if (isRoot) {
        // Root: gold filled square-ish (rounded rect)
        svg.appendChild(svgEl('rect', {
          x: cx - 7, y: cy - 7, width: 14, height: 14,
          rx: '3', fill: 'rgba(255,210,80,0.95)',
        }));
        const t = svgEl('text', {
          x: cx, y: cy + 4, 'text-anchor': 'middle',
          fill: 'rgba(0,0,0,0.8)', 'font-size': '7', 'font-family': 'inherit',
          'font-weight': 'bold',
        });
        t.textContent = NOTE_NAMES[pc];
        svg.appendChild(t);
      } else if (isChordTone) {
        // Non-root chord tone: filled gold circle
        svg.appendChild(svgEl('circle', { cx, cy, r: '6',
          fill: 'rgba(255,210,80,0.7)' }));
      } else {
        // Scale tone: hollow white circle
        svg.appendChild(svgEl('circle', { cx, cy, r: '5',
          fill: 'none', stroke: 'rgba(255,255,255,0.4)', 'stroke-width': '1.5' }));
      }
    }
  }

  return svg;
}

// ── Countdown RAF ─────────────────────────────────────────────────────────────

let cdStart = null;
let cdDuration = null;
let cdRaf = null;
let cdBar = null;

function startCountdown(ms, barEl) {
  cdBar = barEl;
  cdStart = performance.now();
  cdDuration = ms;
  if (!cdRaf) tickCd();
}

function tickCd() {
  if (!cdBar || !cdDuration) { cdRaf = null; return; }
  const remaining = 1 - Math.min(1, (performance.now() - cdStart) / cdDuration);
  cdBar.style.width = `${remaining * 100}%`;
  if (remaining < 0.1) {
    cdBar.style.background = 'rgba(255,100,60,0.85)';
  } else if (remaining < 0.25) {
    cdBar.style.background = 'rgba(255,165,60,0.75)';
  } else {
    cdBar.style.background = 'rgba(120,160,255,0.5)';
  }
  cdRaf = requestAnimationFrame(tickCd);
}

export function stopCountdown() {
  if (cdRaf) { cancelAnimationFrame(cdRaf); cdRaf = null; }
}

// ── Panel state ───────────────────────────────────────────────────────────────

let panel = null;
let currentTab = 'chord';
let chordNameEl = null;
let countdownBarEl = null;
let chordBoxContainer = null;
let nextChordBoxContainer = null;
let scaleNeckContainer = null;

function showTab(tab) {
  currentTab = tab;
  const chordBtn = panel?.querySelector('[data-tab="chord"]');
  const scaleBtn = panel?.querySelector('[data-tab="scale"]');
  const chordBoxes = panel?.querySelector('.guitar-chord-boxes');
  if (tab === 'chord') {
    chordBoxes?.classList.remove('hidden');
    scaleNeckContainer?.classList.add('hidden');
    chordBtn?.classList.add('active');
    scaleBtn?.classList.remove('active');
  } else {
    chordBoxes?.classList.add('hidden');
    scaleNeckContainer?.classList.remove('hidden');
    chordBtn?.classList.remove('active');
    scaleBtn?.classList.add('active');
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

export function setupGuitarPanel(el) {
  panel = el;
  chordNameEl = el.querySelector('.guitar-chord-name');
  countdownBarEl = el.querySelector('.guitar-countdown-bar');
  chordBoxContainer = el.querySelector('.guitar-chord-box');
  nextChordBoxContainer = el.querySelector('.guitar-next-chord-box');
  scaleNeckContainer = el.querySelector('.guitar-scale-neck');

  el.querySelector('[data-tab="chord"]')?.addEventListener('click', () => showTab('chord'));
  el.querySelector('[data-tab="scale"]')?.addEventListener('click', () => showTab('scale'));
  el.querySelector('.guitar-close')?.addEventListener('click', hideGuitarPanel);
}

export function showGuitarPanel() {
  panel?.classList.remove('hidden');
}

export function hideGuitarPanel() {
  panel?.classList.add('hidden');
  stopCountdown();
}

export function toggleGuitarPanel() {
  if (!panel) return;
  if (panel.classList.contains('hidden')) {
    showGuitarPanel();
  } else {
    hideGuitarPanel();
  }
}

export function onGuitarChordChange(chordInfo) {
  const { rootName, quality, nextChord, scaleTones, chordTones, intervalSeconds } = chordInfo;

  // Update header chord name
  if (chordNameEl) chordNameEl.textContent = formatChordName(rootName, quality);

  // Re-render current chord box
  if (chordBoxContainer) {
    chordBoxContainer.innerHTML = '';
    chordBoxContainer.appendChild(renderChordBox(rootName, quality));
  }

  // Re-render next chord box
  if (nextChordBoxContainer) {
    nextChordBoxContainer.innerHTML = '';
    if (nextChord) {
      nextChordBoxContainer.appendChild(
        renderChordBox(nextChord.chordRootName, nextChord.quality)
      );
    }
  }

  // Re-render scale neck
  if (scaleNeckContainer) {
    scaleNeckContainer.innerHTML = '';
    scaleNeckContainer.appendChild(renderScaleNeck(scaleTones, chordTones, rootName));
  }

  // Restart countdown
  const durationMs = intervalSeconds ? intervalSeconds * 1000 : 8000;
  stopCountdown();
  if (countdownBarEl) startCountdown(durationMs, countdownBarEl);
}
