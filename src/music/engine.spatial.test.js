import { describe, expect, it, vi } from 'vitest';
import { panToX } from './spatial.js';

const voiceState = vi.hoisted(() => ({
  percussion: null,
}));

vi.mock('tone', () => {
  class Param {
    constructor(value = 0) {
      this.value = value;
      this.ramps = [];
    }

    linearRampTo(value, duration) {
      this.value = value;
      this.ramps.push([value, duration]);
    }

    rampTo(value, duration) {
      this.value = value;
      this.ramps.push([value, duration]);
    }
  }

  class AudioNode {
    constructor() {
      this.connections = [];
    }

    connect(target) {
      this.connections.push(target);
      return target;
    }

    toDestination() {
      return this;
    }

    dispose() {}
  }

  class Chorus extends AudioNode {
    constructor() {
      super();
      this.depth = 0;
    }

    start() {
      return this;
    }
  }

  class FeedbackDelay extends AudioNode {
    constructor() {
      super();
      this.feedback = new Param(0);
      this.wet = new Param(0);
    }
  }

  class Reverb extends AudioNode {
    constructor(options = {}) {
      super();
      this.decay = options.decay ?? 0;
      this.wet = new Param(options.wet ?? 0);
    }
  }

  class Filter extends AudioNode {
    constructor(options = {}) {
      super();
      this.frequency = new Param(options.frequency ?? 0);
    }
  }

  class Gain extends AudioNode {
    constructor(value = 1) {
      super();
      this.gain = new Param(value);
      this.volume = new Param(0);
    }
  }

  class Chebyshev extends AudioNode {}
  class Limiter extends AudioNode {}
  class Analyser extends AudioNode {}

  class Tremolo extends AudioNode {
    constructor() {
      super();
      this.frequency = new Param(1.2);
      this.depth = new Param(0);
      this.wet = new Param(0);
    }

    start() { return this; }
  }

  class Synth extends AudioNode {
    constructor() {
      super();
      this.volume = new Param(0);
    }

    triggerAttackRelease() {}
    dispose() {}
  }

  class Panner extends AudioNode {
    constructor(value = 0) {
      super();
      this.pan = new Param(value);
    }
  }

  class Panner3D extends AudioNode {
    constructor(options = {}) {
      super();
      this.positionX = new Param(options.positionX ?? 0);
      this.positionY = new Param(options.positionY ?? 0);
      this.positionZ = new Param(options.positionZ ?? 0);
    }
  }

  class StereoWidener extends AudioNode {
    constructor(width = 0.3) {
      super();
      this.width = new Param(width);
    }
  }

  const transport = {
    bpm: new Param(72),
    start() {},
    pause() {},
  };

  const listener = {
    positionX: new Param(0),
    positionY: new Param(0),
    positionZ: new Param(0),
    forwardX: new Param(0),
    forwardY: new Param(0),
    forwardZ: new Param(-1),
    upX: new Param(0),
    upY: new Param(1),
    upZ: new Param(0),
  };

  return {
    Chorus,
    FeedbackDelay,
    Reverb,
    Filter,
    Gain,
    Chebyshev,
    Limiter,
    Analyser,
    Tremolo,
    Synth,
    Panner,
    Panner3D,
    StereoWidener,
    getTransport: () => transport,
    getListener: () => listener,
  };
});

function makeOutput() {
  return {
    volume: {
      value: 0,
      rampTo(value) {
        this.value = value;
      },
    },
    connect() {},
    dispose() {},
  };
}

vi.mock('./voices/pad.js', () => ({
  createPadVoice() {
    return {
      output: makeOutput(),
      synthA: { volume: { value: 0 }, detune: { value: 0, rampTo() {} } },
      synthB: { volume: { value: 0 }, detune: { value: 0, rampTo() {} } },
      filter: { frequency: { value: 0 } },
      setSpread() {},
      setFilterCutoff() {},
      setVolume() {},
      setTimbreProfile() {},
      playChord() {},
      changeChord() {},
      stop() {},
      dispose() {},
    };
  },
}));

vi.mock('./voices/arpeggio.js', () => ({
  createArpeggioVoice() {
    return {
      output: makeOutput(),
      synth: { volume: { value: 0 }, detune: { value: 0, rampTo() {} } },
      filter: { frequency: { value: 0 } },
      setDirection() {},
      setRhythmPattern() {},
      setVolume() {},
      setFilterCutoff() {},
      setTimbreProfile() {},
      setChordContext() {},
      start() {},
      stop() {},
      dispose() {},
    };
  },
}));

