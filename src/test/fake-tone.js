/**
 * A permissive fake of the Tone.js surface used by the orchestra.
 *
 * Every constructor returns a node whose unknown properties are auto-created
 * "param-functions": callable (as methods) *and* param-like (value, rampTo,
 * setValueAtTime…). Calls are recorded so tests can assert on behaviour.
 *
 * Usage in a test file:
 *   vi.mock('tone', async () => (await import('../test/fake-tone.js')).createFakeToneModule());
 */

export function createFakeToneModule() {
  const created = [];
  const scheduled = new Map();
  let nextId = 1;

  function paramFn(name, owner) {
    const fn = (...args) => {
      fn.calls.push(args);
      return owner ?? fn;
    };
    fn.calls = [];
    fn.ramps = [];
    fn.value = 0;
    fn.paramName = name;
    const rampLike = (v, d) => { fn.value = v; fn.ramps.push([v, d]); return fn; };
    fn.rampTo = rampLike;
    fn.linearRampTo = rampLike;
    fn.exponentialRampTo = rampLike;
    fn.setValueAtTime = (v) => { fn.value = v; return fn; };
    fn.linearRampToValueAtTime = rampLike;
    fn.exponentialRampToValueAtTime = rampLike;
    fn.cancelScheduledValues = () => fn;
    return fn;
  }

  class Node {
    constructor(...args) {
      this.args = args;
      this.ctorName = new.target.name;
      this.connections = [];
      this.triggers = [];
      this.disposed = false;
      this.state = 'stopped';
      const opts = typeof args[0] === 'object' && args[0] !== null ? args[0] : {};
      if (opts.urls) this.urls = opts.urls;
      created.push(this);
      return new Proxy(this, {
        get(target, prop, receiver) {
          if (prop in target || typeof prop === 'symbol' || prop === 'then') return Reflect.get(target, prop, receiver);
          target[prop] = paramFn(String(prop), receiver);
          if (typeof opts[prop] === 'number') target[prop].value = opts[prop];
          return target[prop];
        },
        set(target, prop, value) {
          if (prop in target && typeof target[prop] === 'function' && 'value' in target[prop] && typeof value !== 'function') {
            target[prop].value = value;
          } else {
            target[prop] = value;
          }
          return true;
        },
      });
    }
    connect(target) { this.connections.push(target); return target; }
    disconnect() { this.connections = []; return this; }
    toDestination() { this.toDest = true; return this; }
    dispose() { this.disposed = true; return this; }
    start() { this.state = 'started'; return this; }
    stop() { this.state = 'stopped'; return this; }
    triggerAttackRelease(...a) { this.triggers.push(['attackRelease', ...a]); return this; }
    triggerAttack(...a) { this.triggers.push(['attack', ...a]); return this; }
    triggerRelease(...a) { this.triggers.push(['release', ...a]); return this; }
    releaseAll() { this.triggers.push(['releaseAll']); return this; }
    getValue() { return new Float32Array(256); }
  }

  const names = [
    'Gain', 'Filter', 'Limiter', 'Analyser', 'Reverb', 'FeedbackDelay', 'Panner', 'Panner3D', 'StereoWidener',
    'Tremolo', 'AutoFilter', 'Chorus', 'Noise', 'AmplitudeEnvelope', 'Synth', 'PolySynth', 'FMSynth', 'AMSynth',
    'MembraneSynth', 'MetalSynth', 'NoiseSynth', 'PluckSynth', 'Sampler', 'LFO', 'Oscillator', 'Chebyshev',
    'Meter', 'ToneAudioBuffers', 'Compressor', 'EQ3', 'Volume',
  ];
  const mod = Object.fromEntries(names.map((n) => [n, { [n]: class extends Node {} }[n]]));

  class Loop extends Node {
    constructor(callback, interval) {
      super({});
      this.callback = callback;
      this.interval = interval;
    }
  }
  mod.Loop = Loop;

  const transport = {
    seconds: 0,
    bpm: paramFn('bpm'),
    state: 'stopped',
    start() { this.state = 'started'; return this; },
    stop() { this.state = 'stopped'; return this; },
    pause() { this.state = 'paused'; return this; },
    cancel() { scheduled.clear(); return this; },
    scheduleOnce(cb, at) { const id = nextId++; scheduled.set(id, { cb, at }); return id; },
    scheduleRepeat(cb, interval) { const id = nextId++; scheduled.set(id, { cb, at: interval, repeat: true }); return id; },
    clear(id) { scheduled.delete(id); return this; },
    toSeconds(v) { return typeof v === 'number' ? v : 4; },
  };
  transport.bpm.value = 72;

  mod.getTransport = () => transport;
  mod.now = () => transport.seconds;
  mod.getListener = () => null;
  mod.getContext = () => ({ state: 'running' });
  mod.start = async () => {};
  mod.loaded = async () => {};
  const NOTE = { C: 0, 'C#': 1, D: 2, 'D#': 3, E: 4, F: 5, 'F#': 6, G: 7, 'G#': 8, A: 9, 'A#': 10, B: 11 };
  const toMidi = (v, unit) => {
    if (unit === 'midi' || typeof v === 'number') return unit === 'midi' ? v : 69 + 12 * Math.log2(v / 440);
    const m = /^([A-G]#?)(-?\d)$/.exec(String(v));
    return m ? 12 * (Number(m[2]) + 1) + NOTE[m[1]] : 69;
  };
  mod.Frequency = (v, unit) => ({
    toMidi: () => Math.round(toMidi(v, unit)),
    toFrequency: () => 440 * 2 ** ((toMidi(v, unit) - 69) / 12),
    toNote: () => 'A4',
    transpose(n) { return mod.Frequency(toMidi(v, unit) + n, 'midi'); },
  });
  mod.dbToGain = (db) => 10 ** (db / 20);
  mod.gainToDb = (g) => 20 * Math.log10(g);

  /** Test helper: run every scheduled callback due up to `seconds`, repeatedly. */
  mod.__advance = (seconds, step = 0.25) => {
    const end = transport.seconds + seconds;
    while (transport.seconds < end) {
      transport.seconds = Math.min(end, transport.seconds + step);
      for (const [id, ev] of [...scheduled.entries()]) {
        if (!ev.repeat && ev.at <= transport.seconds) {
          scheduled.delete(id);
          ev.cb(ev.at);
        }
      }
    }
  };
  mod.__created = created;
  mod.__scheduled = scheduled;
  mod.__transport = transport;
  return mod;
}
