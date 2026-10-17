/**
 * Pulse — a town has a heartbeat. Muted pizzicato (and marimba in a busy
 * city) ticks along with the tempo, dense at rush hour, nearly still at 4 am.
 *
 * Bells — towns ring the hour. Westminster quarters (in the current key)
 * where there are enough people to have a clock tower, a single distant bell
 * where there aren't, and a festive peal on public holidays.
 *
 * Earth — the ground speaks in drums. Quakes arrive as timpani, gong and a
 * felt sub thump, delayed by the distance the seismic waves travel; regional
 * restlessness adds the occasional soft low drum.
 */
import { createSectionBase, createVoice, createHits, createStochastic, pitchesInRange, midiToNote, noteToMidi, pick } from '../toolkit.js';
import { clamp } from '../../../now/util.js';

export function createPulseSection(ctx) {
  const { Tone } = ctx;
  const rng = ctx.rng ?? Math.random;
  const base = createSectionBase(ctx, 'pulse', { trimDb: -12 });
  const mute = new Tone.Filter({ frequency: 2400, type: 'lowpass' });
  mute.connect(base.output);
  const pizz = createVoice(ctx, {
    sample: 'violinPizz', volume: -6,
    fallback: () => new Tone.PolySynth(Tone.Synth, { oscillator: { type: 'triangle' }, envelope: { attack: 0.002, decay: 0.25, sustain: 0, release: 0.1 } }),
    fallbackVolume: -18,
  });
  const marimba = createVoice(ctx, { sample: 'marimba', volume: -10 });
  pizz.output.connect(mute);
  marimba.output.connect(mute);

  let params = { activity: 0, density: 0, on: false };
  let chordTones = [];
  let step = 0;

  const loop = new Tone.Loop((time) => {
    step = (step + 1) % 8;
    if (!base.audible || !chordTones.length) return;
    const accent = step % 4 === 0 ? 1.6 : step % 2 === 0 ? 1 : 0.6;
    const p = params.activity * 0.5 * accent * (0.6 + ctx.expr.energy * 0.8) * (1 - ctx.expr.stillness * 0.9);
    if (rng() > p) return;
    const n = pick(pitchesInRange(chordTones, 60, 76), rng);
    if (n == null) return;
    const useMarimba = params.density > 0.6 && rng() < 0.35;
    (useMarimba ? marimba : pizz).play(midiToNote(n), 0.4, time, ctx.vel(0.2 + accent * 0.12));
  }, '8n');

  return {
    id: 'pulse',
    output: base.output,
    base,
    update(next, stage, ramp = 8) {
      params = { ...params, ...next };
      base.set({ on: next.on, level: next.level, roleDb: stage?.gainDb ?? 0 }, ramp);
    },
    onChord(chord) { chordTones = chord.chordTones ?? chord.notes; },
    start() { loop.start(0); },
    stop() { loop.stop(); },
    pause() { this.stop(); },
    resume() { this.start(); },
    play(n, d = 0.4, v = 0.5) { pizz.play(n, d, Tone.now(), v); },
    playChord(notes, d = 0.4) { pizz.play(notes, d, Tone.now(), 0.4); },
    dispose() {
      this.stop();
      loop.dispose();
      pizz.dispose();
      marimba.dispose();
      mute.dispose();
      base.dispose();
    },
  };
}

// Westminster Quarters as scale degrees (1-based; 5 = the low fifth below)
const CHANGES = [[3, 2, 1, -5], [1, 3, 2, -5], [1, 2, 3, 1], [3, 1, 2, -5], [-5, 2, 3, 1]];
const QUARTER_PHRASES = { 15: [0], 30: [1, 2], 45: [3, 4, 0], 0: [1, 2, 3, 4] };

