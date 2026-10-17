#!/usr/bin/env node
/**
 * Scaffold a new orchestra section with the section/voice contract.
 *
 * Usage:
 *   node scripts/scaffold-section.js <name>
 *
 * Creates src/music/orchestra/sections/<name>.js. Then (see CLAUDE.md):
 *   1. Pick the data source and write the mapping in src/music/score.js —
 *      including a legend `why()` line a listener would nod at
 *   2. Add the id to a registral zone in ZONES (score.js)
 *   3. Register the factory in FACTORIES (src/music/orchestra/engine.js)
 *   4. Add a label in SECTION_LABELS (src/ui/now-panels.js)
 *   5. Tests in score.test.js + orchestra.test.js; README sections table
 */
import { writeFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const name = process.argv[2];
if (!name || !/^[a-z][a-zA-Z0-9]*$/.test(name)) {
  console.error('Usage: node scripts/scaffold-section.js <camelCaseName>');
  process.exit(1);
}
const pascal = name[0].toUpperCase() + name.slice(1);
const out = join(root, 'src', 'music', 'orchestra', 'sections', `${name}.js`);
if (existsSync(out)) {
  console.error(`Already exists: ${out}`);
  process.exit(1);
}

writeFileSync(out, `/**
 * ${pascal} — [what in the moment this stands for, and why it sounds like this].
 */
import { createSectionBase, createVoice, createStochastic, pitchesInRange, midiToNote, pick } from '../toolkit.js';

export function create${pascal}Section(ctx) {
  const { Tone } = ctx;
  const rng = ctx.rng ?? Math.random;
  const base = createSectionBase(ctx, '${name}', { trimDb: -8 });
  const voice = createVoice(ctx, {
    fallback: () => new Tone.PolySynth(Tone.Synth, { envelope: { attack: 0.3, decay: 0.4, sustain: 0.5, release: 1.5 } }),
    fallbackVolume: -18,
  });
  voice.output.connect(base.output);

  let params = { on: false, rate: 0 };
  let chordTones = [];

  const events = createStochastic(ctx, {
    rate: () => (params.on ? params.rate ?? 0.1 : 0),
    fire: (time) => {
      if (!base.audible) return;
      const n = pick(pitchesInRange(chordTones, 60, 84), rng);
      if (n) voice.play(midiToNote(n), 1.5, time, ctx.vel(0.4));
    },
  });

  return {
    id: '${name}',
    output: base.output,
    base,
    update(next, stage, ramp = 8) {
      params = { ...params, ...next };
      base.set({ on: next.on, level: next.level, roleDb: stage?.gainDb ?? 0 }, ramp);
    },
    onChord(chord) { chordTones = chord.chordTones ?? chord.notes; },
    start() { events.start(); },
    stop() { events.stop(); voice.releaseAll(); },
    pause() { this.stop(); },
    resume() { this.start(); },
    play(n, d = 1, v = 0.5) { voice.play(n, d, Tone.now(), v); },
    playChord(notes, d = 2) { voice.play(notes, d, Tone.now(), 0.4); },
    dispose() {
      this.stop();
      voice.dispose();
      base.dispose();
    },
  };
}
`);
console.log(`Created ${out}`);
