/**
 * Minimal fake of the Tone.js surface SONDE uses, for unit-testing the engine
 * and voices without a real AudioContext. Records param ramps and synth
 * triggers so tests can assert routing.
 */
class Param {
  constructor(value = 0) {
    this.value = value;
    this.history = [];
  }
  rampTo(value, time) {
    this.value = value;
    this.history.push({ value, time });
    return this;
  }
  setValueAtTime(value) {
    this.value = value;
    return this;
  }
}

class Node {
  // Tone.js connect() returns the SOURCE node (this), not the destination.
  connect() { return this; }
  toDestination() { return this; }
  start() { this.started = true; return this; }
  stop() { this.stopped = true; return this; }
  dispose() { this.disposed = true; return this; }
}

class Gain extends Node {
  constructor(value = 1) { super(); this.gain = new Param(value); }
}
class Filter extends Node {
  constructor(freq = 1000, type = 'lowpass') { super(); this.frequency = new Param(freq); this.type = type; }
}
class Reverb extends Node {
  constructor(opts = {}) { super(); this.wet = new Param(opts.wet ?? 1); this.decay = opts.decay; }
}
class Limiter extends Node {}
class Analyser extends Node {
  constructor(type = 'fft', size = 1024) { super(); this.type = type; this.size = size; }
  getValue() { return new Float32Array(this.size); }
}
class Oscillator extends Node {
  constructor(opts = {}) { super(); this.frequency = new Param(opts.frequency ?? 440); this.detune = new Param(0); this.type = opts.type; }
}
class FatOscillator extends Oscillator {}
class Tremolo extends Node {
  constructor(opts = {}) { super(); this.frequency = new Param(opts.frequency ?? 1); this.depth = new Param(opts.depth ?? 0.5); }
}
class Vibrato extends Node {
  constructor(opts = {}) { super(); this.frequency = new Param(opts.frequency ?? 1); this.depth = new Param(opts.depth ?? 0.1); }
}
class Panner extends Node {
  constructor(pan = 0) { super(); this.pan = new Param(pan); }
}
class PluckSynth extends Node {
  constructor() { super(); this.triggers = []; }
  triggerAttack(freq, time) { this.triggers.push({ freq, time }); return this; }
}
class FMSynth extends Node {}
class PolySynth extends Node {
  constructor(_voice, opts = {}) { super(); this.opts = opts; this.triggers = []; this.maxPolyphony = 0; }
  triggerAttackRelease(freqs, dur, time, vel) { this.triggers.push({ freqs, dur, time, vel }); return this; }
}

export function createFakeTone() {
  return {
    Gain, Filter, Reverb, Limiter, Analyser,
    Oscillator, FatOscillator, Tremolo, Vibrato, Panner,
    PluckSynth, FMSynth, PolySynth,
    now: () => 0,
  };
}
