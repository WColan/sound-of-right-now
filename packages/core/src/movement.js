/**
 * Movement conductor — musical arc and expression over time.
 *
 * Weather is the composer. This module is the CONDUCTOR — interpreting the
 * same weather-driven score with dynamics, emphasis, urgency, and release.
 * Every voice is present from the start; what changes is the *expression*
 * with which they play.
 *
 * A movement is an 8–20 minute arc with distinct phases:
 *   breathing → stirring → building → climax → descent → stillness
 *
 * Each movement has a personality (contemplative, dramatic, meditative, restless)
 * that shapes the peak intensity, build speed, and character of the arc.
 *
 * The conductor outputs 5 expression dimensions (all 0–1):
 *   dynamicSwell     — voice volumes above weather baseline
 *   harmonicTension  — Markov adventurousness + secondary dominant probability
 *   rhythmicEnergy   — percussion density + arpeggio complexity
 *   melodicUrgency   — melody phrase probability + volume emphasis
 *   effectDepth      — reverb, chorus, delay, spatial width, filter openness
 *
 * Each dimension samples the master intensity curve at a phase-offset time,
 * creating a natural cascade: harmony leads → rhythm follows → volume swells →
 * effects linger.
 */

// ── Feature toggle ──
// When false, the entire movement/expression system is bypassed.
// applyExpression becomes a no-op and the app sounds exactly as before.
export const CONDUCTOR_ENABLED = true;

// ── Movement personalities ──
// Each shapes the arc character: how high it peaks, how fast it builds,
// which dimensions are emphasised.
export const PERSONALITIES = {
  contemplative: {
    peakIntensity: 0.7,
    buildRate: 0.3,
    rhythmFocus: 0.3,
    harmonicAdventure: 0.5,
    durationRange: [12, 18], // minutes
  },
  dramatic: {
    peakIntensity: 1.0,
    buildRate: 0.6,
    rhythmFocus: 0.7,
    harmonicAdventure: 0.8,
    durationRange: [8, 12],
  },
  meditative: {
    peakIntensity: 0.5,
    buildRate: 0.15,
    rhythmFocus: 0.1,
    harmonicAdventure: 0.3,
    durationRange: [14, 20],
  },
  restless: {
    peakIntensity: 0.85,
    buildRate: 0.45,
    rhythmFocus: 0.7,
    harmonicAdventure: 0.5,
    durationRange: [8, 14],
  },
};

// ── Weather → first movement personality ──
export const WEATHER_PERSONALITY = {
  clear: 'contemplative',
  cloudy: 'contemplative',
  fog: 'meditative',
  drizzle: 'meditative',
  rain: 'restless',
  snow: 'meditative',
  storm: 'dramatic',
};

// ── Phase template ──
// Each phase defines a start/end position (0–1 through the movement)
// and the intensity at those boundaries.
// Climax has an asymmetric peak point within its range.
export const PHASE_TEMPLATE = {
  breathing:  { start: 0,    end: 0.18, from: 0.15, to: 0.25 },
  stirring:   { start: 0.18, end: 0.40, from: 0.25, to: 0.55 },
  building:   { start: 0.40, end: 0.58, from: 0.55, to: 0.9 },
  climax:     { start: 0.58, end: 0.72, from: 0.9, to: 0.78, peak: 0.64, peakIntensity: 1.0 },
  descent:    { start: 0.72, end: 0.88, from: 0.78, to: 0.28 },
  stillness:  { start: 0.88, end: 1.0,  from: 0.28, to: 0.03 },
};

export const PHASE_ORDER = ['breathing', 'stirring', 'building', 'climax', 'descent', 'stillness'];

// ── Phase offsets for expression dimensions ──
// Each dimension samples intensity at (t + offset), creating the cascade.
// Positive = leads (peaks earlier), negative = trails (peaks later).
const DIMENSION_OFFSETS = {
  dynamicSwell:     0,       // tracks intensity closely
  harmonicTension:  0.04,    // leads — tension builds BEFORE volume peak
  rhythmicEnergy:   0.02,    // leads slightly
  melodicUrgency:  -0.02,    // trails — melody crowns the climax
  effectDepth:     -0.035,   // trails — reverb/space lingers after peak
};

// ── Contrasting personality selection ──
// After each movement, pick a personality that contrasts the previous one.
const CONTRAST_MAP = {
  contemplative: ['dramatic', 'restless'],
  dramatic:      ['contemplative', 'meditative'],
  meditative:    ['restless', 'dramatic'],
  restless:      ['meditative', 'contemplative'],
};

