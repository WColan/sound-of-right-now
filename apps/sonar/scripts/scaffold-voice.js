#!/usr/bin/env node
/**
 * Scaffold a new voice file with the correct interface contract.
 *
 * Usage:
 *   node scripts/scaffold-voice.js <name>
 *
 * Example:
 *   node scripts/scaffold-voice.js banjo
 *
 * Creates:
 *   src/music/voices/banjo.js  — voice implementation stub
 *
 * After running, complete these manual steps (see CLAUDE.md):
 *   1. Implement the voice in src/music/voices/<name>.js
 *   2. Instantiate and wire into src/music/engine.js
 *   3. Add output params to src/music/mapper.js
 *   4. Classify new params in src/music/interpolator.js
 *   5. Update README.md voices table
 */

import { writeFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, '..');

const name = process.argv[2];

if (!name) {
  console.error('Usage: node scripts/scaffold-voice.js <name>');
  console.error('Example: node scripts/scaffold-voice.js banjo');
  process.exit(1);
}

if (!/^[a-z][a-z0-9-]*$/.test(name)) {
  console.error('Voice name must be lowercase letters, numbers, and hyphens only.');
  process.exit(1);
}

// Strip trailing "-voice" if user accidentally included it (e.g. "banjo-voice" → "banjo")
const cleanName = name.replace(/-?voice$/, '') || name;

const pascal = cleanName.charAt(0).toUpperCase() + cleanName.slice(1).replace(/-([a-z])/g, (_, c) => c.toUpperCase());
const camel = cleanName.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
const outPath = join(projectRoot, 'src', 'music', 'voices', `${cleanName}.js`);

if (existsSync(outPath)) {
  console.error(`File already exists: src/music/voices/${name}.js`);
  process.exit(1);
}

const voiceSource = `import * as Tone from 'tone';

/**
 * ${pascal} voice — [describe the sound and role here].
 *
 * [Explain the synthesis approach, any unique design choices, and what
 * weather/musical parameters drive this voice's behavior.]
 */
export function create${pascal}Voice() {
  // ── Audio nodes ──────────────────────────────────────────────────────────
  const filter = new Tone.Filter({
    frequency: 4000,
    type: 'lowpass',
    rolloff: -12,
  });

  const synth = new Tone.PolySynth(Tone.Synth, {
    maxPolyphony: 4,
    options: {
      oscillator: { type: 'sine' },
      envelope: {
        attack: 0.5,
        decay: 0.3,
        sustain: 0.7,
        release: 2,
      },
    },
  });

  synth.connect(filter);

  // output is the node that engine.js connects to the audio graph
  const output = filter;

  // ── Internal state ────────────────────────────────────────────────────────
  let currentNotes = [];
  let isPaused = false;

  // ── Public interface ──────────────────────────────────────────────────────

  /**
   * Play a single note.
   * @param {string} note   - e.g. 'C4'
   * @param {string} duration - Tone.js duration string, e.g. '8n', '1m'
   * @param {number} velocity - 0–1
   */
  function play(note, duration = '8n', velocity = 0.7) {
    if (isPaused) return;
    synth.triggerAttackRelease(note, duration, Tone.now(), velocity);
  }

  /**
   * Play a chord (multiple simultaneous notes).
   * @param {string[]} notes
   * @param {string}   duration
   */
  function playChord(notes, duration = '1m') {
    if (isPaused || notes.length === 0) return;
    currentNotes = notes;
    synth.releaseAll();
    synth.triggerAttack(notes, Tone.now(), 0.5);
  }

  /** Stop all sound immediately. */
  function stop() {
    synth.releaseAll();
    currentNotes = [];
  }

  /** Pause — silence but preserve state for resume. */
  function pause() {
    isPaused = true;
    synth.releaseAll();
  }

  /** Resume from paused state. */
  function resume() {
    isPaused = false;
    if (currentNotes.length > 0) {
      synth.triggerAttack(currentNotes, Tone.now(), 0.5);
    }
  }

  /** Tear down all Tone.js nodes. Call when removing the voice. */
  function dispose() {
    stop();
    synth.dispose();
    filter.dispose();
  }

  // ── Parameter setters (called by engine.js updateParams) ──────────────────

  /** Set volume in dB. */
  function setVolume(db, rampTime = 5) {
    synth.volume.rampTo(db, rampTime);
  }

  /** Set filter cutoff frequency (brightness). */
  function setFilterCutoff(freq, rampTime = 10) {
    filter.frequency.linearRampTo(freq, rampTime);
  }

  // ── Return the voice interface ────────────────────────────────────────────
  return {
    output,       // Connect this node into the engine audio graph

    play,
    playChord,
    stop,
    pause,
    resume,
    dispose,

    setVolume,
    setFilterCutoff,

    // Expose internal nodes if engine.js needs direct access
    synth,
    filter,
  };
}
`;

writeFileSync(outPath, voiceSource);
console.log(`Created: src/music/voices/${name}.js`);
console.log('');
console.log('Next steps (see CLAUDE.md for full checklist):');
console.log(`  1. Implement the voice logic in src/music/voices/${name}.js`);
console.log(`  2. Add to engine.js:  const ${camel} = create${pascal}Voice();`);
console.log(`  3. Wire into engine.js audio graph (connect to effects/master bus)`);
console.log(`  4. Add ${camel}Volume + params to mapper.js`);
console.log(`  5. Classify new params in interpolator.js (CONTINUOUS or DISCRETE)`);
console.log(`  6. Update README.md voices table`);