vi.mock('./voices/bass.js', () => ({
  createBassVoice() {
    return {
      output: makeOutput(),
      synth: { volume: { value: 0 } },
      filter: { frequency: { value: 0 } },
      setLFO() {},
      setFilterCutoff() {},
      setVolume() {},
      playNote() {},
      changeNote() {},
      enableWalking() {},
      disableWalking() {},
      stop() {},
      dispose() {},
    };
  },
}));

vi.mock('./voices/texture.js', () => ({
  createTextureVoice() {
    return {
      output: makeOutput(),
      noise: { volume: { value: 0 } },
      filter: { frequency: { value: 0 } },
      setNoiseType() {},
      setAutoFilter() {},
      setFilterCutoff() {},
      setVolume() {},
      setRain() {},
      start() {},
      stop() {},
      dispose() {},
    };
  },
}));

vi.mock('./voices/percussion.js', () => ({
  createPercussionVoice() {
    const voice = {
      output: makeOutput(),
      panner: { pan: { value: 0 } },
      membrane: { volume: { value: 0 } },
      metal: { volume: { value: 0 } },
      panCalls: [],
      setPatternCategory() {},
      setDensity() {},
      setVolume() {},
      triggerChordAccent() {},
      setPan(value, duration) {
        this.panCalls.push([value, duration]);
        this.panner.pan.value = value;
      },
      start() {},
      stop() {},
      dispose() {},
    };
    voiceState.percussion = voice;
    return voice;
  },
}));

vi.mock('./voices/drone.js', () => ({
  createDroneVoice() {
    return {
      output: makeOutput(),
      rootSynth: { volume: { value: 0 } },
      fifthSynth: { volume: { value: 0 } },
      setFilterCutoff() {},
      setVolume() {},
      playNote() {},
      changeNote() {},
      stop() {},
      dispose() {},
    };
  },
}));

vi.mock('./voices/melody.js', () => ({
  createMelodyVoice() {
    return {
      output: makeOutput(),
      synth: { volume: { value: 0 } },
      setMood() {},
      setVolume() {},
      setTimbreProfile() {},
      setChordContext() {},
      onChordChange() {},
      stop() {},
      dispose() {},
    };
  },
}));

vi.mock('./voices/windchime.js', () => ({
  createWindChimeVoice() {
    return {
      output: makeOutput(),
      setNotes() {},
      setWindSpeed() {},
      setActive() {},
      dispose() {},
    };
  },
}));

vi.mock('./progression.js', () => ({
  generateProgression() {
    return { chords: [{ notes: ['C4'], chordTones: ['C4'], scaleTones: ['C4'], bassNote: 'C2', chordRootName: 'C', quality: 'maj7', degree: 1 }], harmonicRhythm: '4m', length: 1 };
  },
  createProgressionPlayer() {
    return {
      currentChord: null,
      position: { index: 0, total: 0 },
      setProgression() {},
      pause() {},
      resume() {},
      stop() {},
      dispose() {},
    };
  },
  shouldImmediatelyChange() {
    return false;
  },
}));

import { createSoundEngine } from './engine.js';

function bootEngine() {
  const engine = createSoundEngine();
  engine.applyParams({
    rootNote: 'C',
    scaleType: 'ionian',
    weatherCategory: 'clear',
    pressureNorm: 0.5,
    bpm: 72,
    arpeggioPan: -0.2,
    melodyPan: 0.2,
    percussionPan: 0,
    arpeggioWidth: 0.2,
    melodyWidth: 0.2,
  });
  return engine;
}

describe('engine spatial routing', () => {
  it('ramps arpeggio pan through 3D X position', () => {
    const engine = bootEngine();
    expect(engine.spatial.mode).toBe('hrtf');

    engine.rampParam('arpeggioPan', 0.5, 4);
    expect(engine.panners.arpeggioPanner.positionX.value).toBeCloseTo(
      panToX(0.5, engine.spatial.xRange),
      6,
    );

    engine.dispose();
  });

  it('ramps melody width into depth (z)', () => {
    const engine = bootEngine();

    engine.rampParam('melodyWidth', 0, 1);
    const farZ = engine.panners.melodyPanner.positionZ.value;

    engine.rampParam('melodyWidth', 1, 1);
    const nearZ = engine.panners.melodyPanner.positionZ.value;

    expect(nearZ).toBeGreaterThan(farZ);
    engine.dispose();
  });

  it('updates percussion stereo pan and spatial X together', () => {
    const engine = bootEngine();

    engine.rampParam('percussionPan', 0.4, 2);
    expect(voiceState.percussion.panCalls.at(-1)).toEqual([0.4, 2]);
    expect(engine.panners.percussionPanner.positionX.value).toBeCloseTo(
      panToX(0.4 * 0.75, engine.spatial.xRange),
      6,
    );

    engine.dispose();
  });
});
