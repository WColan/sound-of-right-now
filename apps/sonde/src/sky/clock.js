/**
 * Sky clock — SONDE's primary interaction surface.
 *
 * Real orbital motion is imperceptibly slow, so the clock lets the listener
 * warp time: simulation time advances at `speed` sim-seconds per real-second.
 * At speed 1 the sky is "live" (now); cranked up to ~1 year/sec, orbits,
 * retrogrades and conjunctions become audible over a minute or two.
 *
 * The clock owns only TIME. Visuals read getSimTime() each animation frame for
 * smooth motion; audio is re-sampled at the coarser `sampleIntervalMs` cadence
 * via onSample(simTime) so the mapper/interpolator aren't hammered at 60 fps.
 */

/** Speed presets in sim-seconds per real-second. */
export const SPEED_PRESETS = [
  { label: 'Live', value: 1 },
  { label: '1 hr/s', value: 3600 },
  { label: '1 day/s', value: 86400 },
  { label: '1 week/s', value: 604800 },
  { label: '1 month/s', value: 2629800 },
  { label: '1 year/s', value: 31557600 },
];

/**
 * @param {object} opts
 * @param {number} [opts.speed] - initial sim-seconds per real-second
 * @param {number} [opts.sampleIntervalMs] - audio re-sample cadence
 * @param {(simTime: Date) => void} [opts.onSample] - called every sample tick
 * @param {() => number} [opts.nowMs] - injectable clock source (for tests)
 */
export function createSkyClock({ speed = 1, sampleIntervalMs = 250, onSample = null, nowMs = () => Date.now() } = {}) {
  let currentSpeed = speed;
  let anchorReal = nowMs();
  let anchorSim = anchorReal;
  let sampleTimer = null;

  /** Re-anchor so simulation time is continuous across a speed change. */
  function reanchor() {
    anchorSim = simTimeMs();
    anchorReal = nowMs();
  }

  function simTimeMs() {
    return anchorSim + currentSpeed * (nowMs() - anchorReal);
  }

  function sample() {
    if (onSample) onSample(new Date(simTimeMs()));
  }

  return {
    /** Begin the audio-sample cadence. Fires one sample immediately. */
    start() {
      this.stop();
      sample();
      sampleTimer = setInterval(sample, sampleIntervalMs);
    },

    stop() {
      if (sampleTimer) {
        clearInterval(sampleTimer);
        sampleTimer = null;
      }
    },

    /** Current simulation time (read every frame by the visualizer). */
    getSimTime() {
      return new Date(simTimeMs());
    },

    getSpeed() {
      return currentSpeed;
    },

    /** Change time-warp factor, keeping simulation time continuous. */
    setSpeed(value) {
      reanchor();
      currentSpeed = value;
    },

    /** Snap simulation time back to the real present instant (keeps speed). */
    goLive() {
      anchorReal = nowMs();
      anchorSim = anchorReal;
      sample();
    },

    /** Jump to an arbitrary instant. */
    jumpTo(date) {
      anchorSim = date instanceof Date ? date.getTime() : date;
      anchorReal = nowMs();
      sample();
    },

    /** Live = running at real-time speed. */
    isLive() {
      return currentSpeed === 1;
    },
  };
}