/**
 * Hermite smoothstep: 3t² − 2t³
 * Zero derivative at both endpoints → no audible corners in transitions.
 * @param {number} t - 0 to 1
 * @returns {number} 0 to 1, smoothly interpolated
 */
export function smoothstep(t) {
  const c = Math.max(0, Math.min(1, t));
  return c * c * (3 - 2 * c);
}

/**
 * Compute the raw intensity at a given movement progress (0–1).
 * Handles the asymmetric climax peak and smoothstep interpolation.
 *
 * @param {number} t - movement progress 0–1
 * @param {number} peakScale - personality's peakIntensity (scales the climax)
 * @returns {number} intensity 0–1
 */
export function computeIntensity(t, peakScale = 1.0) {
  const clamped = Math.max(0, Math.min(1, t));

  for (const phaseName of PHASE_ORDER) {
    const phase = PHASE_TEMPLATE[phaseName];
    if (clamped < phase.start || clamped > phase.end) continue;

    // Phase-local progress 0–1
    const phaseLen = phase.end - phase.start;
    if (phaseLen <= 0) return phase.from * peakScale;
    const local = (clamped - phase.start) / phaseLen;

    if (phaseName === 'climax' && phase.peak != null) {
      // Asymmetric climax: rise to peak, then gentle fall
      const peakLocal = (phase.peak - phase.start) / phaseLen;
      if (local <= peakLocal) {
        // Rising to peak
        const riseProg = local / peakLocal;
        const raw = phase.from + (phase.peakIntensity - phase.from) * smoothstep(riseProg);
        return raw * peakScale;
      } else {
        // Falling from peak
        const fallProg = (local - peakLocal) / (1 - peakLocal);
        const raw = phase.peakIntensity + (phase.to - phase.peakIntensity) * smoothstep(fallProg);
        return raw * peakScale;
      }
    }

    // Standard smoothstep interpolation between phase boundaries
    const raw = phase.from + (phase.to - phase.from) * smoothstep(local);
    return raw * peakScale;
  }

  // Shouldn't reach here, but return minimum
  return 0.1 * peakScale;
}

/**
 * Determine which phase name we're in at progress t.
 * @param {number} t - movement progress 0–1
 * @returns {string} phase name
 */
export function getPhaseAtProgress(t) {
  const clamped = Math.max(0, Math.min(1, t));
  for (const name of PHASE_ORDER) {
    const phase = PHASE_TEMPLATE[name];
    if (clamped >= phase.start && clamped <= phase.end) return name;
  }
  return 'stillness'; // t >= 1.0
}

/**
 * Phase-local progress helper.
 * @param {number} t - movement progress 0–1
 * @param {string} phaseName
 * @returns {number} local phase progress 0–1
 */
function getPhaseLocalProgress(t, phaseName) {
  const phase = PHASE_TEMPLATE[phaseName];
  if (!phase) return 0;
  const len = Math.max(1e-6, phase.end - phase.start);
  return Math.max(0, Math.min(1, (t - phase.start) / len));
}

/**
 * Climax accent curve (0–1): rises to the climax peak and falls after it.
 * Used to push expression dimensions harder at the apex.
 */
function getClimaxAccent(t) {
  const phase = PHASE_TEMPLATE.climax;
  if (!phase || t < phase.start || t > phase.end) return 0;

  const peak = phase.peak ?? (phase.start + phase.end) / 2;
  if (t <= peak) {
    const riseLen = Math.max(1e-6, peak - phase.start);
    return smoothstep((t - phase.start) / riseLen);
  }

  const fallLen = Math.max(1e-6, phase.end - peak);
  return smoothstep((phase.end - t) / fallLen);
}

/**
 * Create a movement conductor instance.
 * Manages the lifecycle of movements, computes expression dimensions,
 * and fires callbacks on phase/movement boundaries.
 *
 * @returns {MovementConductor}
 */