/** Which strike is due at this local time (or null). Pure. */
export function dueStrike(hour, lastKey) {
  const h = Math.floor(hour);
  const minute = Math.floor((hour - h) * 60);
  const quarter = [0, 15, 30, 45].find((q) => minute >= q && minute < q + 1);
  if (quarter == null) return null;
  const key = `${h}:${quarter}`;
  if (key === lastKey) return null;
  return { key, quarter, hourCount: (h % 12) || 12 };
}

export function createBellsSection(ctx) {
  const { Tone } = ctx;
  const base = createSectionBase(ctx, 'bells', { trimDb: -8 });
  const distance = new Tone.Filter({ frequency: 3000, type: 'lowpass' });
  distance.connect(base.output);
  const bell = new Tone.PolySynth(Tone.FMSynth, {
    harmonicity: 3.01,
    modulationIndex: 9,
    oscillator: { type: 'sine' },
    envelope: { attack: 0.002, decay: 5, sustain: 0, release: 4 },
    modulationEnvelope: { attack: 0.002, decay: 1.2, sustain: 0.1, release: 2 },
    volume: -12,
  });
  bell.connect(distance);
  const body = createVoice(ctx, { sample: 'piano', volume: -16 });
  body.output.connect(distance);

  let params = { quarters: true, peal: false, on: true };
  let root = 'C';
  let scaleTones = [];
  let lastKey = null;
  let primed = false;

  function degreeNote(d) {
    const rootMidi = noteToMidi(`${root}4`);
    const octave = pitchesInRange(scaleTones.length ? scaleTones : [`${root}4`], rootMidi, rootMidi + 11);
    if (d < 0) return (octave[4] ?? rootMidi + 7) - 12;
    return octave[d - 1] ?? rootMidi;
  }

  function ring(note, time, velocity) {
    bell.triggerAttackRelease(midiToNote(note), 4, time, ctx.vel(velocity));
    body.play(midiToNote(note - 12), 3, time, ctx.vel(velocity * 0.6));
  }

  /** Play a strike; returns its duration in seconds. */
  function strike({ quarter, hourCount }, time = Tone.now() + 0.1) {
    let t = time;
    if (params.quarters) {
      for (const phrase of QUARTER_PHRASES[quarter]) {
        CHANGES[phrase].forEach((d, i) => ring(degreeNote(d), t + i * 0.75, 0.5));
        t += 4 * 0.75 + 0.9;
      }
    }
    if (quarter === 0) {
      const tenor = degreeNote(1) - 12;
      for (let i = 0; i < hourCount; i++) ring(tenor, t + i * 2.2, 0.62);
      t += hourCount * 2.2;
      if (params.peal) {
        // Rounds: every bell from treble down to tenor, four times
        const rounds = [8, 7, 6, 5, 4, 3, 2, 1].map((d) => degreeNote(((d - 1) % 7) + 1) + (d === 8 ? 12 : 0));
        for (let r = 0; r < 4; r++) rounds.forEach((n, i) => ring(n, t + 1 + r * 3 + i * 0.36, 0.42));
        t += 14;
      }
    }
    return t - time + 4;
  }

  return {
    id: 'bells',
    output: base.output,
    base,
    update(next, stage, ramp = 8) {
      params = { ...params, ...next };
      base.set({ on: next.on, level: next.level, roleDb: stage?.gainDb ?? 0 }, ramp);
      distance.frequency.rampTo?.(params.quarters ? 4200 : 1800, ramp); // a lone village bell is far off
    },
    setHarmony({ root: r }) { root = r; },
    onChord(chord) { scaleTones = chord.scaleTones ?? chord.notes; },
    /** Called every few seconds with the location-local hour. Returns a strike duration when ringing. */
    tick(localHour) {
      const due = dueStrike(localHour, lastKey);
      if (!due) return 0;
      lastKey = due.key;
      // Don't ring the moment someone arrives mid-minute — only on a fresh boundary
      if (!primed) { primed = true; return 0; }
      if (!base.audible) return 0;
      return strike(due);
    },
    prime(localHour) {
      const due = dueStrike(localHour, null);
      lastKey = due?.key ?? null;
      primed = true;
    },
    start() {},
    stop() { bell.releaseAll?.(); },
    pause() { this.stop(); },
    resume() {},
    motif(time = Tone.now()) { CHANGES[0].forEach((d, i) => ring(degreeNote(d), time + i * 0.75, 0.45)); },
    play(n, d = 3, v = 0.5) { bell.triggerAttackRelease(n, d, undefined, v); },
    playChord(notes, d = 3) { bell.triggerAttackRelease(notes, d); },
    dispose() {
      this.stop();
      bell.dispose();
      body.dispose();
      distance.dispose();
      base.dispose();
    },
  };
}

