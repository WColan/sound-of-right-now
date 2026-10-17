#!/usr/bin/env node
/**
 * Build the vendored orchestral sample set from VSCO-2 Community Edition (CC0).
 *
 * Usage:
 *   node scripts/build-samples.mjs [path-to-VSCO-2-CE-checkout]
 *
 * If no path is given, the repo is sparse-cloned into ./.cache/vsco (only the
 * folders we use are fetched). Requires git + ffmpeg on PATH.
 *
 * Output:
 *   public/samples/<instrument>/<Note>.m4a   (mono AAC, trimmed, peak-normalised)
 *   public/samples/manifest.json             ({ instrument: { tier, notes: { "C4": "C4.m4a" } } })
 *
 * VSCO names most pitched files with the "middle C = C3" convention; the
 * `octaveShift` per instrument converts to scientific pitch (middle C = C4),
 * which is what Tone.Sampler expects. Each pitch is verified by autocorrelation
 * and the build warns when the detected pitch disagrees.
 */

import { execFileSync, spawnSync } from 'child_process';
import { existsSync, mkdirSync, rmSync, writeFileSync, readdirSync, statSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'public', 'samples');
const BITRATE = '80k';

// tier 1 loads first (harmony bed), tier 3 last (colour + events)
const INSTRUMENTS = {
  violins:     { tier: 1, dir: 'Strings/Violin Section/susVib',  match: /_susVib_([A-G]#?\d)_v1\.wav$/, octaveShift: 1, maxSec: 7, fade: 1.5 },
  violas:      { tier: 1, dir: 'Strings/Viola Section/susvib',   match: /_susvib_([A-G]#?\d)_v1_1\.wav$/, octaveShift: 1, maxSec: 7, fade: 1.5 },
  celli:       { tier: 1, dir: 'Strings/Cello Section/susvib',   match: /^susvib_([A-G]#?\d)_v1_1\.wav$/, octaveShift: 1, maxSec: 7, fade: 1.5 },
  basses:      { tier: 1, dir: 'Strings/Solo Contrabass/SusVib', match: /_SusVib_([A-G]#?\d)_v1_rr1\.wav$/, octaveShift: 1, maxSec: 7, fade: 1.5 },
  horns:       { tier: 2, dir: 'Brass/F Horn/sus',               match: /_sus_([A-G]#?\d)_v1_1\.wav$/, octaveShift: 1, maxSec: 6, fade: 1.2 },
  trombones:   { tier: 3, dir: 'Brass/Tenor Trombone/sus',       match: /_sus_([A-G]#?\d)_v2_1\.wav$/, octaveShift: 1, maxSec: 5, fade: 1 },
  flute:       { tier: 2, dir: 'Woodwinds/Flute/susvib',         match: /_susvib_([A-G]#?\d)_v1_1\.wav$/, octaveShift: 1, maxSec: 6, fade: 1.2 },
  clarinet:    { tier: 2, dir: 'Woodwinds/Clarinet/susLong',     match: /_susLong_([A-G]#?\d)_v1_rr1_sum\.wav$/, octaveShift: 1, maxSec: 6, fade: 1.2 },
  oboe:        { tier: 3, dir: 'Woodwinds/Oboe/Vib',             match: /_Vib_([A-G]#?\d)_v1_Main\.wav$/, octaveShift: 1, maxSec: 5, fade: 1 },
  harp:        { tier: 2, dir: 'Strings/Harp',                   match: /^KSHarp_([A-G]#?\d)_\w+\.wav$/, octaveShift: 0, maxSec: 5, fade: 1.5 },
  violinTrem:  { tier: 3, dir: 'Strings/Violin Section/Trem',    match: /_Trem_([A-G]#?\d)_v1\.wav$/, octaveShift: 1, maxSec: 5, fade: 1.2 },
  violinPizz:  { tier: 3, dir: 'Strings/Violin Section/Pizz',    match: /_Pizz_([A-G]#?\d)_v1_rr1\.wav$/, octaveShift: 1, maxSec: 2, fade: 0.5 },
  celloPizz:   { tier: 3, dir: 'Strings/Cello Section/pizzT',    match: /^pizzT_([A-G]#?\d)_v1_RR1\.wav$/, octaveShift: 1, maxSec: 2.5, fade: 0.6 },
  glock:       { tier: 2, dir: 'Percussion/Glock',               match: /^glock_medium_([A-G]#?\d)\.wav$/, octaveShift: 1, maxSec: 4, fade: 1.5 },
  marimba:     { tier: 3, dir: 'Percussion/Marimba',             match: /_([A-G]#?\d)_loud_01\.wav$/, octaveShift: 1, maxSec: 2.5, fade: 0.8 },
  piano:       { tier: 2, dir: 'Keys/Upright Piano',             match: /^Player_dyn1_rr1_(\d{3})\.wav$/, keyNumber: (n) => 21 + 2 * Number(n), maxSec: 5, fade: 1.5 },
  // Unpitched: name → file. Played by Tone.Player / Sampler at a nominal note.
  timpani:     { tier: 3, dir: 'Percussion/Timpani', unpitched: { hit1: 'Timpani1_Hit_v3_rr1_Sum.wav', hit3: 'Timpani3_Hit_v3_rr1_Sum.wav', hit5: 'Timpani5_Hit_v3_rr1_Sum.wav' }, maxSec: 5, fade: 1.5 },
  timpaniRoll: { tier: 3, dir: 'Percussion/Timpani/Rolls', unpitched: { roll1: 'Timpani1_Roll_v3_rr1_Sum.wav', roll4: 'Timpani4_Roll_v3_rr1_Sum.wav' }, maxSec: 8, fade: 2 },
  gong:        { tier: 3, dir: 'VSCO 1 Percussion/varMetal/Gong', unpitched: { soft: 'gong_hit_p.wav', mid: 'gong_hit_mf.wav', roll: 'gong_roll_long_f.wav', scrape: 'gong_scrape_1.wav' }, maxSec: 12, fade: 3 },
  metals:      { tier: 3, dir: 'Percussion', unpitched: { belltree: 'BellTree_Stroke1_v1_Sum.wav', triangle: 'Triangle6-HitM_v1_rr1_Sum.wav', bassdrum: 'BDrumNewhit_v3_rr1_Sum.wav', cymbalBow: 'susCymb1-bow-1.wav' }, maxSec: 8, fade: 2 },
};

const NOTE_INDEX = { C: 0, 'C#': 1, D: 2, 'D#': 3, E: 4, F: 5, 'F#': 6, G: 7, 'G#': 8, A: 9, 'A#': 10, B: 11 };
const NOTE_NAMES = Object.keys(NOTE_INDEX);

function noteToMidi(note) {
  const m = /^([A-G]#?)(-?\d)$/.exec(note);
  return 12 * (Number(m[2]) + 1) + NOTE_INDEX[m[1]];
}
function midiToNote(midi) {
  return `${NOTE_NAMES[midi % 12]}${Math.floor(midi / 12) - 1}`;
}

function ensureSource(arg) {
  if (arg) return arg;
  const cache = join(root, '.cache', 'vsco');
  if (!existsSync(cache)) {
    mkdirSync(dirname(cache), { recursive: true });
    execFileSync('git', ['clone', '--depth', '1', '--filter=blob:none', '--sparse',
      'https://github.com/sgossner/VSCO-2-CE', cache], { stdio: 'inherit' });
  }
  const dirs = [...new Set(Object.values(INSTRUMENTS).map((i) => i.dir))];
  execFileSync('git', ['-C', cache, 'sparse-checkout', 'set', '--no-cone', ...dirs.map((d) => `/${d}/*`), '/LICENSE*'], { stdio: 'inherit' });
  return cache;
}

function decodeMono(file, seconds = 1.0, offset = 0.3) {
  const raw = execFileSync('ffmpeg', ['-v', 'error', '-ss', String(offset), '-t', String(seconds), '-i', file,
    '-ac', '1', '-ar', '22050', '-f', 'f32le', '-'], { maxBuffer: 64 * 1024 * 1024 });
  return new Float32Array(raw.buffer, raw.byteOffset, raw.byteLength / 4);
}

/** Normalised autocorrelation pitch estimate (Hz) in [lo, hi]. */
function detectPitch(samples, sr = 22050, lo = 25, hi = 2500) {
  const minLag = Math.floor(sr / hi);
  const maxLag = Math.min(Math.floor(sr / lo), samples.length >> 1);
  let best = 0;
  let bestLag = 0;
  const corr = new Float32Array(maxLag + 1);
  for (let lag = minLag; lag <= maxLag; lag++) {
    let num = 0, e1 = 0, e2 = 0;
    for (let i = 0; i + lag < samples.length; i++) {
      num += samples[i] * samples[i + lag];
      e1 += samples[i] * samples[i];
      e2 += samples[i + lag] * samples[i + lag];
    }
    corr[lag] = num / (Math.sqrt(e1 * e2) || 1);
  }
  // Prefer the shortest lag within 90% of the global max (avoids octave-down errors)
  for (let lag = minLag; lag <= maxLag; lag++) if (corr[lag] > best) best = corr[lag];
  for (let lag = minLag + 1; lag < maxLag; lag++) {
    if (corr[lag] >= best * 0.9 && corr[lag] >= corr[lag - 1] && corr[lag] >= corr[lag + 1]) { bestLag = lag; break; }
  }
  return bestLag ? sr / bestLag : null;
}

function peakDb(file) {
  const out = spawnSync('ffmpeg', ['-v', 'info', '-i', file, '-af', 'volumedetect', '-f', 'null', '-'],
    { encoding: 'utf8' }).stderr;
  const m = /max_volume:\s*(-?[\d.]+) dB/.exec(out);
  return m ? Number(m[1]) : 0;
}

function encode(src, dest, { maxSec, fade }, targetPeak = -1.5) {
  const gain = targetPeak - peakDb(src);
  const filters = [
    'silenceremove=start_periods=1:start_threshold=-55dB:start_silence=0.01',
    `atrim=0:${maxSec}`,
    `afade=t=out:st=${Math.max(0, maxSec - fade)}:d=${fade}`,
    `volume=${gain.toFixed(2)}dB`,
  ].join(',');
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', src, '-ac', '1', '-ar', '44100', '-af', filters,
    '-c:a', 'aac', '-b:a', BITRATE, '-movflags', '+faststart', dest]);
}

function build(source) {
  rmSync(outDir, { recursive: true, force: true });
  mkdirSync(outDir, { recursive: true });
  const manifest = {};
  const warnings = [];

  for (const [name, cfg] of Object.entries(INSTRUMENTS)) {
    const srcDir = join(source, cfg.dir);
    const dest = join(outDir, name);
    mkdirSync(dest, { recursive: true });
    const entry = { tier: cfg.tier, notes: {} };

    if (cfg.unpitched) {
      entry.unpitched = true;
      for (const [key, file] of Object.entries(cfg.unpitched)) {
        encode(join(srcDir, file), join(dest, `${key}.m4a`), cfg);
        entry.notes[key] = `${key}.m4a`;
      }
    } else {
      for (const file of readdirSync(srcDir).sort()) {
        const m = cfg.match.exec(file);
        if (!m) continue;
        const midi = cfg.keyNumber ? cfg.keyNumber(m[1]) : noteToMidi(m[1]) + 12 * cfg.octaveShift;
        const note = midiToNote(midi);
        if (entry.notes[note]) continue;
        const hz = detectPitch(decodeMono(join(srcDir, file)));
        if (hz) {
          const detected = 69 + 12 * Math.log2(hz / 440);
          const diff = Math.abs(detected - midi);
          const octaveFold = Math.abs(diff - 12 * Math.round(diff / 12));
          if (diff > 1 && octaveFold <= 1) warnings.push(`${name}/${file}: named ${note}, detected ${midiToNote(Math.round(detected))} (octave ambiguity)`);
          else if (octaveFold > 1) warnings.push(`${name}/${file}: named ${note}, detected ${hz.toFixed(1)} Hz`);
        }
        encode(join(srcDir, file), join(dest, `${note.replace('#', 's')}.m4a`), cfg);
        entry.notes[note] = `${note.replace('#', 's')}.m4a`;
      }
    }
    manifest[name] = entry;
    console.log(`${name.padEnd(12)} ${Object.keys(entry.notes).length} samples`);
  }

  writeFileSync(join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  writeFileSync(join(outDir, 'LICENSE.txt'),
    'Samples derived from VSCO 2: Community Edition by Versilian Studios (https://github.com/sgossner/VSCO-2-CE).\n' +
    'Released under CC0 1.0 Universal — public domain dedication. Trimmed, normalised and transcoded for this project.\n');

  let bytes = 0;
  const walk = (d) => readdirSync(d).forEach((f) => { const p = join(d, f); statSync(p).isDirectory() ? walk(p) : (bytes += statSync(p).size); });
  walk(outDir);
  console.log(`\nTotal: ${(bytes / 1e6).toFixed(1)} MB`);
  if (warnings.length) console.log(`\nPitch check warnings (${warnings.length}):\n  ${warnings.join('\n  ')}`);
}

build(ensureSource(process.argv[2]));