export function createMovementConductor() {
  // ── State ──
  let elapsed = 0;           // seconds into current movement
  let totalElapsed = 0;      // total listening seconds across movements
  let duration = 0;          // total seconds for current movement
  let movementNumber = 0;
  let personality = null;
  let personalityName = '';
  let weatherCategory = 'clear';
  let paused = true;         // Start paused; resume() activates
  let lastTickTime = null;
  let personalityOverride = null;

  // ── Callbacks ──
  let onMovementChangeFn = null;
  let onPhaseChangeFn = null;
  let lastPhaseName = null;

  function getLiveElapsedValues() {
    let liveElapsed = elapsed;
    let liveTotalElapsed = totalElapsed;

    if (!paused && lastTickTime != null) {
      const deltaSec = Math.max(0, (performance.now() - lastTickTime) / 1000);
      liveElapsed += deltaSec;
      liveTotalElapsed += deltaSec;
    }

    return { liveElapsed, liveTotalElapsed };
  }

  /**
   * Pick the duration for a movement in seconds.
   */
  function pickDuration(p) {
    const [minMin, maxMin] = p.durationRange;
    const minutes = minMin + Math.random() * (maxMin - minMin);
    return minutes * 60;
  }

  /**
   * Select the personality for a new movement.
   * First movement: weather-driven. Subsequent: contrasting previous.
   */
  function selectPersonality() {
    if (personalityOverride) {
      const name = personalityOverride;
      personalityOverride = null; // Consume the override
      return name;
    }

    if (movementNumber === 1) {
      // First movement (already incremented by startMovement) — pick from weather
      return WEATHER_PERSONALITY[weatherCategory] || 'contemplative';
    }

    // Subsequent movements — contrast the previous
    const candidates = CONTRAST_MAP[personalityName] || ['contemplative', 'dramatic'];
    return candidates[Math.floor(Math.random() * candidates.length)];
  }

  /**
   * Start a new movement.
   */
  function startMovement() {
    movementNumber++;
    const name = selectPersonality();
    personalityName = name;
    personality = PERSONALITIES[name];
    duration = pickDuration(personality);
    elapsed = 0;
    lastPhaseName = null;

    console.log(
      `🎼 Movement #${movementNumber}: ${personalityName} (${(duration / 60).toFixed(1)} min)`
    );

    if (onMovementChangeFn) {
      onMovementChangeFn({
        movementNumber,
        personality: personalityName,
        duration,
      });
    }
  }

  /**
   * Compute the 5 expression dimensions for the current movement progress.
   */
  function computeExpression() {
    if (!personality || duration <= 0) {
      return {
        intensity: 0, dynamicSwell: 0, harmonicTension: 0,
        rhythmicEnergy: 0, melodicUrgency: 0, effectDepth: 0,
      };
    }

    const progress = Math.min(elapsed / duration, 1);
    const peakScale = personality.peakIntensity;

    // Master intensity at current progress
    const intensity = computeIntensity(progress, peakScale);

    // Each dimension samples at an offset progress, scaled by personality traits
    const dimValues = {};
    for (const [dim, offset] of Object.entries(DIMENSION_OFFSETS)) {
      const offsetProgress = Math.max(0, Math.min(1, progress + offset));
      let rawValue = computeIntensity(offsetProgress, peakScale);

      // Apply personality scaling to specific dimensions
      if (dim === 'rhythmicEnergy') {
        rawValue *= (0.3 + personality.rhythmFocus * 0.7);
      }
      if (dim === 'harmonicTension') {
        rawValue *= (0.3 + personality.harmonicAdventure * 0.7);
      }
      if (dim === 'melodicUrgency') {
        // Melody urgency is boosted during the climax phase for musical impact
        const phase = getPhaseAtProgress(offsetProgress);
        if (phase === 'building') rawValue *= 1.12;
        if (phase === 'climax') rawValue *= 1.28;
      }

      const phase = getPhaseAtProgress(offsetProgress);
      const climaxAccent = getClimaxAccent(offsetProgress);
      if (dim === 'dynamicSwell') rawValue *= (1 + climaxAccent * 0.22);
      if (dim === 'harmonicTension') rawValue *= (1 + climaxAccent * 0.18);
      if (dim === 'rhythmicEnergy') rawValue *= (1 + climaxAccent * 0.32);
      if (dim === 'effectDepth') rawValue *= (1 + climaxAccent * 0.12);

      if (phase === 'stillness') {
        // Stillness should progressively withdraw all motion by movement end.
        const stillnessDepth = smoothstep(getPhaseLocalProgress(offsetProgress, 'stillness'));
        rawValue *= (1 - stillnessDepth * 0.92);
      }

      dimValues[dim] = Math.max(0, Math.min(1, rawValue));
    }

    return {
      intensity: Math.max(0, Math.min(1, intensity)),
      ...dimValues,
    };
  }

  return {
    /**
     * Advance the movement clock using wall-clock delta.
     * Call this periodically (e.g. every 8 seconds).
     */
    tick() {
      if (paused || !personality) return;

      const now = performance.now();
      if (lastTickTime != null) {
        const deltaSec = (now - lastTickTime) / 1000;
        elapsed += deltaSec;
        totalElapsed += deltaSec;
      }
      lastTickTime = now;

      // Check for phase change
      const progress = Math.min(elapsed / duration, 1);
      const currentPhase = getPhaseAtProgress(progress);
      if (lastPhaseName && currentPhase !== lastPhaseName) {
        console.log(
          `🎼 Phase: ${currentPhase} (movement #${movementNumber}, ${(progress * 100).toFixed(0)}%)`
        );
        if (onPhaseChangeFn) {
          onPhaseChangeFn({
            phase: currentPhase,
            progress,
            movementNumber,
            personality: personalityName,
          });
        }
      }
      lastPhaseName = currentPhase;

      // Movement complete?
      if (elapsed >= duration) {
        startMovement();
      }
    },

    /**
     * Get the current expression state (5 dimensions + master intensity).
     * @returns {{ intensity, dynamicSwell, harmonicTension, rhythmicEnergy, melodicUrgency, effectDepth }}
     */
    getExpression() {
      if (!CONDUCTOR_ENABLED) {
        return {
          intensity: 0, dynamicSwell: 0, harmonicTension: 0,
          rhythmicEnergy: 0, melodicUrgency: 0, effectDepth: 0,
        };
      }
      return computeExpression();
    },

    /**
     * Get the current phase metadata for UI display.
     */
    getCurrentPhase() {
      const { liveElapsed, liveTotalElapsed } = getLiveElapsedValues();
      if (!personality) {
        return {
          name: 'inactive', progress: 0, movementNumber: 0,
          personality: '', elapsed: 0, remaining: 0, listeningSeconds: liveTotalElapsed,
        };
      }
      const progress = duration > 0 ? Math.min(liveElapsed / duration, 1) : 0;
      return {
        name: getPhaseAtProgress(progress),
        progress,
        movementNumber,
        personality: personalityName,
        elapsed: liveElapsed,
        remaining: Math.max(0, duration - liveElapsed),
        listeningSeconds: liveTotalElapsed,
      };
    },

    /**
     * Set the weather context — informs personality selection for the first movement.
     * @param {string} category - Weather category (e.g. 'clear', 'storm')
     */
    setWeatherContext(category) {
      weatherCategory = category || 'clear';
    },

    /**
     * Force the next (or current) movement to use a specific personality.
     * If a movement is in progress, it restarts with the new personality.
     * @param {string} name - Personality name
     */
    setPersonalityOverride(name) {
      if (!PERSONALITIES[name]) return;
      personalityOverride = name;
      // If we're already running, restart the movement with the override
      if (!paused && personality) {
        startMovement();
      }
    },

    /** Pause the conductor — freezes elapsed time. */
    pause() {
      paused = true;
      lastTickTime = null;
    },

    /** Resume the conductor — continues from paused position. */
    resume() {
      paused = false;
      lastTickTime = performance.now();
      // Start first movement if none exists
      if (!personality) {
        startMovement();
      }
    },

    /** Reset the conductor — zeroes everything for a fresh start. */
    reset() {
      elapsed = 0;
      totalElapsed = 0;
      duration = 0;
      movementNumber = 0;
      personality = null;
      personalityName = '';
      lastPhaseName = null;
      lastTickTime = null;
      paused = true;
      personalityOverride = null;
    },

    /**
     * Register callback for movement changes.
     * @param {Function} fn - Called with { movementNumber, personality, duration }
     */
    onMovementChange(fn) {
      onMovementChangeFn = fn;
    },

    /**
     * Register callback for phase changes.
     * @param {Function} fn - Called with { phase, progress, movementNumber, personality }
     */
    onPhaseChange(fn) {
      onPhaseChangeFn = fn;
    },

    // ── Accessors for testing / UI ──
    get movementNumber() { return movementNumber; },
    get personalityName() { return personalityName; },
    get isPaused() { return paused; },
    get elapsed() { return elapsed; },
    get totalElapsed() { return totalElapsed; },
    get duration() { return duration; },
  };
}
