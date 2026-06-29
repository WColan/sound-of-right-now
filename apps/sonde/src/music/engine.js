/**
 * SONDE audio engine.
 *
 * Owns the Tone.js graph for the celestial piece and implements the interpolator
 * contract (applyParams / rampParam / scheduleDiscreteChange) so the same core
 * interpolator that drives SONAR drives SONDE too.
 *
 * Voices:
 *   • Sun        — constant root drone (the fundamental)
 *   • 8 bodies   — one drifting tone each (Mercury…Pluto, minus Earth)
 *   • Lunar      — moon-phase shimmer
 *   • Galilean   — Jupiter's 1:2:4 polyrhythm (event-driven, see updateGalilean)
 *   • Aspect     — bell blooms on planetary alignments (event-driven, triggerAspect)
 *
 * Tone is injected (defaults to the real library) so the engine is testable.
 */
import * as ToneDefault from 'tone';
import { createAudioBus } from './audio-bus.js';
import { createSunVoice } from './voices/sunVoice.js';
import { createBodyVoice } from './voices/bodyVoice.js';
import { createLunarVoice } from './voices/lunarVoice.js';
import { createGalileanVoice } from './voices/galileanVoice.js';
import { createAspectVoice } from './voices/aspectVoice.js';
import { BODY_TUNING, SUN_TUNING } from './mapper.js';
import { SOUNDING_BODIES } from '../sky/ephemeris.js';

const SUN_VOLUME_DB = -15;

export function createSondeEngine({ Tone = ToneDefault, userGain = 0 } = {}) {
  const bus = createAudioBus(Tone, { userGain });
  let currentUserGain = userGain;
  let started = false;

  // ── Build voices ──
  const sun = createSunVoice(Tone, SUN_TUNING);
  sun.output.connect(bus.voiceBus);

  const bodies = {};
  for (const name of SOUNDING_BODIES) {
    const v = createBodyVoice(Tone, { freq: BODY_TUNING[name].freq });
    v.output.connect(bus.voiceBus);
    bodies[name] = v;
  }

  const lunar = createLunarVoice(Tone, { freq: 523.25 });
  lunar.output.connect(bus.voiceBus);

  const galilean = createGalileanVoice(Tone, { jupiterFreq: BODY_TUNING.Jupiter.freq });
  galilean.output.connect(bus.voiceBus);

  const aspect = createAspectVoice(Tone, {});
  aspect.output.connect(bus.voiceBus);

  const voices = { sun, lunar, galilean, aspect, ...bodies };

  // ── Param dispatch ──
  // Body keys are `${Body}${Prop}` (e.g. "MercuryPan"). Body names are mutually
  // non-prefixing, so startsWith is unambiguous.
  function applyBodyParam(name, prop, value, ramp) {
    const v = bodies[name];
    if (!v) return;
    switch (prop) {
      case 'Pan': v.setPan(value, ramp); break;
      case 'Cutoff': v.setCutoff(value, ramp); break;
      case 'PulseHz': v.setPulseRate(value, ramp); break;
      case 'PulseDepth': v.setPulseDepth(value, ramp); break;
      case 'Detune': v.setDetune(value, ramp); break;
      case 'Volume': v.setVolume(value, ramp); break;
    }
  }

  function rampParam(key, value, seconds = 0.5) {
    switch (key) {
      case 'masterCutoff': bus.setMasterCutoff(value, seconds); return;
      case 'reverbWet': bus.setReverbWet(value, seconds); return;
      case 'lunarVolume': lunar.setVolume(value, seconds); return;
      case 'lunarCutoff': lunar.setCutoff(value, seconds); return;
      case 'aspectTension': return; // ambient tension already drives masterCutoff/reverbWet
    }
    for (const name of SOUNDING_BODIES) {
      if (key.startsWith(name)) {
        applyBodyParam(name, key.slice(name.length), value, seconds);
        return;
      }
    }
  }

  return {
    voices,
    analyser: bus.analyser,
    waveformAnalyser: bus.waveformAnalyser,

    // ── Interpolator contract ──
    applyParams(params) {
      for (const [key, value] of Object.entries(params)) {
        if (key === '_meta') continue;
        rampParam(key, value, 0.05); // snap on first apply
      }
    },
    rampParam,
    scheduleDiscreteChange(key, value) {
      // SONDE has no boundary-snapped params; apply promptly.
      rampParam(key, value, 0.1);
    },

    // ── Lifecycle ──
    start() {
      if (started) return;
      started = true;
      sun.start();
      sun.setVolume(SUN_VOLUME_DB, 4);
      for (const name of SOUNDING_BODIES) bodies[name].start();
      lunar.start();
      galilean.setVolume(-14, 1);
      aspect.setVolume(-10, 1);
    },

    /** Master user level (0–1), persisted so pause/resume restores it. */
    setUserGain(value, ramp = 0.2) {
      currentUserGain = value;
      bus.setUserGain(value, ramp);
    },

    pause() { bus.setUserGain(0, 0.4); },
    resume() { bus.setUserGain(currentUserGain, 0.4); },

    // ── Event-driven voices ──
    updateGalilean(phases) { galilean.updatePhases(phases); },
    triggerAspect(asp) { aspect.trigger(asp); },

    dispose() {
      for (const v of Object.values(voices)) v.dispose?.();
      bus.dispose();
    },
  };
}
