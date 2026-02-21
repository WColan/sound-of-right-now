import * as Tone from 'tone';
import { createPadVoice } from './voices/pad.js';
import { createArpeggioVoice } from './voices/arpeggio.js';
import { createBassVoice } from './voices/bass.js';
import { createTextureVoice } from './voices/texture.js';
import { createPercussionVoice } from './voices/percussion.js';
import { createDroneVoice } from './voices/drone.js';
import { createMelodyVoice } from './voices/melody.js';
import { createWindChimeVoice } from './voices/windchime.js';
import { voiceLead } from './scale.js';
import { clampPan, createSpatialNode, widthToZ } from './spatial.js';
import {
  generateProgression, createProgressionPlayer, shouldImmediatelyChange,
} from './progression.js';

/**
 * The top-level sound engine. Owns all voices, shared effects, and master bus.
 *
 * Now includes:
 * - Progression player driving chord changes across all voices
 * - Drone voice (barely-audible root+fifth sine foundation)
 * - Melody voice (occasional phrases triggered on chord changes)
 * - Binaural panning (voices spread across stereo field)
 * - Master velocity gain node (time-of-day volume scaling)
 * - Parallel sub-bass bus (bass + drone tapped before chorus for physical thump)
 *
 * Audio graph:
 *   [Voices] -> [Panners] -> [Chorus] -> [Delay] -> [Reverb] -> [Master Filter] -> [Master Velocity] -> [Limiter] -> [Analyser] -> [Destination]
 *                    ↘ (bass + drone panners also connect here)
 *                    [Sub Bus] -> [Sub Lowpass 100Hz] -> [Sub Saturator] -> [Sub Gain] -> [Master Velocity]
 */
