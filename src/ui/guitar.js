/**
 * Guitar practice panel — hidden feature, G key access only.
 *
 * Shows a vertical fretboard with chord voicing or scale notes for the current
 * chord, a countdown bar until the next chord change, and a next-chord name
 * preview in the header. Not linked from any menu; intended for personal
 * guitar practice use.
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

// ── Alternative voicing generation (CAGED system) ─────────────────────────────
// Offsets from root fret for E-shape and A-shape barre voicings.
// -1 in frets means mute; these are interval offsets, so -1 is not a real offset.

const E_SHAPE_OFFSETS = {
  maj7:   [0, 2, 1, 1, 0, 0],
  min7:   [0, 2, 0, 0, 0, 0],
  dom7:   [0, 2, 0, 1, 0, 0],
  min7b5: [0, 1, 2, 0, -1, -1],  // mute B and high-e
};

const A_SHAPE_OFFSETS = {
  maj7:   [-1, 0, 2, 1, 2, 0],
  min7:   [-1, 0, 2, 0, 1, 0],
  dom7:   [-1, 0, 2, 0, 2, 0],
  min7b5: [-1, 0, 1, 0, 1, -1],  // mute high-e
};

// Root note fret positions on each string
const ROOT_ON_E = { C: 8, 'C#': 9, D: 10, 'D#': 11, E: 0, F: 1, 'F#': 2, G: 3, 'G#': 4, A: 5, 'A#': 6, B: 7 };
const ROOT_ON_A = { C: 3, 'C#': 4, D: 5, 'D#': 6, E: 7, F: 8, 'F#': 9, G: 10, 'G#': 11, A: 0, 'A#': 1, B: 2 };

function getAltVoicing(rootName, quality) {
  const primary = CHORD_VOICINGS[`${rootName}_${quality}`];
  if (!primary) return null;

  const primaryIsEShape = primary.barre?.fromString === 1;

  function tryShape(useAShape) {
    const offsets = useAShape ? A_SHAPE_OFFSETS[quality] : E_SHAPE_OFFSETS[quality];
    const rootFret = useAShape ? ROOT_ON_A[rootName] : ROOT_ON_E[rootName];
    if (!offsets || rootFret == null) return null;
    const frets = offsets.map(o => (o === -1 ? -1 : rootFret + o));
    if (frets.some(f => f > 12)) return null;
    // Skip if identical to primary
    if (primary.frets.every((f, i) => f === frets[i])) return null;
    const barre = rootFret > 0 ? { fret: rootFret, fromString: useAShape ? 2 : 1 } : null;
    return { frets, barre };
  }

  // Prefer the opposite shape from primary; fall back to same shape at different position
  return tryShape(!primaryIsEShape) ?? tryShape(primaryIsEShape);
}

// ── Compact chord box (used for next-chord preview) ───────────────────────────
// Original 5-fret horizontal chord diagram; scrolls to the relevant fret window.

const BOX = {
  W: 110, H: 148,
  ML: 16, MT: 30,
  SW: 14, FH: 18,
  STRINGS: 6, FRETS: 5,
};

function renderChordBox(rootName, quality) {
  const key = `${rootName}_${quality}`;
  const voicing = CHORD_VOICINGS[key];

  const svg = svgEl('svg', {
    viewBox: `0 0 ${BOX.W} ${BOX.H}`,
    width: String(BOX.W), height: String(BOX.H),
    xmlns: 'http://www.w3.org/2000/svg', 'aria-hidden': 'true',
  });

  if (!voicing) {
    const t = svgEl('text', { x: BOX.W / 2, y: BOX.H / 2, 'text-anchor': 'middle',
      fill: 'rgba(255,255,255,0.4)', 'font-size': '10', 'font-family': 'inherit' });
    t.textContent = 'no voicing';
    svg.appendChild(t);
    return svg;
  }

  const { frets, barre } = voicing;

  const activeFrets = frets.filter(f => f > 0);
  const minFret = activeFrets.length ? Math.min(...activeFrets) : 1;
  const baseFret = minFret >= 5 ? minFret : 1;

  if (baseFret > 1) {
    const lbl = svgEl('text', {
      x: BOX.ML - 4, y: BOX.MT + BOX.FH * 0.6,
      'text-anchor': 'end', fill: 'rgba(255,255,255,0.5)',
      'font-size': '9', 'font-family': 'inherit',
    });
    lbl.textContent = `${baseFret}fr`;
    svg.appendChild(lbl);
  }

  if (baseFret === 1) {
    svg.appendChild(svgEl('rect', {
      x: BOX.ML, y: BOX.MT - 3,
      width: BOX.SW * (BOX.STRINGS - 1), height: 4,
      fill: 'rgba(255,255,255,0.85)', rx: '1',
    }));
  }

  for (let f = 1; f <= BOX.FRETS; f++) {
    svg.appendChild(svgEl('line', {
      x1: BOX.ML, y1: BOX.MT + f * BOX.FH,
      x2: BOX.ML + BOX.SW * (BOX.STRINGS - 1), y2: BOX.MT + f * BOX.FH,
      stroke: 'rgba(255,255,255,0.18)', 'stroke-width': '1',
    }));
  }

  for (let s = 0; s < BOX.STRINGS; s++) {
    const x = BOX.ML + s * BOX.SW;
    svg.appendChild(svgEl('line', {
      x1: x, y1: BOX.MT, x2: x, y2: BOX.MT + BOX.FRETS * BOX.FH,
      stroke: 'rgba(255,255,255,0.25)', 'stroke-width': '1',
    }));
  }

  for (let s = 0; s < BOX.STRINGS; s++) {
    const f = frets[s];
    const bx = BOX.ML + s * BOX.SW;
    const by = BOX.MT - 10;
    if (f === -1) {
      const t = svgEl('text', { x: bx, y: by + 4, 'text-anchor': 'middle',
        fill: 'rgba(255,255,255,0.45)', 'font-size': '10', 'font-family': 'inherit' });
      t.textContent = '×';
      svg.appendChild(t);
    } else if (f === 0) {
      svg.appendChild(svgEl('circle', { cx: bx, cy: by,
        r: '4', fill: 'none', stroke: 'rgba(255,255,255,0.55)', 'stroke-width': '1.5' }));
    }
  }

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

  for (let s = 0; s < BOX.STRINGS; s++) {
    const f = frets[s];
    if (f <= 0) continue;
    const adjustedFret = f - baseFret + 1;
    if (adjustedFret < 1 || adjustedFret > BOX.FRETS) continue;
    if (barre && f === barre.fret && s >= (barre.fromString - 1)) continue;
    svg.appendChild(svgEl('circle', {
      cx: BOX.ML + s * BOX.SW, cy: BOX.MT + (adjustedFret - 0.5) * BOX.FH,
      r: '6', fill: 'rgba(255,255,255,0.9)',
    }));
  }

  const label = svgEl('text', {
    x: BOX.W / 2, y: BOX.H - 4,
    'text-anchor': 'middle', fill: 'rgba(255,255,255,0.5)',
    'font-size': '9', 'font-family': 'inherit', 'letter-spacing': '0.04em',
  });
  label.textContent = formatChordName(rootName, quality);
  svg.appendChild(label);

  return svg;
}

// ── SVG helpers ───────────────────────────────────────────────────────────────

function svgEl(tag, attrs = {}) {
  const el = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  return el;
}

// ── Shared vertical fretboard dimensions ─────────────────────────────────────
// Strings run left→right (low-E … high-e); frets run top→bottom (nut at top).

// Standard tuning open string MIDI: low-E A D G B high-e
const OPEN_MIDI = [40, 45, 50, 55, 59, 64];
const STRING_LABELS = ['E', 'A', 'D', 'G', 'B', 'e'];
const INLAY_FRETS = new Set([3, 5, 7, 9]);
const DOUBLE_INLAY_FRET = 12;

const VFRET = {
  W: 180, H: 440,
  ML: 22,   // x of string 0 (low-E)
  MT: 30,   // y of nut — space above for open/mute indicators & string labels
  SW: 24,   // string spacing  (5 × 24 = 120px across 6 strings)
  FH: 32,   // fret height     (12 × 32 = 384px)
  FRETS: 12,
  STRINGS: 6,
};

// cx for string s, cy for fret fr (fr=0 is nut; dots sit between fret lines)
function cx(s) { return VFRET.ML + s * VFRET.SW; }
function cy(fr) { return VFRET.MT + (fr - 0.5) * VFRET.FH; } // midpoint between fr-1 and fr lines

// ── Common fretboard skeleton ─────────────────────────────────────────────────

function buildFretboardSkeleton(svg) {
  const { ML, MT, SW, FH, FRETS, STRINGS } = VFRET;

  // Fretboard background
  svg.appendChild(svgEl('rect', {
    x: ML, y: MT,
    width: SW * (STRINGS - 1), height: FH * FRETS,
    fill: 'rgba(255,255,255,0.03)', rx: '2',
  }));

  // Inlay dots (left of fretboard, low-E side)
  const inlayX = ML - 12;
  for (let fr = 1; fr <= FRETS; fr++) {
    if (INLAY_FRETS.has(fr)) {
      svg.appendChild(svgEl('circle', {
        cx: inlayX, cy: MT + (fr - 0.5) * FH,
        r: '3', fill: 'rgba(255,255,255,0.12)',
      }));
    } else if (fr === DOUBLE_INLAY_FRET) {
      svg.appendChild(svgEl('circle', {
        cx: inlayX, cy: MT + (fr - 0.5) * FH - 6,
        r: '3', fill: 'rgba(255,255,255,0.12)',
      }));
      svg.appendChild(svgEl('circle', {
        cx: inlayX, cy: MT + (fr - 0.5) * FH + 6,
        r: '3', fill: 'rgba(255,255,255,0.12)',
      }));
    }
  }

  // Nut
  svg.appendChild(svgEl('rect', {
    x: ML - 1, y: MT - 3,
    width: SW * (STRINGS - 1) + 2, height: 3,
    fill: 'rgba(255,255,255,0.65)', rx: '1',
  }));

  // Fret lines (horizontal)
  for (let fr = 1; fr <= FRETS; fr++) {
    svg.appendChild(svgEl('line', {
      x1: ML, y1: MT + fr * FH,
      x2: ML + SW * (STRINGS - 1), y2: MT + fr * FH,
      stroke: 'rgba(255,255,255,0.12)', 'stroke-width': '1',
    }));
  }

  // String lines (vertical)
  for (let s = 0; s < STRINGS; s++) {
    const thickness = 1 + (STRINGS - 1 - s) * 0.2; // low-E slightly thicker
    svg.appendChild(svgEl('line', {
      x1: cx(s), y1: MT,
      x2: cx(s), y2: MT + FH * FRETS,
      stroke: 'rgba(255,255,255,0.22)', 'stroke-width': String(thickness),
    }));
  }
}

function makeFretboardSVG() {
  return svgEl('svg', {
    viewBox: `0 0 ${VFRET.W} ${VFRET.H}`,
    width: String(VFRET.W),
    height: String(VFRET.H),
    xmlns: 'http://www.w3.org/2000/svg',
    'aria-hidden': 'true',
  });
}

// ── Vertical Chord Box SVG ────────────────────────────────────────────────────

const PRIMARY_COLOR = { barre: 'rgba(255,255,255,0.75)', dot: 'rgba(255,255,255,0.9)' };
const ALT_COLOR     = { barre: 'rgba(80,200,175,0.70)',  dot: 'rgba(80,200,175,0.90)' };

const SCALE_COLORS_CURRENT = {
  root:      'rgba(255,210,80,0.95)',
  chordTone: 'rgba(255,210,80,0.7)',
  scaleTone: 'rgba(255,255,255,0.4)',
};
const SCALE_COLORS_NEXT = {
  root:      'rgba(80,200,175,0.95)',
  chordTone: 'rgba(80,200,175,0.70)',
  scaleTone: 'rgba(80,200,175,0.45)',
};

function renderVoicingDots(svg, voicing, color) {
  const { frets, barre } = voicing;
  if (barre) {
    const barY = cy(barre.fret);
    const x1 = cx(barre.fromString - 1);
    const x2 = cx(VFRET.STRINGS - 1);
    svg.appendChild(svgEl('rect', {
      x: x1, y: barY - 7,
      width: x2 - x1, height: 14,
      rx: '7', fill: color.barre,
    }));
  }
  for (let s = 0; s < VFRET.STRINGS; s++) {
    const f = frets[s];
    if (f <= 0) continue;
    if (f > VFRET.FRETS) continue;
    if (barre && f === barre.fret && s >= (barre.fromString - 1)) continue;
    svg.appendChild(svgEl('circle', {
      cx: cx(s), cy: cy(f),
      r: '9', fill: color.dot,
    }));
  }
}

function renderVerticalChordBox(rootName, quality, { showAlt = true } = {}) {
  const key = `${rootName}_${quality}`;
  const voicing = CHORD_VOICINGS[key];

  const svg = makeFretboardSVG();

  if (!voicing) {
    buildFretboardSkeleton(svg);
    const t = svgEl('text', {
      x: VFRET.W / 2, y: VFRET.H / 2,
      'text-anchor': 'middle', fill: 'rgba(255,255,255,0.25)',
      'font-size': '10', 'font-family': 'inherit',
    });
    t.textContent = 'no voicing';
    svg.appendChild(t);
    return svg;
  }

  buildFretboardSkeleton(svg);

  // Open (○) / Mute (×) indicators above nut for primary voicing
  for (let s = 0; s < VFRET.STRINGS; s++) {
    const f = voicing.frets[s];
    const x = cx(s);
    const y = VFRET.MT - 11;
    if (f === -1) {
      const t = svgEl('text', {
        x, y: y + 4, 'text-anchor': 'middle',
        fill: 'rgba(255,255,255,0.35)', 'font-size': '10', 'font-family': 'inherit',
      });
      t.textContent = '×';
      svg.appendChild(t);
    } else if (f === 0) {
      svg.appendChild(svgEl('circle', {
        cx: x, cy: y,
        r: '4', fill: 'none', stroke: 'rgba(255,255,255,0.45)', 'stroke-width': '1.5',
      }));
    }
  }

  // Alt voicing (teal) drawn first so primary (white) renders on top
  if (showAlt) {
    const altVoicing = getAltVoicing(rootName, quality);
    if (altVoicing) renderVoicingDots(svg, altVoicing, ALT_COLOR);
  }

  // Primary voicing (white/gray)
  renderVoicingDots(svg, voicing, PRIMARY_COLOR);

  return svg;
}

// ── Vertical Scale Neck SVG ───────────────────────────────────────────────────

function renderVerticalScaleNeck(scaleTones, chordTones, rootName, { colors = SCALE_COLORS_CURRENT } = {}) {
  const scalePCs = new Set((scaleTones ?? []).map(noteNameToPitchClass));
  const chordPCs = new Set((chordTones ?? []).map(noteNameToPitchClass));
  const rootPC = noteNameToPitchClass(rootName);

  const svg = makeFretboardSVG();

  buildFretboardSkeleton(svg);

  // String labels above nut
  for (let s = 0; s < VFRET.STRINGS; s++) {
    const lbl = svgEl('text', {
      x: cx(s), y: VFRET.MT - 12,
      'text-anchor': 'middle', fill: 'rgba(255,255,255,0.28)',
      'font-size': '8', 'font-family': 'inherit',
    });
    lbl.textContent = STRING_LABELS[s];
    svg.appendChild(lbl);
  }

  // Note dots: open strings (fret 0) and fretted notes (fret 1..12)
  for (let s = 0; s < VFRET.STRINGS; s++) {
    for (let fr = 0; fr <= VFRET.FRETS; fr++) {
      const midi = OPEN_MIDI[s] + fr;
      const pc = midi % 12;

      if (!scalePCs.has(pc) && !chordPCs.has(pc)) continue;

      const isChordTone = chordPCs.has(pc);
      const isRoot = pc === rootPC;
      // Open string sits just above the nut
      const dotX = cx(s);
      const dotY = fr === 0 ? VFRET.MT - 4 : cy(fr);

      if (isRoot) {
        svg.appendChild(svgEl('rect', {
          x: dotX - 7, y: dotY - 7, width: 14, height: 14,
          rx: '3', fill: colors.root,
        }));
        const t = svgEl('text', {
          x: dotX, y: dotY + 4, 'text-anchor': 'middle',
          fill: 'rgba(0,0,0,0.8)', 'font-size': '7', 'font-family': 'inherit',
          'font-weight': 'bold',
        });
        t.textContent = NOTE_NAMES[pc];
        svg.appendChild(t);
      } else if (isChordTone) {
        svg.appendChild(svgEl('circle', {
          cx: dotX, cy: dotY, r: '6',
          fill: colors.chordTone,
        }));
      } else {
        svg.appendChild(svgEl('circle', {
          cx: dotX, cy: dotY, r: '5',
          fill: 'none', stroke: colors.scaleTone, 'stroke-width': '1.5',
        }));
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

// Scale crossfade state
let scaleCurrentLayer = null;
let scaleNextLayer    = null;
let scaleCrossfadeRaf = null;

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
  stopScaleFade();
}

// ── Scale crossfade RAF ───────────────────────────────────────────────────────

function tickScaleFade() {
  if (!scaleCurrentLayer || !scaleNextLayer || !cdDuration) {
    scaleCrossfadeRaf = null;
    return;
  }
  const remaining = 1 - Math.min(1, (performance.now() - cdStart) / cdDuration);
  const FADE_START = 0.25;
  if (remaining < FADE_START) {
    const t = (FADE_START - remaining) / FADE_START;
    const ts = t * t * (3 - 2 * t); // smoothstep
    scaleCurrentLayer.style.opacity = String(1 - ts);
    scaleNextLayer.style.opacity    = String(ts);
  }
  scaleCrossfadeRaf = requestAnimationFrame(tickScaleFade);
}

function startScaleFade() {
  if (scaleCrossfadeRaf) cancelAnimationFrame(scaleCrossfadeRaf);
  scaleCrossfadeRaf = requestAnimationFrame(tickScaleFade);
}

function stopScaleFade() {
  if (scaleCrossfadeRaf) { cancelAnimationFrame(scaleCrossfadeRaf); scaleCrossfadeRaf = null; }
}

function ensureScaleLayers() {
  if (scaleCurrentLayer && fretboardContainer.contains(scaleCurrentLayer)) return;
  fretboardContainer.innerHTML = '';
  scaleCurrentLayer = document.createElement('div');
  scaleCurrentLayer.className = 'scale-layer scale-layer--current';
  scaleNextLayer = document.createElement('div');
  scaleNextLayer.className = 'scale-layer scale-layer--next';
  fretboardContainer.appendChild(scaleCurrentLayer);
  fretboardContainer.appendChild(scaleNextLayer);
}

function teardownScaleLayers() {
  stopScaleFade();
  scaleCurrentLayer = null;
  scaleNextLayer    = null;
  fretboardContainer?.classList.remove('scale-mode');
}

// ── Panel state ───────────────────────────────────────────────────────────────

let panel = null;
let currentTab = 'chord';
let chordNameEl = null;
let nextChordNameEl = null;
let countdownBarEl = null;
let fretboardContainer = null;
let nextFretboardContainer = null;
let nextChordSection = null;
let nextChordLabelEl = null;
let lastChordInfo = null;

function renderFretboard(chordInfo) {
  if (!fretboardContainer) return;
  const { rootName, quality, scaleTones, chordTones, nextChord } = chordInfo;

  if (currentTab === 'scale') {
    fretboardContainer.classList.add('scale-mode');
    ensureScaleLayers();

    // Current chord scale (gold)
    scaleCurrentLayer.innerHTML = '';
    scaleCurrentLayer.style.opacity = '1';
    scaleCurrentLayer.appendChild(
      renderVerticalScaleNeck(scaleTones, chordTones, rootName, { colors: SCALE_COLORS_CURRENT })
    );

    // Next chord scale (teal)
    scaleNextLayer.innerHTML = '';
    scaleNextLayer.style.opacity = '0';
    if (nextChord) {
      scaleNextLayer.appendChild(
        renderVerticalScaleNeck(
          nextChord.scaleTones, nextChord.chordTones, nextChord.chordRootName,
          { colors: SCALE_COLORS_NEXT }
        )
      );
    }

    nextChordSection?.classList.add('hidden');
    return;
  }

  // Chord tab — tear down scale layers if switching from scale
  fretboardContainer.classList.remove('scale-mode');
  teardownScaleLayers();

  const svg = renderVerticalChordBox(rootName, quality);
  fretboardContainer.innerHTML = '';
  fretboardContainer.appendChild(svg);

  // Next chord mini-preview
  if (nextChordSection && nextFretboardContainer && nextChordLabelEl) {
    if (nextChord) {
      const nextSvg = renderChordBox(nextChord.chordRootName, nextChord.quality);
      nextFretboardContainer.innerHTML = '';
      nextFretboardContainer.appendChild(nextSvg);
      nextChordLabelEl.textContent = formatChordName(nextChord.chordRootName, nextChord.quality);
      nextChordSection.classList.remove('hidden');
    } else {
      nextChordSection.classList.add('hidden');
    }
  }
}

function showTab(tab) {
  const previousTab = currentTab;
  currentTab = tab;
  const chordBtn = panel?.querySelector('[data-tab="chord"]');
  const scaleBtn = panel?.querySelector('[data-tab="scale"]');
  if (tab === 'chord') {
    chordBtn?.classList.add('active');
    scaleBtn?.classList.remove('active');
  } else {
    chordBtn?.classList.remove('active');
    scaleBtn?.classList.add('active');
  }
  // Fade out, swap, fade in
  if (fretboardContainer && lastChordInfo) {
    if (previousTab === 'scale') teardownScaleLayers();
    fretboardContainer.classList.add('fading');
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        renderFretboard(lastChordInfo);
        fretboardContainer.classList.remove('fading');
        if (tab === 'scale' && lastChordInfo.nextChord) startScaleFade();
      });
    });
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

export function setupGuitarPanel(el) {
  panel = el;
  chordNameEl = el.querySelector('.guitar-chord-name');
  nextChordNameEl = el.querySelector('.guitar-next-chord-name');
  countdownBarEl = el.querySelector('.guitar-countdown-bar');
  fretboardContainer = el.querySelector('.guitar-fretboard');
  nextFretboardContainer = el.querySelector('.guitar-next-fretboard');
  nextChordSection = el.querySelector('.guitar-next-section');
  nextChordLabelEl = el.querySelector('.guitar-next-chord-label');

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
  teardownScaleLayers();
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
  lastChordInfo = chordInfo;

  if (chordNameEl) chordNameEl.textContent = formatChordName(rootName, quality);

  if (nextChordNameEl) {
    nextChordNameEl.textContent = nextChord
      ? `→\u00a0${formatChordName(nextChord.chordRootName, nextChord.quality)}`
      : '';
  }

  stopScaleFade();
  renderFretboard(chordInfo);

  const durationMs = intervalSeconds ? intervalSeconds * 1000 : 8000;
  stopCountdown();
  if (countdownBarEl) startCountdown(durationMs, countdownBarEl);
  if (currentTab === 'scale' && nextChord) startScaleFade();
}
