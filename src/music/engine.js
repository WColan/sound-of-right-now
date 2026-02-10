import * as Tone from 'tone';
import { createPadVoice } from './voices/pad.js';
import { createArpeggioVoice } from './voices/arpeggio.js';
import { createBassVoice } from './voices/bass.js';
import { createTextureVoice } from './voices/texture.js';
import { createPercussionVoice } from './voices/percussion.js';
import { createDroneVoice } from './voices/drone.js';
import { createMelodyVoice } from './voices/melody.js';
import { voiceLead } from './scale.js';
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
 *
 * Audio graph:
 *   [Voices] -> [Panners] -> [Chorus] -> [Delay] -> [Reverb] -> [Master Filter] -> [Master Velocity] -> [Limiter] -> [Analyser] -> [Destination]
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

  // Create voices
  const pad = createPadVoice();
  const arpeggio = createArpeggioVoice();
  const bass = createBassVoice();
  const texture = createTextureVoice();
  const percussion = createPercussionVoice();
  const drone = createDroneVoice();
  const melody = createMelodyVoice();

  // ── Binaural panning ──
  // Each voice gets a panner node for stereo positioning
  const padPanner = new Tone.Panner(0);         // Center — already wide from fatsine spread
  const arpeggioPanner = new Tone.Panner(-0.3);  // Slightly left
  const bassPanner = new Tone.Panner(0);          // Center
  const texturePanner = new Tone.Panner(0);       // Center — already diffuse noise
  const dronePanner = new Tone.Panner(0);         // Center
  const melodyPanner = new Tone.Panner(0.25);     // Slightly right
  // Percussion has its own wind-driven panner already, connects directly

  // Connect voices -> panners -> chorus bus
  pad.output.connect(padPanner);
  padPanner.connect(chorus);

  arpeggio.output.connect(arpeggioPanner);
  arpeggioPanner.connect(chorus);

  bass.output.connect(bassPanner);
  bassPanner.connect(chorus);

  texture.output.connect(texturePanner);
  texturePanner.connect(chorus);

  drone.output.connect(dronePanner);
  dronePanner.connect(chorus);

  melody.output.connect(melodyPanner);
  melodyPanner.connect(chorus);

  // Percussion keeps its own panner (wind-driven), connects directly to chorus
  percussion.output.connect(chorus);

  // Track current musical state
  let currentRoot = null;
  let currentMode = null;
  let currentWeatherCategory = 'clear';
  let currentPressureNorm = 0.5;
  let lastPadVoicing = null;

  // External chord change listener (for visualizer)
  let externalChordChangeCallback = null;

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
      if (index === 0 && total > 0) {
        bass.playNote(chord.bassNote);
      } else {
        bass.changeNote(chord.bassNote);
      }

      // Update drone — transpose chord root to octave 1
      if (index === 0 && total > 0) {
        drone.playNote(chord.chordRootName);
      } else {
        drone.changeNote(chord.chordRootName);
      }

      // Update melody — set chord context and trigger potential phrase
      melody.setChordContext(chord.chordTones, chord.scaleTones);
      melody.onChordChange();

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
        });
      }
    },

    onCycleEnd() {
      // Generate a fresh progression with current musical context
      // so the music never loops the exact same sequence
      return generateProgression(
        currentRoot, currentMode, currentWeatherCategory, currentPressureNorm
      );
    },
  });

  return {
    // Expose for visualization
    analyser,
    waveformAnalyser,

    // Expose voices for direct control if needed
    voices: { pad, arpeggio, bass, texture, percussion, drone, melody },

    // Expose effects for direct control
    effects: { chorus, delay, reverb, masterFilter, masterVelocity, limiter },

    // Expose panners
    panners: { padPanner, arpeggioPanner, bassPanner, texturePanner, dronePanner, melodyPanner },

    // Expose progression player for external access
    progressionPlayer,

    /** Register callback for chord changes (used by visualizer) */
    onChordChange(fn) {
      externalChordChangeCallback = fn;
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
        arpeggioPattern, arpeggioOctave,
        arpeggioFilterCutoff,
        reverbDecay, reverbWet,
        chorusDepth,
        masterFilterCutoff,
        noiseType, noiseVolume, textureFilterCutoff,
        lfoRate, lfoDepth,
        rhythmDensity, percussionPan,
        arpeggioPan, melodyPan,
        globalVelocityScale,
        tideLevel,
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
      const progression = generateProgression(
        currentRoot, currentMode, currentWeatherCategory, currentPressureNorm
      );
      progressionPlayer.setProgression(progression, true);
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
      texture.start();

      // Percussion
      if (percussionPattern) {
        percussion.setPatternCategory(percussionPattern);
      }
      percussion.setDensity(rhythmDensity ?? 0.2);
      percussion.panner.pan.value = percussionPan ?? 0;
      percussion.membrane.volume.value = percussionVolume ?? -22;
      percussion.metal.volume.value = (percussionVolume ?? -22) - 4;
      percussion.start();

      // Drone (note set by progression player via onChordChange)
      drone.rootSynth.volume.value = droneVolume ?? -30;
      drone.fifthSynth.volume.value = (droneVolume ?? -30) - 4;

      // Melody
      if (melodyMood) melody.setMood(melodyMood);
      melody.synth.volume.value = melodyVolume ?? -20;

      // Effects
      reverb.decay = reverbDecay ?? 4;
      reverb.wet.value = reverbWet ?? 0.3;
      chorus.depth = chorusDepth ?? 0.5;
      masterFilter.frequency.value = masterFilterCutoff ?? 8000;

      // Master velocity (time-of-day volume)
      masterVelocity.gain.value = globalVelocityScale ?? 1.0;

      // Binaural panning
      if (arpeggioPan != null) arpeggioPanner.pan.value = arpeggioPan;
      if (melodyPan != null) melodyPanner.pan.value = melodyPan;

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
        case 'percussionPan': percussion.setPan(value, duration); break;
        case 'arpeggioPan': arpeggioPanner.pan.linearRampTo(value, duration); break;
        case 'melodyPan': melodyPanner.pan.linearRampTo(value, duration); break;

        // Tempo
        case 'bpm': Tone.getTransport().bpm.rampTo(value, duration); break;

        // Rhythm
        case 'rhythmDensity': percussion.setDensity(value); break;

        // Master velocity (time-of-day volume)
        case 'globalVelocityScale':
          masterVelocity.gain.linearRampTo(value, duration);
          break;

        // Pressure — regenerate progression with new harmonic rhythm
        case 'pressureNorm': {
          currentPressureNorm = value;
          const prog = generateProgression(
            currentRoot, currentMode, currentWeatherCategory, currentPressureNorm
          );
          progressionPlayer.setProgression(prog, false); // Queue for next cycle
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
          const prog = generateProgression(
            currentRoot, currentMode, currentWeatherCategory, currentPressureNorm
          );
          // Key/mode changes are musically significant — start immediately
          progressionPlayer.setProgression(prog, true);
          break;
        }

        case 'weatherCategory': {
          const oldCategory = currentWeatherCategory;
          currentWeatherCategory = value;
          const immediate = shouldImmediatelyChange(oldCategory, value);
          const prog = generateProgression(
            currentRoot, currentMode, currentWeatherCategory, currentPressureNorm
          );
          progressionPlayer.setProgression(prog, immediate);
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

        case 'melodyMood': melody.setMood(value); break;

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
      progressionPlayer.stop();
      Tone.getTransport().stop();
    },

    dispose() {
      this.stop();
      pad.dispose();
      arpeggio.dispose();
      bass.dispose();
      texture.dispose();
      percussion.dispose();
      drone.dispose();
      melody.dispose();
      progressionPlayer.dispose();
      // Panners
      padPanner.dispose();
      arpeggioPanner.dispose();
      bassPanner.dispose();
      texturePanner.dispose();
      dronePanner.dispose();
      melodyPanner.dispose();
      // Effects
      chorus.dispose();
      delay.dispose();
      reverb.dispose();
      masterFilter.dispose();
      masterVelocity.dispose();
      limiter.dispose();
      analyser.dispose();
      waveformAnalyser.dispose();
    },
  };
}