export function createSoundEngine() {
  // Shared effects
  const chorus = new Tone.Chorus({
    frequency: 0.3,
    depth: 0.5,
    wet: 0.2,
  }).start();

  const delay = new Tone.FeedbackDelay({
    delayTime: '8n.',
    feedback: 0.2,
    wet: 0.15,
  });

  const reverb = new Tone.Reverb({
    decay: 4,
    wet: 0.3,
  });

  const masterFilter = new Tone.Filter({
    frequency: 8000,
    type: 'lowpass',
    rolloff: -12,
  });

  // Master velocity gain — time-of-day volume scaling
  const masterVelocity = new Tone.Gain(1);
  let weatherGainScale = 1;
  let userGainScale = 1;
  let sleepGainScale = 1;

  function applyMasterGain(duration = 0) {
    const target = weatherGainScale * userGainScale * sleepGainScale;
    if (duration > 0) {
      masterVelocity.gain.linearRampTo(target, duration);
    } else {
      masterVelocity.gain.value = target;
    }
  }

  // ── Parallel sub-bass bus ──
  // Bass and drone panners connect here in addition to the main chorus chain.
  // This path bypasses chorus/reverb (which smear phase at low frequencies),
  // producing a clean, punchy sub signal that is felt rather than heard.
  const subBus = new Tone.Gain(1);
  const subLowpass = new Tone.Filter({
    frequency: 100,
    type: 'lowpass',
    rolloff: -48,  // Very steep — nothing above 100 Hz bleeds through
  });
  // Chebyshev order 2 adds only the 2nd harmonic (2× fundamental).
  // Makes 30 Hz drone content audible at 60 Hz on smaller speakers,
  // while still providing the felt sub on capable speakers/subwoofers.
  const subSaturator = new Tone.Chebyshev(2);
  const subGain = new Tone.Gain(0.35); // ~-9 dB; weather-driven via rampParam

  // Chain the sub bus: subBus → subLowpass → subSaturator → subGain → masterVelocity
  subBus.connect(subLowpass);
  subLowpass.connect(subSaturator);
  subSaturator.connect(subGain);
  subGain.connect(masterVelocity);

  // ── Percussion reverb (short, dedicated — bypasses shared reverb) ──
  // Percussion gets its own short reverb so hits sit in the same acoustic
  // space as the pads without inheriting the 1.5–10s humidity-driven tail.
  // Fixed 0.6s decay; wet level is weather-driven (fog = wetter, storm = drier).
  const percussionReverb = new Tone.Reverb({ decay: 0.6, wet: 0.22 });

  const limiter = new Tone.Limiter(-3);

  const analyser = new Tone.Analyser('fft', 256);
  const waveformAnalyser = new Tone.Analyser('waveform', 256);

  // Chain shared effects: chorus -> delay -> reverb -> master filter -> velocity -> limiter -> analysers -> destination
  chorus.connect(delay);
  delay.connect(reverb);
  reverb.connect(masterFilter);
  masterFilter.connect(masterVelocity);
  masterVelocity.connect(limiter);
  limiter.connect(analyser);
  limiter.connect(waveformAnalyser);
  limiter.toDestination();

  // Listener pose for 3D spatialization.
  const listener = Tone.getListener?.();
  if (listener) {
    listener.positionX.value = 0;
    listener.positionY.value = 0;
    listener.positionZ.value = 0;
    listener.forwardX.value = 0;
    listener.forwardY.value = 0;
    listener.forwardZ.value = -1;
    listener.upX.value = 0;
    listener.upY.value = 1;
    listener.upZ.value = 0;
  }

  const spatialXRange = 1.25;
  const arpeggioNearZ = -0.45;
  const arpeggioFarZ = -1.1;
  const melodyNearZ = -0.35;
  const melodyFarZ = -0.95;

  // Create voices
  const pad = createPadVoice();
  const arpeggio = createArpeggioVoice();
  const bass = createBassVoice();
  const texture = createTextureVoice();
  const percussion = createPercussionVoice();
  const drone = createDroneVoice();
  const melody = createMelodyVoice();
  const windChime = createWindChimeVoice();

  // Wind chime keeps its own path to reverb but now through a spatial node.
  const windChimePanner = createSpatialNode(Tone, {
    pan: 0.15,
    z: -0.58,
    range: spatialXRange,
  });

  // ── Spatialization ──
  // HRTF Panner3D when available; Tone.Panner fallback otherwise.
  const padPanner = createSpatialNode(Tone, {
    pan: 0,
    z: -0.95,
    range: spatialXRange,
  });
  const arpeggioPanner = createSpatialNode(Tone, {
    pan: -0.3,
    z: widthToZ(0.4, arpeggioNearZ, arpeggioFarZ),
    range: spatialXRange,
  });
  const bassPanner = new Tone.Panner(0);          // Keep low end centered and mono-safe.
  const texturePanner = createSpatialNode(Tone, {
    pan: 0,
    z: -1.05,
    range: spatialXRange,
  });
  const dronePanner = new Tone.Panner(0);         // Keep low end centered and mono-safe.
  const melodyPanner = createSpatialNode(Tone, {
    pan: 0.25,
    z: widthToZ(0.3, melodyNearZ, melodyFarZ),
    range: spatialXRange,
  });
  const percussionPanner = createSpatialNode(Tone, {
    pan: 0,
    z: -0.9,
    range: spatialXRange,
  });

  // ── Stereo wideners — wind-driven spatial expansion ──
  // Arpeggio and melody get StereoWidener nodes so calm = intimate, gusty = wide.
  const arpeggioWidener = new Tone.StereoWidener(0.4);
  const melodyWidener = new Tone.StereoWidener(0.3);

  // ── Pad high-pass filter — EQ carving ──
  // Removes pad content below 90 Hz to prevent mud with the bass fundamental.
  // fatsine pads have energy down to ~60 Hz; this creates headroom for the bass.
  const padHPF = new Tone.Filter({ frequency: 90, type: 'highpass', rolloff: -12 });

  // Connect voices -> spatial nodes -> wideners/chorus bus
  pad.output.connect(padHPF);
  padHPF.connect(padPanner.node);
  padPanner.node.connect(chorus);

  arpeggio.output.connect(arpeggioPanner.node);
  arpeggioPanner.node.connect(arpeggioWidener);
  arpeggioWidener.connect(chorus);

  bass.output.connect(bassPanner);
  bassPanner.connect(chorus);
  bassPanner.connect(subBus);  // Second connection — parallel sub-bass tap

  texture.output.connect(texturePanner.node);
  texturePanner.node.connect(chorus);

  drone.output.connect(dronePanner);
  dronePanner.connect(chorus);
  dronePanner.connect(subBus);  // Second connection — parallel sub-bass tap

  melody.output.connect(melodyPanner.node);
  melodyPanner.node.connect(melodyWidener);
  melodyWidener.connect(chorus);

  // Wind chime connects directly to reverb (no chorus/delay smear).
  windChime.output.connect(windChimePanner.node);
  windChimePanner.node.connect(reverb);

  // Percussion → dedicated short reverb → spatial panner → masterVelocity
  percussionReverb.connect(percussionPanner.node);
  percussionPanner.node.connect(masterVelocity);
  percussion.output.connect(percussionReverb);

  // Track current musical state
  let currentRoot = null;
  let currentMode = null;
  let currentWeatherCategory = 'clear';
  let currentPressureNorm = 0.5;
  let lastPadVoicing = null;
  let lastBassNote = null;         // Needed for resume() re-attack
  let lastDroneRootName = null;    // Needed for resume() re-attack
  let windChimeWasActive = false;  // Needed for resume() re-activation
  let lastMelodyChordTones = null; // Needed for resume() melody context restore
  let lastMelodyScaleTones = null;

  // Celestial context — updated from weather updates, used by melody for golden-hour boosts
  let currentSunTransition = 0;
  let currentMoonFullness = 0;

  // Melody mood — tracked so bass walking can be triggered on each chord change
  let currentMelodyMood = 'calm';

  // Microtonal drift — random walk on synth detune AudioParams
  let microtonalInterval = null;

  function startMicrotonal() {
    if (microtonalInterval) return;
    microtonalInterval = setInterval(() => {
      // Random-walk pad detune (synthA and synthB drift in opposite directions for width)
      const padStep = (Math.random() - 0.5) * 4;
      const padCurrent = pad.synthA?.detune?.value ?? 0;
      const padNext = Math.max(-18, Math.min(18, padCurrent + padStep));
      pad.synthA?.detune?.rampTo(padNext, 3);
      pad.synthB?.detune?.rampTo(-padNext * 0.7, 4);

      // Arpeggio detune drifts more subtly
      const arpStep = (Math.random() - 0.5) * 3;
      const arpCurrent = arpeggio.synth?.detune?.value ?? 0;
      const arpNext = Math.max(-12, Math.min(12, arpCurrent + arpStep));
      arpeggio.synth?.detune?.rampTo(arpNext, 2);

      // Melody drifts very subtly — enough to feel slightly unstable, not out of tune
      const melStep = (Math.random() - 0.5) * 2;
      const melCurrent = melody.synth?.detune?.value ?? 0;
      const melNext = Math.max(-8, Math.min(8, melCurrent + melStep));
      melody.synth?.detune?.rampTo(melNext, 4);
    }, 3000);
  }

  function stopMicrotonal() {
    if (microtonalInterval) {
      clearInterval(microtonalInterval);
      microtonalInterval = null;
    }
    // Return all drifting voices to concert pitch.
    // For pad: ramp both A and B — whichever is currently active or fading out,
    // both need to reset so the idle synth is clean for the next crossfade.
    pad.synthA?.detune?.rampTo(0, 5);
    pad.synthB?.detune?.rampTo(0, 5);
    arpeggio.synth?.detune?.rampTo(0, 3);
    melody.synth?.detune?.rampTo(0, 4);
  }

  function setSpatialPan(node, pan, duration = 0) {
    if (pan == null) return;
    node.setPan(clampPan(pan), duration);
  }

  function setArpeggioDepth(width, duration = 0) {
    if (width == null) return;
    arpeggioPanner.setZ(widthToZ(width, arpeggioNearZ, arpeggioFarZ), duration);
  }

  function setMelodyDepth(width, duration = 0) {
    if (width == null) return;
    melodyPanner.setZ(widthToZ(width, melodyNearZ, melodyFarZ), duration);
  }

  // External chord change listener (for visualizer)
  let externalChordChangeCallback = null;

  // Current progression reference — needed to read allQualities in the chord callback
  let currentProgression = null;

  // ── Progression player ──
  const progressionPlayer = createProgressionPlayer({
    onChordChange(chord, index, total) {
      // Voice-lead the pad
      const voicedNotes = voiceLead(lastPadVoicing, chord.notes);
      lastPadVoicing = voicedNotes;

      if (index === 0 && total > 0) {
        // First chord of a new progression — use playChord for a fresh start
        pad.playChord(voicedNotes);
      } else {
        pad.changeChord(voicedNotes);
      }

      // Update arpeggio chord context
      arpeggio.setChordContext(chord.chordTones, chord.scaleTones);

      // Update bass
      lastBassNote = chord.bassNote;
      if (currentMelodyMood === 'tense' || currentMelodyMood === 'melancholy') {
        // Walking bass — Tone.Sequence drives quarter-note root/fifth/passing/approach
        bass.enableWalking(chord.chordTones, chord.scaleTones);
      } else {
        bass.disableWalking();
        if (index === 0 && total > 0) {
          bass.playNote(chord.bassNote);
        } else {
          bass.changeNote(chord.bassNote);
        }
      }

      // Update drone — transpose chord root to octave 1
      lastDroneRootName = chord.chordRootName;
      if (index === 0 && total > 0) {
        drone.playNote(chord.chordRootName);
      } else {
        drone.changeNote(chord.chordRootName);
      }

      // Update wind chime note pool — pass both scale tones and chord tones so
      // the chime can prefer harmonically consonant strikes.
      windChime.setNotes(chord.scaleTones, chord.chordTones);

      // Update melody — set chord context and trigger potential phrase.
      // Also cache tones so resume() can restore context after a pause.
      lastMelodyChordTones = chord.chordTones;
      lastMelodyScaleTones = chord.scaleTones;
      melody.setChordContext(chord.chordTones, chord.scaleTones);
      melody.onChordChange({
        isFirstChord: index === 0,
        sunTransition: currentSunTransition,
        moonFullness: currentMoonFullness,
      });

      // Percussion accent on chord change
      percussion.triggerChordAccent();

      // Log for debugging
      console.log(
        `♫ Chord ${index + 1}/${total}: degree ${chord.degree} (${chord.quality}) — ${chord.notes.join(', ')}`
      );

      // Notify external listener (visualizer)
      if (externalChordChangeCallback) {
        externalChordChangeCallback({
          rootName: chord.chordRootName,
          quality: chord.quality,
          degree: chord.degree,
          index,
          total,
          allQualities: currentProgression ? currentProgression.chords.map(c => c.quality) : [],
        });
      }
    },

    onCycleEnd() {
      // Generate a fresh progression with current musical context
      // so the music never loops the exact same sequence
      currentProgression = generateProgression(
        currentRoot, currentMode, currentWeatherCategory, currentPressureNorm
      );
      return currentProgression;
    },
  });

  const spatialMode = [
    padPanner,
    arpeggioPanner,
    texturePanner,
    melodyPanner,
    percussionPanner,
    windChimePanner,
  ].every((node) => node.mode === 'hrtf') ? 'hrtf' : 'stereo-fallback';

  return {
    // Expose for visualization
    analyser,
    waveformAnalyser,

    // Expose voices for direct control if needed
    voices: { pad, arpeggio, bass, texture, percussion, drone, melody, windChime },

    // Expose effects for direct control
    effects: { chorus, delay, reverb, masterFilter, masterVelocity, limiter, subGain, percussionReverb, arpeggioWidener, melodyWidener, padHPF },

    // Expose panners/spatial nodes for debugging.
    panners: {
      padPanner: padPanner.node,
      arpeggioPanner: arpeggioPanner.node,
      bassPanner,
      texturePanner: texturePanner.node,
      dronePanner,
      melodyPanner: melodyPanner.node,
      percussionPanner: percussionPanner.node,
      windChimePanner: windChimePanner.node,
    },

    spatial: {
      mode: spatialMode,
      xRange: spatialXRange,
    },

    // Expose progression player for external access
    progressionPlayer,

    /** Register callback for chord changes (used by visualizer) */
    onChordChange(fn) {
      externalChordChangeCallback = fn;
    },

    /**
     * Fire a thunder transient — called by main.js when the visualizer's
     * lightning flash fires. Delegates to the percussion voice so the
     * membrane synth is already routed through the correct signal chain.
     */
    triggerThunder() {
      percussion.triggerThunder();
    },

    /**
     * Update celestial context used by melody for golden-hour / full-moon
     * phrase probability boosts. Called from main.js on each weather update.
     */
    updateCelestialContext(sunTransition, moonFullness) {
      currentSunTransition = sunTransition ?? 0;
      currentMoonFullness = moonFullness ?? 0;
    },

    /**
     * Start or stop microtonal pitch drift based on current conditions.
     * Active for fog, high UV (uvNorm > 0.7), or apparent temperature > 30°C.
     * Called from main.js on each weather update.
     */
    updateMicrotonalContext(weatherCategory, uvNorm, apparentTemp) {
      const active = weatherCategory === 'fog' || uvNorm > 0.7 || (apparentTemp ?? 0) > 30;
      if (active) startMicrotonal();
      else stopMicrotonal();
    },

    /**
     * Update wind chime wind speed so it can adjust its strike interval.
     * Called from main.js on each weather update.
     */
    updateWindChime(windSpeed) {
      windChime.setWindSpeed(windSpeed);
    },

    /** User-controlled master gain scale (volume slider). */
    setUserGainScale(scale, rampTime = 0.1) {
      userGainScale = scale ?? 1;
      applyMasterGain(rampTime);
    },

    /** Sleep timer attenuation (1 = normal, 0 = silent). */
    setSleepGainScale(scale, rampTime = 0.1) {
      sleepGainScale = scale ?? 1;
      applyMasterGain(rampTime);
    },

    /**
     * Start the engine. Call after Tone.start().
     * @param {object} params - Initial musical parameters from the mapper
     */
    start(params) {
      Tone.getTransport().bpm.value = params.bpm || 72;
      Tone.getTransport().start();
      // Note: applyParams is NOT called here — the interpolator's first
      // update() call handles it, avoiding a double-apply at boot time.
    },

    /**
     * Apply a full set of musical parameters.
     * Used for the initial state — no ramping.
     */
    applyParams(params) {
      const {
        rootNote, scaleType, bpm,
        padVolume, arpeggioVolume, bassVolume, textureVolume, percussionVolume,
        droneVolume, melodyVolume,
        padBrightness, padSpread,
        bassCutoff,
        arpeggioPattern,
        arpeggioFilterCutoff,
        reverbDecay, reverbWet,
        chorusDepth,
        masterFilterCutoff,
        noiseType, noiseVolume, textureFilterCutoff,
        lfoRate, lfoDepth,
        rhythmDensity, percussionPan,
        arpeggioPan, melodyPan,
        arpeggioWidth, melodyWidth,
        globalVelocityScale,
        tideLevel,
        textureAutoFilterRate, textureAutoFilterDepth,
        droneCutoff,
        // Progression params
        weatherCategory, pressureNorm,
        arpeggioRhythmPattern, percussionPattern,
        melodyMood,
      } = params;

      // Update scale/harmony state
      currentRoot = rootNote;
      currentMode = scaleType;
      currentWeatherCategory = weatherCategory || 'clear';
      currentPressureNorm = pressureNorm ?? 0.5;

      // ── Generate initial chord progression ──
      currentProgression = generateProgression(
        currentRoot, currentMode, currentWeatherCategory, currentPressureNorm
      );
      progressionPlayer.setProgression(currentProgression, true);
      // Note: the progression player's onChordChange callback will handle
      // setting up the pad, arpeggio, bass, drone, and melody with the first chord.

      // Pad volume & brightness (initial chord set by progression player)
      pad.synthA.volume.value = padVolume ?? -14;
      pad.synthB.volume.value = padVolume ?? -14;
      pad.filter.frequency.value = padBrightness != null ? padBrightness * 8000 + 200 : 3000;
      if (padSpread != null) pad.setSpread(padSpread);

      // Arpeggio (notes set by progression player)
      arpeggio.setDirection(arpeggioPattern || 'upDown');
      if (arpeggioRhythmPattern) {
        arpeggio.setRhythmPattern(arpeggioRhythmPattern);
      }
      arpeggio.synth.volume.value = arpeggioVolume ?? -18;
      if (arpeggioFilterCutoff != null) {
        arpeggio.filter.frequency.value = arpeggioFilterCutoff;
      }
      arpeggio.start();

      // Bass (note set by progression player)
      bass.synth.volume.value = bassVolume ?? -14;
      bass.filter.frequency.value = bassCutoff ?? 400;
      bass.setLFO(lfoRate ?? 0.05, lfoDepth ?? 0.5);

      // Texture
      texture.setNoiseType(noiseType || 'pink');
      texture.noise.volume.value = textureVolume ?? -24;
      texture.filter.frequency.value = textureFilterCutoff ?? 2000;
      texture.setAutoFilter(textureAutoFilterRate ?? 0.08, textureAutoFilterDepth ?? 0.6);
      texture.start();

      // Percussion
      if (percussionPattern) {
        percussion.setPatternCategory(percussionPattern);
      }
      percussion.setDensity(rhythmDensity ?? 0.2);
      percussion.panner.pan.value = percussionPan ?? 0;
      setSpatialPan(percussionPanner, (percussionPan ?? 0) * 0.75, 0);
      percussion.membrane.volume.value = percussionVolume ?? -22;
      percussion.metal.volume.value = (percussionVolume ?? -22) - 4;
      percussion.start();

      // Drone (note set by progression player via onChordChange)
      drone.rootSynth.volume.value = droneVolume ?? -30;
      drone.fifthSynth.volume.value = (droneVolume ?? -30) - 4;
      drone.setFilterCutoff(droneCutoff ?? 200);

      // Melody
      if (melodyMood) {
        melody.setMood(melodyMood);
        currentMelodyMood = melodyMood;
      }
      melody.synth.volume.value = melodyVolume ?? -20;

      // Timbre profile — oscillator type + envelope character across voices
      if (params.timbreProfile) {
        pad.setTimbreProfile(params.timbreProfile);
        arpeggio.setTimbreProfile(params.timbreProfile);
        melody.setTimbreProfile(params.timbreProfile);
      }

      // Effects
      reverb.decay = reverbDecay ?? 4;
      reverb.wet.value = reverbWet ?? 0.3;
      chorus.depth = chorusDepth ?? 0.5;
      masterFilter.frequency.value = masterFilterCutoff ?? 8000;
      if (arpeggioWidth != null) arpeggioWidener.width.value = arpeggioWidth;
      if (melodyWidth != null) melodyWidener.width.value = melodyWidth;

      // Master velocity (time-of-day volume), composed with user + sleep gain.
      weatherGainScale = globalVelocityScale ?? 1.0;
      applyMasterGain(0);

      // Spatial panning + depth
      setSpatialPan(arpeggioPanner, arpeggioPan ?? -0.3, 0);
      setSpatialPan(melodyPanner, melodyPan ?? 0.25, 0);
      setArpeggioDepth(arpeggioWidth ?? 0.4, 0);
      setMelodyDepth(melodyWidth ?? 0.3, 0);

      // BPM
      Tone.getTransport().bpm.value = bpm || 72;
    },

    /**
     * Ramp a single parameter smoothly over time.
     * @param {string} key - Parameter name
     * @param {*} value - Target value
     * @param {number} duration - Ramp time in seconds
     */
    rampParam(key, value, duration) {
      switch (key) {
        // Volumes
        case 'padVolume': pad.setVolume(value, duration); break;
        case 'arpeggioVolume': arpeggio.setVolume(value, duration); break;
        case 'bassVolume': bass.setVolume(value, duration); break;
        case 'textureVolume': texture.setVolume(value, duration); break;
        case 'percussionVolume': percussion.setVolume(value, duration); break;
        case 'droneVolume': drone.setVolume(value, duration); break;
        case 'melodyVolume': melody.setVolume(value, duration); break;

        // Filters
        case 'padBrightness': pad.setFilterCutoff(value * 8000 + 200, duration); break;
        case 'bassCutoff': bass.setFilterCutoff(value, duration); break;
        case 'masterFilterCutoff': masterFilter.frequency.linearRampTo(value, duration); break;
        case 'textureFilterCutoff': texture.setFilterCutoff(value, duration); break;
        case 'arpeggioFilterCutoff': arpeggio.setFilterCutoff(value, duration); break;

        // Effects
        case 'reverbDecay': reverb.decay = value; break; // Not rampable
        case 'reverbWet': reverb.wet.rampTo(value, duration); break;
        case 'chorusDepth': chorus.depth = value; break; // Set directly

        // Modulation
        case 'lfoRate': bass.setLFO(value, null); break;
        case 'lfoDepth': bass.setLFO(null, value); break;

        // Spatial / Panning
        case 'percussionPan':
          percussion.setPan(value, duration);
          setSpatialPan(percussionPanner, value * 0.75, duration);
          break;
        case 'arpeggioPan':
          setSpatialPan(arpeggioPanner, value, duration);
          break;
        case 'melodyPan':
          setSpatialPan(melodyPanner, value, duration);
          break;

        // Tempo
        case 'bpm': Tone.getTransport().bpm.rampTo(value, duration); break;

        // Rhythm
        case 'rhythmDensity': percussion.setDensity(value); break;

        // Texture atmosphere sweep
        case 'textureAutoFilterRate':  texture.setAutoFilter(value, null, duration); break;
        case 'textureAutoFilterDepth': texture.setAutoFilter(null, value, duration); break;

        // Drone filter
        case 'droneCutoff': drone.setFilterCutoff(value, duration); break;

        // Master velocity (time-of-day volume)
        case 'globalVelocityScale':
          weatherGainScale = value;
          applyMasterGain(duration);
          break;

        // Sub-bass bus gain (weather-driven physical impact)
        case 'subBassGain':
          subGain.gain.linearRampTo(value, duration);
          break;

        // Percussion reverb wet (weather-driven — fog = wetter, storm = drier)
        case 'percussionReverbWet':
          percussionReverb.wet.rampTo(value, duration);
          break;

        // Delay feedback (pressure-driven — low pressure = smear, high = crisp)
        case 'delayFeedback':
          delay.feedback.rampTo(value, duration);
          break;

        // Wind chime volume — also activates/deactivates the chime voice
        case 'windChimeVolume':
          windChime.output.volume.rampTo(value, duration);
          windChimeWasActive = value > -70;
          windChime.setActive(windChimeWasActive);
          break;

        // Stereo width (wind-driven — calm = intimate, gusty = wide)
        case 'arpeggioWidth':
          arpeggioWidener.width.rampTo(value, duration);
          setArpeggioDepth(value, duration);
          break;
        case 'melodyWidth':
          melodyWidener.width.rampTo(value, duration);
          setMelodyDepth(value, duration);
          break;

        // Pressure — regenerate progression with new harmonic rhythm
        case 'pressureNorm': {
          currentPressureNorm = value;
          currentProgression = generateProgression(
            currentRoot, currentMode, currentWeatherCategory, currentPressureNorm
          );
          progressionPlayer.setProgression(currentProgression, false); // Queue for next cycle
          break;
        }

        default: break;
      }
    },

    /**
     * Schedule a discrete (non-interpolatable) parameter change.
     * These snap at the next musically appropriate moment.
     */
    scheduleDiscreteChange(key, value) {
      switch (key) {
        case 'rootNote':
        case 'scaleType': {
          // Update root/mode, regenerate progression
          if (key === 'rootNote') currentRoot = value;
          if (key === 'scaleType') currentMode = value;

          // Generate a new progression in the new key
          currentProgression = generateProgression(
            currentRoot, currentMode, currentWeatherCategory, currentPressureNorm
          );
          // Key/mode changes are musically significant — start immediately
          progressionPlayer.setProgression(currentProgression, true);
          break;
        }

        case 'weatherCategory': {
          const oldCategory = currentWeatherCategory;
          currentWeatherCategory = value;
          const immediate = shouldImmediatelyChange(oldCategory, value);
          currentProgression = generateProgression(
            currentRoot, currentMode, currentWeatherCategory, currentPressureNorm
          );
          progressionPlayer.setProgression(currentProgression, immediate);
          break;
        }

        case 'arpeggioRhythmPattern':
          arpeggio.setRhythmPattern(value);
          break;

        case 'percussionPattern':
          percussion.setPatternCategory(value);
          break;

        case 'arpeggioPattern':
          arpeggio.setDirection(value);
          break;

        case 'noiseType': texture.setNoiseType(value); break;
        case 'padSpread': pad.setSpread(value); break;

        case 'melodyMood':
          melody.setMood(value);
          currentMelodyMood = value;
          break;

        case 'timbreProfile':
          pad.setTimbreProfile(value);
          arpeggio.setTimbreProfile(value);
          melody.setTimbreProfile(value);
          break;

        default: break;
      }
    },

    stop() {
      pad.stop();
      arpeggio.stop();
      bass.stop();
      texture.stop();
      percussion.stop();
      drone.stop();
      melody.stop();
      windChime.setActive(false);
      progressionPlayer.pause();
      // pause() preserves Transport clock position so resume() continues mid-phrase.
      // dispose() will still call stop() which resets position, but that's fine
      // since the engine is being torn down entirely.
      Tone.getTransport().pause();
    },

    /**
     * Resume after a stop() call. Restarts the autonomous voice loops and the
     * Transport without resetting position — music continues from where it paused.
     *
     * pad/bass/drone need explicit re-attack because stop() called triggerRelease()
     * on them. The progression player's changeNote() assumes the synth is already
     * sustaining, so it won't restart a silent voice. We force-restart them here
     * using the last known voicing/notes before restarting the Transport.
     */
    resume() {
      // Re-attack tonal voices that were fully released by stop()
      if (lastPadVoicing && lastPadVoicing.length > 0) {
        pad.playChord(lastPadVoicing);
      }
      if (lastBassNote) {
        bass.playNote(lastBassNote);
      }
      if (lastDroneRootName) {
        drone.playNote(lastDroneRootName);
      }

      // Restore melody chord context so it can fire a phrase on the next chord change.
      // stop() cleared its scheduled phrase events; setChordContext primes it again.
      if (lastMelodyChordTones && lastMelodyScaleTones) {
        melody.setChordContext(lastMelodyChordTones, lastMelodyScaleTones);
      }

      // Restart looping voices and the Transport clock
      arpeggio.start();
      texture.start();
      percussion.start();
      if (windChimeWasActive) windChime.setActive(true);
      progressionPlayer.resume();
      Tone.getTransport().start();
    },

    dispose() {
      this.stop();
      stopMicrotonal();
      pad.dispose();
      arpeggio.dispose();
      bass.dispose();
      texture.dispose();
      percussion.dispose();
      drone.dispose();
      melody.dispose();
      windChime.dispose();
      progressionPlayer.dispose();
      // Spatial panners
      padPanner.node.dispose();
      arpeggioPanner.node.dispose();
      bassPanner.dispose();
      texturePanner.node.dispose();
      dronePanner.dispose();
      melodyPanner.node.dispose();
      percussionPanner.node.dispose();
      windChimePanner.node.dispose();
      // Effects
      chorus.dispose();
      delay.dispose();
      reverb.dispose();
      masterFilter.dispose();
      masterVelocity.dispose();
      limiter.dispose();
      analyser.dispose();
      waveformAnalyser.dispose();
      // Sub-bass bus
      subBus.dispose();
      subLowpass.dispose();
      subSaturator.dispose();
      subGain.dispose();
      // Percussion reverb, pad HPF, stereo wideners
      percussionReverb.dispose();
      padHPF.dispose();
      arpeggioWidener.dispose();
      melodyWidener.dispose();
    },
  };
}
