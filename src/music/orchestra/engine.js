/**
 * The Orchestra — owns the Tone.js graph for v2.
 *
 *   sections ─▶ zone buses (sub/low/mid/upper/high, each EQ-carved)
 *            ─▶ dry ─────────────────────────────┐
 *            ─▶ hall send ─▶ reverb ─▶ echo ──────┤
 *                                                 ▼
 *                       master filter (light/haze) ─▶ expression ─▶ master gain
 *                       (weather × user × sleep) ─▶ limiter ─▶ analysers ─▶ out
 *
 * Harmony (key, mode, tempo, chord progression) is shared: every section
 * hears every chord change. The score decides who plays and how loud; the
 * stage decides who is featured.
 */
import * as RealTone from 'tone';
import { generateProgression, createProgressionPlayer, shouldImmediatelyChange } from '../progression.js';
import { createTextureVoice } from '../voices/texture.js';
import { createSampleLibrary } from './samples.js';
import { rampParam, dbToGain } from './toolkit.js';
import { createStringsSection, createBassesSection } from './sections/strings.js';
import { createOceanSection, createRiverSection } from './sections/sea.js';
import { createWindsSection } from './sections/winds.js';
import { createHornsSection } from './sections/horns.js';
import { createRainSection, createStormSection, createAirSection } from './sections/weather.js';
import { createMoonSection, createSpheresSection, createAuroraSection, createMeteorsSection, createIssSection } from './sections/sky.js';
import { createLifeSection } from './sections/life.js';
import { createPulseSection, createBellsSection, createEarthSection } from './sections/town.js';
import { ZONES, ZONE_OF, SECTION_IDS } from '../score.js';
import { lerp } from '../../now/util.js';

const FACTORIES = {
  strings: createStringsSection,
  basses: createBassesSection,
  ocean: createOceanSection,
  river: createRiverSection,
  winds: createWindsSection,
  horns: createHornsSection,
  rain: createRainSection,
  storm: createStormSection,
  air: createAirSection,
  moon: createMoonSection,
  spheres: createSpheresSection,
  aurora: createAuroraSection,
  meteors: createMeteorsSection,
  iss: createIssSection,
  life: createLifeSection,
  pulse: createPulseSection,
  bells: createBellsSection,
  earth: createEarthSection,
};

// Zone carving: [type, frequency] filters and how much each zone feeds the hall
const ZONE_EQ = {
  sub: { filter: ['lowpass', 260], send: 0.08 },
  low: { filter: ['highpass', 35], send: 0.4 },
  mid: { filter: ['highpass', 110], send: 0.65 },
  upper: { filter: ['highpass', 180], send: 0.75 },
  high: { filter: ['highpass', 900], send: 0.95 },
};

// During the conductor's stillness phase these sections fall back least
const BED_SECTIONS = new Set(['strings', 'basses', 'ocean', 'spheres']);

/**
 * Arrival order: strings first (fading up from nothing), then the featured
 * sections of this moment, then everything else that's on, by salience.
 * Returns [{ id, at (s), fade (s) }].
 */
export function entrancePlan(score, stage) {
  const on = SECTION_IDS.filter((id) => score.sections[id]?.on);
  const featured = (stage?.foreground ?? []).filter((id) => on.includes(id) && id !== 'strings');
  const rest = on
    .filter((id) => id !== 'strings' && !featured.includes(id))
    .sort((a, b) => score.sections[b].salience - score.sections[a].salience);
  const plan = [{ id: 'strings', at: 0.2, fade: 9 }];
  featured.forEach((id, i) => plan.push({ id, at: 2.5 + i * 4.5, fade: 5 }));
  const t0 = 2.5 + featured.length * 4.5 + 2;
  rest.forEach((id, i) => plan.push({ id, at: t0 + i * 3, fade: 7 }));
  // Silent sections still need their gate opened for when they turn on later
  SECTION_IDS.filter((id) => !on.includes(id)).forEach((id) => plan.push({ id, at: t0, fade: 1 }));
  return plan;
}