/** Seconds for the "sound" of a quake to reach the listener (compressed P-wave travel). */
export function quakeDelaySeconds(distanceKm) {
  return clamp(2 + distanceKm / 300, 2, 25);
}

export function createEarthSection(ctx) {
  const { Tone } = ctx;
  const rng = ctx.rng ?? Math.random;
  const base = createSectionBase(ctx, 'earth', { trimDb: -4 });
  const rolls = createHits(ctx, { sample: 'timpaniRoll', volume: -2 });
  const timpani = createHits(ctx, { sample: 'timpani', volume: -4 });
  const gong = createHits(ctx, { sample: 'gong', volume: -4 });
  const thump = new Tone.MembraneSynth({ pitchDecay: 0.4, octaves: 2, envelope: { attack: 0.01, decay: 3, sustain: 0, release: 2 }, volume: -6 });
  [rolls, timpani, gong].forEach((v) => v.output.connect(base.output));
  thump.connect(base.output);
  let restless = 0;

  const murmurs = createStochastic(ctx, {
    rate: () => restless / 120,
    fire: (time) => {
      if (!base.audible) return;
      timpani.hit(rng() < 0.5 ? 'hit5' : 'hit3', { time, velocity: 0.15 + restless * 0.25, pitch: 'G3' });
    },
    minGap: 30,
  });

  return {
    id: 'earth',
    output: base.output,
    base,
    update(next, stage, ramp = 8) {
      restless = next.restless ?? 0;
      // Quakes must be audible even when the bed is quiet: floor the level.
      base.set({ on: true, level: Math.max(0.6, next.level ?? 0), roleDb: stage?.gainDb ?? 0 }, ramp);
    },
    /** A quake happened. Returns seconds until it "arrives". */
    quake(q) {
      const delay = quakeDelaySeconds(q.distanceKm);
      const transport = Tone.getTransport();
      const i = clamp(q.intensity ?? 0.5, 0.15, 1);
      transport.scheduleOnce((time) => {
        // Bigger quakes are lower: re-pitch the drums and gong down
        const pitch = midiToNote(Math.round(60 - (q.mag - 2.5) * 3));
        thump.triggerAttackRelease('C1', 2.5, time, i);
        rolls.hit('roll1', { time, velocity: 0.3 + i * 0.6, pitch, duration: 8 });
        if (q.mag >= 4.5) gong.hit('roll', { time: time + 0.3, velocity: 0.3 + i * 0.5, pitch, duration: 12 });
        else gong.hit('soft', { time: time + 0.2, velocity: 0.25 + i * 0.4, pitch });
        ctx.emit({ type: 'quake-arrival', quake: q, intensity: i });
      }, transport.seconds + delay);
      return delay;
    },
    onChord() {},
    start() { murmurs.start(); },
    stop() { murmurs.stop(); },
    pause() { this.stop(); },
    resume() { this.start(); },
    motif(time = Tone.now()) { timpani.hit('hit3', { time, velocity: 0.4 }); },
    play(n, d = 2, v = 0.6) { thump.triggerAttackRelease(n, d, undefined, v); },
    playChord(notes, d = 2) { thump.triggerAttackRelease(notes[0], d); },
    dispose() {
      this.stop();
      [rolls, timpani, gong].forEach((v) => v.dispose());
      thump.dispose();
      base.dispose();
    },
  };
}