export function createOrchestra({ Tone = RealTone, library, rng = Math.random, loadSamples = true } = {}) {
  const listeners = new Set();
  const expr = { swell: 0, tension: 0, energy: 0.3, urgency: 0.3, effect: 0.3, stillness: 0 };
  const ctx = {
    Tone,
    rng,
    expr,
    lib: library ?? createSampleLibrary(Tone),
    emit: (event) => listeners.forEach((fn) => fn(event)),
    /** Conductor-shaped velocity */
    vel: (v) => Math.max(0.02, Math.min(1, v * (0.85 + expr.swell * 0.3) * (1 - expr.stillness * 0.35))),
  };

  // ── Master chain ──
  const masterFilter = new Tone.Filter({ frequency: 9000, type: 'lowpass', rolloff: -12 });
  const expression = new Tone.Gain(1);
  const masterGain = new Tone.Gain(1);
  const limiter = new Tone.Limiter(-2);
  const analyser = new Tone.Analyser('fft', 256);
  const waveformAnalyser = new Tone.Analyser('waveform', 256);
  masterFilter.connect(expression);
  expression.connect(masterGain);
  masterGain.connect(limiter);
  limiter.connect(analyser);
  limiter.connect(waveformAnalyser);
  limiter.toDestination();

  let weatherGain = 1;
  let userGain = 1;
  let sleepGain = 1;
  function applyMasterGain(ramp = 0) {
    rampParam(masterGain.gain, weatherGain * userGain * sleepGain, ramp);
  }

  // ── Hall ──
  const hallSend = new Tone.Gain(1);
  const reverb = new Tone.Reverb({ decay: 4, preDelay: 0.03, wet: 1 });
  const echo = new Tone.FeedbackDelay({ delayTime: 0.45, feedback: 0.3, wet: 0 });
  const hallReturn = new Tone.Gain(0.85);
  hallSend.connect(reverb);
  reverb.connect(echo);
  echo.connect(hallReturn);
  hallReturn.connect(masterFilter);
  let currentDecay = 4;

  // ── Zones ──
  const dryBus = new Tone.Gain(1);
  dryBus.connect(masterFilter);
  const zones = Object.fromEntries(Object.keys(ZONES).map((zone) => {
    const [type, frequency] = ZONE_EQ[zone].filter;
    const input = new Tone.Gain(1);
    const eq = new Tone.Filter({ frequency, type, rolloff: -12 });
    const send = new Tone.Gain(ZONE_EQ[zone].send * 0.5);
    input.connect(eq);
    eq.connect(dryBus);
    eq.connect(send);
    send.connect(hallSend);
    return [zone, { input, eq, send }];
  }));

  // ── Shared atmosphere (rain hiss + drops, particulate grain) ──
  const atmosphere = createTextureVoice();
  ctx.atmosphere = atmosphere;
  atmosphere.setVolume(-60, 0);
  atmosphere.output.connect(zones.mid.input);
  atmosphere.rainOutput.connect(zones.high.input);

  // ── Sections ──
  const sections = Object.fromEntries(SECTION_IDS.map((id) => {
    const section = FACTORIES[id](ctx);
    section.output.connect(zones[ZONE_OF[id]].input);
    return [id, section];
  }));

  // ── Harmony ──
  const harmony = { root: null, mode: null, category: 'clear', pressureNorm: 0.5, bpm: 64 };
  let tension = 0;
  let currentProgression = null;
  let chordListener = null;
  let started = false;

  const progressionPlayer = createProgressionPlayer({
    onChordChange(chord, index, total) {
      const first = index === 0;
      for (const s of Object.values(sections)) {
        try { s.onChord(chord, { first }); } catch (err) { console.warn('[orchestra] onChord', err); }
      }
      chordListener?.({
        rootName: chord.chordRootName,
        quality: chord.quality,
        degree: chord.degree,
        index,
        total,
        allQualities: currentProgression ? currentProgression.chords.map((c) => c.quality) : [],
        notes: chord.notes,
        scaleTones: chord.scaleTones,
        chordTones: chord.chordTones,
        isSecondaryDominant: chord.isSecondaryDominant ?? false,
        nextChord: progressionPlayer.nextChord,
      });
    },
    onCycleEnd() {
      currentProgression = generateProgression(harmony.root, harmony.mode, harmony.category, harmony.pressureNorm, tension);
      return currentProgression;
    },
  });

  function applyHarmony(h) {
    const keyChanged = h.root !== harmony.root || h.mode !== harmony.mode;
    const categoryChanged = h.category !== harmony.category;
    const immediate = !currentProgression || shouldImmediatelyChange(harmony.category, h.category);
    Object.assign(harmony, h);
    if (keyChanged) {
      for (const s of Object.values(sections)) s.setHarmony?.({ root: h.root, mode: h.mode });
    }
    if (keyChanged || categoryChanged || !currentProgression) {
      currentProgression = generateProgression(h.root, h.mode, h.category, h.pressureNorm, tension);
      progressionPlayer.setProgression(currentProgression, immediate);
    }
    const transport = Tone.getTransport();
    if (Math.abs((transport.bpm.value ?? 0) - h.bpm) > 0.5) rampParam(transport.bpm, h.bpm, started ? 40 : 0);
  }

  function applyHall(hall, ramp) {
    if (Math.abs(hall.decay - currentDecay) > 0.6) {
      currentDecay = hall.decay;
      try { reverb.decay = hall.decay; } catch { /* regenerating IR */ }
    }
    const effectBoost = 1 + expr.effect * 0.3;
    const still = 1 - expr.stillness * 0.4;
    for (const [zone, z] of Object.entries(zones)) {
      rampParam(z.send.gain, ZONE_EQ[zone].send * hall.wet * 2 * effectBoost * still * (1 + hall.distance * 0.6), ramp);
    }
    rampParam(dryBus.gain, 1 - hall.distance * 0.45, ramp);
    if (hall.echo) {
      rampParam(echo.delayTime, hall.echo.time, 1);
      rampParam(echo.feedback, hall.echo.feedback, ramp);
      rampParam(echo.wet, hall.early > 0.3 ? 0.18 : 0.32, ramp);
    } else {
      rampParam(echo.wet, 0, ramp);
    }
  }

  let lastScore = null;
  let lastStage = null;

  function applySections(score, stage, ramp) {
    for (const id of SECTION_IDS) {
      const params = score.sections[id];
      const s = sections[id];
      const roleDb = stage?.gainDb?.[id];
      try {
        s.update(params, { role: stage?.roles?.[id] ?? 'bed', gainDb: Number.isFinite(roleDb) ? roleDb : 0 }, ramp);
      } catch (err) {
        console.warn(`[orchestra] update ${id}`, err);
      }
      const stillDb = -expr.stillness * (BED_SECTIONS.has(id) ? 5 : 11);
      s.base.setExtraDb(stillDb, ramp);
    }
  }

  return {
    sections,
    analyser,
    waveformAnalyser,
    progressionPlayer,
    library: ctx.lib,
    effects: { reverb, echo, masterFilter, masterGain, limiter, zones, hallSend },
    ctx,

    /**
     * Start with a first score. With `entrance`, the place introduces itself:
     * the strings fade up from silence, then sections enter one by one, the
     * most characteristic of this moment first (see entranceOrder).
     */
    start(score, stage, { entrance = true } = {}) {
      started = false;
      if (entrance) {
        const plan = entrancePlan(score, stage);
        for (const id of SECTION_IDS) sections[id].base.setEntryDb(-60, 0);
        const transport = Tone.getTransport();
        for (const { id, at, fade } of plan) {
          transport.scheduleOnce(() => sections[id]?.base.setEntryDb(0, fade), transport.seconds + at);
        }
      }
      applyHarmony(score.harmony);
      this.update(score, stage, 0.5);
      atmosphere.start();
      Object.values(sections).forEach((s) => s.start());
      Tone.getTransport().start();
      started = true;
      if (loadSamples) ctx.lib.load?.();
    },

    /** Apply a new score (from fresh data) and stage arrangement. */
    update(score, stage, ramp = 8) {
      lastScore = score;
      lastStage = stage;
      applyHarmony(score.harmony);
      applyHall(score.hall, ramp);
      rampParam(masterFilter.frequency, score.master.cutoff, ramp * 2);
      weatherGain = lerp(0.72, 1, score.master.light ?? 0.5);
      applyMasterGain(ramp);
      applySections(score, stage, ramp);
    },

    /** Conductor expression: { dynamicSwell, harmonicTension, rhythmicEnergy, melodicUrgency, effectDepth } + stillness 0–1 */
    setExpression(e, stillness = 0, ramp = 5) {
      expr.swell = e.dynamicSwell ?? expr.swell;
      expr.tension = e.harmonicTension ?? expr.tension;
      expr.energy = e.rhythmicEnergy ?? expr.energy;
      expr.urgency = e.melodicUrgency ?? expr.urgency;
      expr.effect = e.effectDepth ?? expr.effect;
      expr.stillness = stillness;
      tension = Math.max(0, expr.tension * (1 - stillness * 0.85));
      rampParam(expression.gain, dbToGain(expr.swell * 3 - stillness * 4), ramp);
      if (lastScore) {
        applyHall(lastScore.hall, ramp);
        for (const id of SECTION_IDS) sections[id].base.setExtraDb(-stillness * (BED_SECTIONS.has(id) ? 5 : 11), ramp);
      }
    },

    /** Location-local clock tick → bells. Returns strike duration (s) if ringing. */
    tickClock(localHour) {
      return sections.bells.tick(localHour);
    },
    primeClock(localHour) {
      sections.bells.prime(localHour);
    },

    /** An earthquake event from the feed. Returns seconds until it arrives. */
    triggerQuake(quake) {
      return sections.earth.quake(quake);
    },

    triggerThunder() {
      sections.storm.triggerThunder();
    },

    /** Replay the motifs of the sections that mattered this movement. */
    playRecap(ids) {
      const now = Tone.now() + 0.5;
      ids.filter((id) => sections[id]?.motif).slice(0, 4).forEach((id, i) => {
        try { sections[id].motif(now + i * 7); } catch { /* noop */ }
      });
    },

    setSectionMuted(id, muted) {
      const s = sections[id];
      if (!s) return;
      if (s.setMuted) s.setMuted(muted);
      else s.base.setMuted(muted);
    },

    sectionLevels() {
      return Object.fromEntries(SECTION_IDS.map((id) => [id, sections[id].base.output.gain.value ?? 0]));
    },

    onChordChange(fn) { chordListener = fn; },
    onEvent(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },

    setUserGainScale(v, ramp = 0) { userGain = v; applyMasterGain(ramp); },
    setSleepGainScale(v, ramp = 0) { sleepGain = v; applyMasterGain(ramp); },

    /** Pause: halt scheduling, release sustained notes. */
    stop() {
      Tone.getTransport().pause();
      progressionPlayer.pause();
      Object.values(sections).forEach((s) => s.pause());
      atmosphere.stop();
    },
    resume() {
      Tone.getTransport().start();
      atmosphere.start();
      Object.values(sections).forEach((s) => s.resume());
      progressionPlayer.resume();
      if (lastScore) this.update(lastScore, lastStage, 1);
    },

    get harmony() {
      return { ...harmony };
    },

    dispose() {
      progressionPlayer.dispose();
      Object.values(sections).forEach((s) => { try { s.dispose(); } catch { /* noop */ } });
      atmosphere.dispose();
      Object.values(zones).forEach((z) => { z.input.dispose(); z.eq.dispose(); z.send.dispose(); });
      [dryBus, hallSend, reverb, echo, hallReturn, masterFilter, expression, masterGain, limiter, analyser, waveformAnalyser]
        .forEach((n) => n.dispose());
      const transport = Tone.getTransport();
      transport.stop();
      transport.cancel?.();
      listeners.clear();
    },
  };
}
