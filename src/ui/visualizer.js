/**
 * Canvas-based generative visualization.
 *
 * Layers (back to front):
 *   1. Sky gradient (shifts with time of day, dynamic color palette)
 *   2. Stars (visible at night)
 *   3. Moon (correct phase, with glow)
 *   4. Aurora/shimmer (near sunrise/sunset)
 *   5. Animated clouds (drift with wind, opacity from cloud cover)
 *   6. Weather particles (rain, snow, fog, or clear)
 *   7. Waveform-reactive landscape silhouette
 *   8. Water/wave line at base (tide + bass FFT)
 *   9. Atmospheric particles (drift with wind, pulse with audio)
 *
 * Also manages:
 *   - Chord name display (DOM overlay, fade transitions)
 *   - Progression timeline dots (DOM overlay)
 *   - Dynamic CSS custom properties for UI color cohesion
 */

// Color palettes for different times of day
const SKY_COLORS = {
  night:     { top: [8, 8, 20],      bottom: [15, 15, 35] },
  dawn:      { top: [30, 20, 50],    bottom: [180, 100, 60] },
  morning:   { top: [60, 100, 160],  bottom: [140, 170, 200] },
  afternoon: { top: [70, 120, 180],  bottom: [150, 180, 210] },
  dusk:      { top: [40, 20, 60],    bottom: [200, 100, 50] },
};

// Weather-adjusted color shifts
const WEATHER_COLOR_SHIFT = {
  clear:   { sat: 1.0, bright: 1.0 },
  cloudy:  { sat: 0.5, bright: 0.7 },
  fog:     { sat: 0.3, bright: 0.5 },
  drizzle: { sat: 0.6, bright: 0.6 },
  rain:    { sat: 0.4, bright: 0.5 },
  snow:    { sat: 0.3, bright: 0.8 },
  storm:   { sat: 0.3, bright: 0.3 },
};

// Chord quality display names
const QUALITY_NAMES = {
  'maj7': 'maj7',
  'min7': 'm7',
  'dom7': '7',
  'min7b5': 'm7b5',
};

// Chord quality → color mapping
const QUALITY_COLORS = {
  'maj7':   'rgba(255, 210, 100, 0.9)',  // Warm gold
  'min7':   'rgba(140, 180, 255, 0.9)',  // Cool blue
  'dom7':   'rgba(255, 155, 80, 0.9)',   // Amber — tension
  'min7b5': 'rgba(160, 130, 200, 0.9)', // Muted purple — dark
};

export function createVisualizer(canvas, analyser, waveformAnalyser) {
  const ctx = canvas.getContext('2d');
  let width, height;
  let animFrame = null;
  let time = 0;

  // State (updated by weather/music data)
  let state = {
    timeOfDay: 'night',
    weatherCategory: 'clear',
    windSpeed: 0,
    windDirection: 0,
    moonPhase: 0,
    moonFullness: 0,
    brightness: 0.1,
    tideLevel: null,
    sunTransition: 0,
    cloudCover: 0,
    filterWarmth: 0,
    aqiNorm: 0,
    // Celestial timing (Date objects)
    sunrise: null,
    sunset: null,
    moonrise: null,
    moonset: null,
    // Milky Way + shooting star intensity (0-1, computed in main.js)
    milkyWayIntensity: 0,
  };

  // Particles
  let particles = [];
  let weatherParticles = [];
  let stars = [];
  let splashes = []; // Rain impact ripples

  // Lightning state
  let lightningAlpha = 0;
  let lightningTimer = null;
  let lightningCallback = null; // Registered via onLightning(fn)

  // Milky Way star density layer
  let milkyWayStars = [];

  // Shooting stars state
  let shootingStars = [];
  let shootingStarTimer = null;
  let shootingStarCallback = null; // Registered via onShootingStar(fn)

  // Clouds
  let clouds = [];

  // Landscape
  let landscape = [];

  // Current progression qualities (for dot coloring)
  let currentAllQualities = [];

  // Firefly particles
  let fireflies = [];
  const MAX_FIREFLIES = 35;

  // Snow accumulation (grows during snowfall, melts slowly otherwise)
  let snowAccumulation = 0;

  // Heat shimmer offscreen canvas
  let offscreenCanvas = null;
  let offscreenCtx = null;
  let shimmerPhase = 0;

  // Chord display state
  let currentChordText = '';
  let chordFadeTimer = null;
  const chordNameEl = document.getElementById('chord-name');
  const chordTimelineEl = document.getElementById('chord-timeline');

  function resize() {
    width = window.innerWidth;
    height = window.innerHeight;
    canvas.width = width;
    canvas.height = height;

    // Resize offscreen canvas for heat shimmer
    if (!offscreenCanvas) {
      offscreenCanvas = document.createElement('canvas');
      offscreenCtx = offscreenCanvas.getContext('2d');
    }
    offscreenCanvas.width = width;
    offscreenCanvas.height = Math.ceil(height * 0.45);

    generateLandscape();
    generateStars();
    generateMilkyWayStars();
    generateClouds();
  }

  function generateLandscape() {
    landscape = [];
    const segments = Math.ceil(width / 4);
    for (let i = 0; i <= segments; i++) {
      const x = (i / segments) * width;
      // Layered sine waves for natural-looking hills
      const y = height * 0.7
        + Math.sin(i * 0.02) * height * 0.06
        + Math.sin(i * 0.005 + 1.5) * height * 0.08
        + Math.sin(i * 0.012 + 3) * height * 0.03;
      landscape.push({ x, y });
    }
  }

  function generateStars() {
    stars = [];
    for (let i = 0; i < 200; i++) {
      stars.push({
        x: Math.random() * width,
        y: Math.random() * height * 0.65,
        size: Math.random() * 1.5 + 0.5,
        twinkleSpeed: Math.random() * 0.02 + 0.005,
        phase: Math.random() * Math.PI * 2,
      });
    }
  }

  /**
   * Generate micro-stars scattered within the Milky Way band's local coordinate
   * space (centred on the band, before canvas rotation is applied). Fixed per
   * session so the band looks stable, but regenerated on resize.
   */
  function generateMilkyWayStars() {
    const bandW = width * 1.6;
    const bandH = height * 0.22;
    milkyWayStars = Array.from({ length: 300 }, () => ({
      x: (Math.random() - 0.5) * bandW,
      y: (Math.random() - 0.5) * bandH * 0.8,
      size: Math.random() < 0.85 ? 0.3 + Math.random() * 0.5 : 0.7 + Math.random() * 0.8,
      brightness: 0.3 + Math.random() * 0.7,
      twinkleSpeed: 0.002 + Math.random() * 0.008,
      phase: Math.random() * Math.PI * 2,
    }));
  }

  function generateClouds() {
    clouds = [];
    for (let i = 0; i < 8; i++) {
      clouds.push({
        x: Math.random() * width * 1.5 - width * 0.25,
        y: height * (0.08 + Math.random() * 0.25),
        width: 120 + Math.random() * 200,
        height: 30 + Math.random() * 40,
        speed: 0.1 + Math.random() * 0.3,
        opacity: 0.15 + Math.random() * 0.2,
        // Sub-ellipses for fluffy shape
        blobs: Array.from({ length: 3 + Math.floor(Math.random() * 3) }, () => ({
          xOff: (Math.random() - 0.5) * 0.8,
          yOff: (Math.random() - 0.5) * 0.4,
          scale: 0.4 + Math.random() * 0.6,
        })),
      });
    }
  }

  function initParticles() {
    particles = [];
    for (let i = 0; i < 60; i++) {
      particles.push(createParticle());
    }
  }

  function createParticle() {
    return {
      x: Math.random() * width,
      y: Math.random() * height * 0.7,
      size: Math.random() * 2 + 0.5,
      speedX: (Math.random() - 0.5) * 0.3,
      speedY: (Math.random() - 0.5) * 0.1,
      alpha: Math.random() * 0.3 + 0.1,
      pulse: Math.random() * Math.PI * 2,
    };
  }

  function createWeatherParticle() {
    const cat = state.weatherCategory;
    if (cat === 'rain' || cat === 'drizzle' || cat === 'storm') {
      return {
        type: 'rain',
        x: Math.random() * width,
        y: -10,
        speed: 4 + Math.random() * 8,
        length: 8 + Math.random() * 15,
        alpha: 0.15 + Math.random() * 0.2,
      };
    }
    if (cat === 'snow') {
      return {
        type: 'snow',
        x: Math.random() * width,
        y: -5,
        speed: 0.5 + Math.random() * 1.5,
        wobble: Math.random() * Math.PI * 2,
        size: 1 + Math.random() * 3,
        alpha: 0.3 + Math.random() * 0.4,
      };
    }
    return null;
  }

  // ── Dynamic Color Palette ──

  function generateColorPalette() {
    const timeColors = SKY_COLORS[state.timeOfDay] || SKY_COLORS.night;
    const shift = WEATHER_COLOR_SHIFT[state.weatherCategory] || WEATHER_COLOR_SHIFT.clear;

    const top = adjustColor(timeColors.top, shift);
    const bottom = adjustColor(timeColors.bottom, shift);

    // Golden-hour warmth tint
    let accentR = 120, accentG = 160, accentB = 255;
    if (state.filterWarmth > 0) {
      const w = state.filterWarmth;
      accentR = Math.round(120 + w * 135); // → 255
      accentG = Math.round(160 - w * 40);  // → 120
      accentB = Math.round(255 - w * 155);  // → 100
    }

    // AQI haze: desaturate and grey-shift
    if (state.aqiNorm > 0) {
      const h = state.aqiNorm * 0.4;
      const grey = 140;
      accentR = Math.round(accentR + (grey - accentR) * h);
      accentG = Math.round(accentG + (grey - accentG) * h);
      accentB = Math.round(accentB + (grey - accentB) * h);
    }

    // Snow: cool white tint
    if (state.weatherCategory === 'snow') {
      accentR = Math.round(accentR * 0.7 + 200 * 0.3);
      accentG = Math.round(accentG * 0.7 + 210 * 0.3);
      accentB = Math.round(accentB * 0.7 + 230 * 0.3);
    }

    // Storm: desaturate heavily
    if (state.weatherCategory === 'storm') {
      const avg = (accentR + accentG + accentB) / 3;
      accentR = Math.round(accentR * 0.4 + avg * 0.6);
      accentG = Math.round(accentG * 0.4 + avg * 0.6);
      accentB = Math.round(accentB * 0.4 + avg * 0.6);
    }

    // Set CSS custom properties for UI cohesion
    const root = document.documentElement;
    root.style.setProperty('--sky-top', `rgb(${top[0]}, ${top[1]}, ${top[2]})`);
    root.style.setProperty('--sky-bottom', `rgb(${bottom[0]}, ${bottom[1]}, ${bottom[2]})`);
    root.style.setProperty('--accent', `rgba(${accentR}, ${accentG}, ${accentB}, 0.6)`);
    root.style.setProperty('--accent-glow', `rgba(${accentR}, ${accentG}, ${accentB}, 0.3)`);

    return { top, bottom, accentR, accentG, accentB };
  }

  // --- Drawing Functions ---

  function drawSky() {
    const palette = generateColorPalette();
    const gradient = ctx.createLinearGradient(0, 0, 0, height);
    gradient.addColorStop(0, `rgb(${palette.top[0]}, ${palette.top[1]}, ${palette.top[2]})`);
    gradient.addColorStop(1, `rgb(${palette.bottom[0]}, ${palette.bottom[1]}, ${palette.bottom[2]})`);

    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);
  }

  function drawStars(fftData) {
    if (state.brightness > 0.5) return; // No stars during day
    const starAlpha = Math.max(0, (0.5 - state.brightness) * 2);

    // High-frequency energy (arpeggio range) drives star pulse amplitude
    const highFreqEnergy = fftData ? averageBins(fftData, 180, 256) : 0;

    for (const star of stars) {
      // Base twinkle + FFT boost on amplitude
      const twinkle = clamp(0.5 + Math.sin(time * star.twinkleSpeed + star.phase) * (0.5 + highFreqEnergy * 0.6), 0, 1);
      const alpha = starAlpha * twinkle * 0.8;
      if (alpha < 0.01) continue;
      ctx.beginPath();
      ctx.arc(star.x, star.y, star.size, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(255, 255, 240, ${alpha})`;
      ctx.fill();
    }
  }

  // ── Milky Way ──

  /**
   * Draw the Milky Way as a diagonal diffuse band across the upper sky.
   *
   * Visible only on clear, dark, moonless nights (same conditions that gate the
   * audio shimmer). Built from three layered gradient passes rendered in the
   * band's local coordinate space (canvas rotation trick), plus a scatter of
   * pre-generated micro-stars for stellar density texture.
   *
   * Layers (back to front):
   *  1. Outer diffuse glow — wide, very transparent cool blue-white
   *  2. Core band — narrower, brighter, warm near-white
   *  3. Dust lane — semi-transparent dark rift slightly off-centre
   *  4. Micro-star density dots — independently twinkling
   */
  function drawMilkyWay() {
    const intensity = state.milkyWayIntensity ?? 0;
    if (intensity <= 0.01) return;

    const baseAlpha = intensity * 0.55; // max composite opacity
    const cx = width * 0.5;
    const cy = height * 0.32; // vertical centre of band in sky
    const angle = Math.PI * 0.16; // ~29° from horizontal

    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(angle);

    const bandW = width * 1.65;   // length — wider than canvas to fill diagonal
    const bandH = height * 0.22;  // full height of the band

    // Layer 1 — outer diffuse glow
    const glowGrad = ctx.createLinearGradient(0, -bandH, 0, bandH);
    glowGrad.addColorStop(0,    `rgba(140, 155, 210, 0)`);
    glowGrad.addColorStop(0.25, `rgba(155, 170, 220, ${baseAlpha * 0.30})`);
    glowGrad.addColorStop(0.5,  `rgba(190, 200, 230, ${baseAlpha * 0.48})`);
    glowGrad.addColorStop(0.75, `rgba(155, 170, 220, ${baseAlpha * 0.30})`);
    glowGrad.addColorStop(1,    `rgba(140, 155, 210, 0)`);
    ctx.fillStyle = glowGrad;
    ctx.fillRect(-bandW / 2, -bandH, bandW, bandH * 2);

    // Layer 2 — bright core
    const coreH = bandH * 0.38;
    const coreGrad = ctx.createLinearGradient(0, -coreH, 0, coreH);
    coreGrad.addColorStop(0,   `rgba(215, 210, 240, 0)`);
    coreGrad.addColorStop(0.3, `rgba(232, 225, 248, ${baseAlpha * 0.62})`);
    coreGrad.addColorStop(0.5, `rgba(248, 244, 255, ${baseAlpha * 0.78})`);
    coreGrad.addColorStop(0.7, `rgba(232, 225, 248, ${baseAlpha * 0.62})`);
    coreGrad.addColorStop(1,   `rgba(215, 210, 240, 0)`);
    ctx.fillStyle = coreGrad;
    ctx.fillRect(-bandW / 2, -coreH, bandW, coreH * 2);

    // Layer 3 — dust lane (the Great Rift — dark interstellar dust slightly off-centre)
    const dustOff = coreH * 0.18;
    const dustH   = coreH * 0.32;
    const dustGrad = ctx.createLinearGradient(0, dustOff - dustH, 0, dustOff + dustH);
    dustGrad.addColorStop(0,   `rgba(0, 0, 8, 0)`);
    dustGrad.addColorStop(0.35, `rgba(0, 0, 8, ${baseAlpha * 0.22})`);
    dustGrad.addColorStop(0.65, `rgba(0, 0, 8, ${baseAlpha * 0.22})`);
    dustGrad.addColorStop(1,   `rgba(0, 0, 8, 0)`);
    ctx.fillStyle = dustGrad;
    ctx.fillRect(-bandW / 2, dustOff - dustH, bandW, dustH * 2);

    // Layer 4 — micro-star density scatter
    for (const mstar of milkyWayStars) {
      const twinkle = 0.55 + Math.sin(time * mstar.twinkleSpeed + mstar.phase) * 0.45;
      const a = baseAlpha * twinkle * mstar.brightness;
      if (a < 0.01) continue;
      ctx.beginPath();
      ctx.arc(mstar.x, mstar.y, mstar.size, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(240, 238, 255, ${a})`;
      ctx.fill();
    }

    ctx.restore();
  }

  // ── Shooting Stars ──

  /**
   * Returns the next shooting star interval in ms.
   * At full intensity (1.0): 45–120 seconds.
   * At partial intensity the interval stretches inversely — rarer in faint skies.
   */
  function getShootingStarInterval() {
    const base = 45000 + Math.random() * 75000;
    return base / Math.max(0.15, state.milkyWayIntensity ?? 0);
  }

  /**
   * Spawn a single meteor streak and notify the audio callback.
   * The streak runs diagonally (mostly left-to-right, rarely right-to-left).
   */
  function spawnShootingStar() {
    const goLeft = Math.random() < 0.25; // 25% chance of leftward streak
    const speedBase = 5 + Math.random() * 4;
    const angle = (goLeft ? Math.PI - 0.2 : 0.2) + (Math.random() - 0.5) * 0.35;

    shootingStars.push({
      x:     Math.random() * width,
      y:     Math.random() * height * 0.42, // upper 42% of sky
      dx:    Math.cos(angle) * speedBase,
      dy:    Math.sin(angle) * speedBase,
      trail: 90 + Math.random() * 110,     // trail length in px
      life:  1.0,                           // fades 1 → 0
      decay: 0.022 + Math.random() * 0.018, // per-frame fade rate
    });

    // Fire audio ding immediately when the streak begins
    if (shootingStarCallback) shootingStarCallback();
  }

  function scheduleShootingStar() {
    if ((state.milkyWayIntensity ?? 0) <= 0.1) return;
    shootingStarTimer = setTimeout(() => {
      if ((state.milkyWayIntensity ?? 0) > 0.1) {
        spawnShootingStar();
        scheduleShootingStar(); // recursive — schedule next one
      }
    }, getShootingStarInterval());
  }

  function stopShootingStars() {
    if (shootingStarTimer) {
      clearTimeout(shootingStarTimer);
      shootingStarTimer = null;
    }
    shootingStars = [];
  }

  /**
   * Draw all active shooting stars and advance their animation state.
   * Each star is a gradient-stroked line: transparent tail → bright tip.
   */
  function drawShootingStars() {
    if (shootingStars.length === 0) return;
    const intensity = state.milkyWayIntensity ?? 0;

    for (let i = shootingStars.length - 1; i >= 0; i--) {
      const s = shootingStars[i];
      s.x    += s.dx;
      s.y    += s.dy;
      s.life -= s.decay;

      if (s.life <= 0) { shootingStars.splice(i, 1); continue; }

      // Alpha scales with life and sky darkness — fainter in dim conditions
      const alpha = s.life * (intensity * 0.8 + 0.2);

      // Tail starts behind the tip by `trail` pixels
      const tailX = s.x - s.dx * (s.trail / Math.hypot(s.dx, s.dy));
      const tailY = s.y - s.dy * (s.trail / Math.hypot(s.dx, s.dy));

      const grad = ctx.createLinearGradient(tailX, tailY, s.x, s.y);
      grad.addColorStop(0,   `rgba(255, 255, 255, 0)`);
      grad.addColorStop(0.5, `rgba(220, 230, 255, ${alpha * 0.35})`);
      grad.addColorStop(1,   `rgba(255, 255, 255, ${alpha})`);

      ctx.beginPath();
      ctx.moveTo(tailX, tailY);
      ctx.lineTo(s.x, s.y);
      ctx.strokeStyle = grad;
      ctx.lineWidth = 1.5;
      ctx.stroke();

      // Bright tip dot
      ctx.beginPath();
      ctx.arc(s.x, s.y, 1.2, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(255, 255, 255, ${alpha})`;
      ctx.fill();
    }
  }

  /**
   * Compute the canvas (x, y) for a celestial body given its rise/set times.
   * The body traces a dome arc: rises left (~15% from left edge), peaks at center-top,
   * sets right (~85% from left). Returns null if the body is below the horizon.
   *
   * @param {Date|null} rise  - Rise time
   * @param {Date|null} set   - Set time
   * @param {number}    topFraction - How high the peak reaches (0=top edge, 1=horizon)
   * @returns {{ x: number, y: number, t: number }|null}
   */
  function celestialPosition(rise, set, topFraction = 0.12) {
    if (!rise || !set) return null;

    const now = Date.now();
    const riseMs = rise.getTime();
    const setMs = set.getTime();

    if (now < riseMs || now > setMs) return null; // Below horizon

    const t = (now - riseMs) / (setMs - riseMs); // 0 (rise) → 1 (set)

    // Horizontal: rises at ~15% from left, sets at ~85% from left
    const x = width * (0.15 + t * 0.7);

    // Vertical: sine arc — sin(0)=0 at horizon, sin(π/2)=1 at peak, sin(π)=0 at horizon
    // topFraction controls how high the peak is as a fraction of sky height (canvas top = 0)
    const skyHeight = height * 0.68; // Landscape baseline
    const peakY = height * topFraction;
    const horizonY = skyHeight * 0.08; // Slightly above landscape

    // Arc: y = horizonY at t=0 and t=1, peaks at peakY at t=0.5
    const sinArc = Math.sin(t * Math.PI);
    const y = horizonY + (peakY - horizonY) * sinArc;

    return { x, y, t };
  }

  function drawSun() {
    if (state.brightness < 0.15) return; // Sun not visible at night

    const pos = celestialPosition(state.sunrise, state.sunset, 0.10);
    if (!pos) return;

    const { x: sunX, y: sunY, t } = pos;
    const sunR = 28;

    // Sun alpha: fade in near horizon (t near 0 or 1) and at low brightness
    const horizonFade = Math.min(t * 6, 1) * Math.min((1 - t) * 6, 1); // Fade within first/last 1/6
    const sunAlpha = clamp(horizonFade * state.brightness * 1.2, 0, 1);

    // Sun color shifts with time of day
    // Near horizon (t < 0.15 or t > 0.85): deep orange-red
    // Midday: bright warm yellow-white
    const sunR_col = Math.round(255);
    const sunG_col = Math.round(lerp(120, 255, horizonFade));  // Orange→Yellow
    const sunB_col = Math.round(lerp(20, 200, horizonFade));   // Red-orange→White

    // Weather mutes the sun (storm/fog = faint and diffuse)
    const weatherAttenuation = { clear: 1.0, cloudy: 0.6, fog: 0.3, drizzle: 0.5, rain: 0.4, snow: 0.5, storm: 0.2 };
    const attenuation = weatherAttenuation[state.weatherCategory] ?? 1.0;
    const finalAlpha = sunAlpha * attenuation;

    if (finalAlpha < 0.02) return;

    // Outer atmospheric glow (large, very diffuse)
    const glowRadius = sunR * (state.weatherCategory === 'clear' ? 5 : 8);
    const outerGlow = ctx.createRadialGradient(sunX, sunY, sunR * 0.5, sunX, sunY, glowRadius);
    outerGlow.addColorStop(0, `rgba(${sunR_col}, ${sunG_col}, ${sunB_col}, ${finalAlpha * 0.25})`);
    outerGlow.addColorStop(1, `rgba(${sunR_col}, ${sunG_col}, 0, 0)`);
    ctx.fillStyle = outerGlow;
    ctx.fillRect(sunX - glowRadius, sunY - glowRadius, glowRadius * 2, glowRadius * 2);

    // Inner corona glow
    const coronaRadius = sunR * 2.5;
    const coronaGlow = ctx.createRadialGradient(sunX, sunY, sunR * 0.8, sunX, sunY, coronaRadius);
    coronaGlow.addColorStop(0, `rgba(${sunR_col}, ${sunG_col}, ${sunB_col}, ${finalAlpha * 0.5})`);
    coronaGlow.addColorStop(1, `rgba(${sunR_col}, ${sunG_col}, 0, 0)`);
    ctx.fillStyle = coronaGlow;
    ctx.fillRect(sunX - coronaRadius, sunY - coronaRadius, coronaRadius * 2, coronaRadius * 2);

    // Sun disc
    ctx.beginPath();
    ctx.arc(sunX, sunY, sunR, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(${sunR_col}, ${sunG_col}, ${sunB_col}, ${finalAlpha * 0.95})`;
    ctx.fill();
  }

  function drawMoon() {
    if (state.brightness > 0.6) return; // Moon not visible during bright day

    const moonAlpha = Math.max(0, (0.6 - state.brightness) * 2) * 0.9;

    // Use arc position if moonrise/moonset are available, otherwise fall back to fixed position
    const pos = celestialPosition(state.moonrise, state.moonset, 0.12);
    const moonX = pos ? pos.x : width * 0.75;
    const moonY = pos ? pos.y : height * 0.15;
    const moonR = 25;

    // Glow
    const glowR = moonR * (2 + state.moonFullness * 2);
    const glow = ctx.createRadialGradient(moonX, moonY, moonR, moonX, moonY, glowR);
    glow.addColorStop(0, `rgba(200, 210, 255, ${moonAlpha * 0.15 * state.moonFullness})`);
    glow.addColorStop(1, 'rgba(200, 210, 255, 0)');
    ctx.fillStyle = glow;
    ctx.fillRect(moonX - glowR, moonY - glowR, glowR * 2, glowR * 2);

    // Moon disc
    ctx.beginPath();
    ctx.arc(moonX, moonY, moonR, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(220, 225, 240, ${moonAlpha * 0.9})`;
    ctx.fill();

    // Phase shadow (simple crescent approximation)
    const phase = state.moonPhase;
    const shadowOffsetX = moonR * 2 * (phase < 0.5 ? (1 - phase * 2) : (phase * 2 - 1));
    const shadowSide = phase < 0.5 ? 1 : -1;

    ctx.save();
    ctx.beginPath();
    ctx.arc(moonX, moonY, moonR, 0, Math.PI * 2);
    ctx.clip();

    ctx.beginPath();
    ctx.ellipse(
      moonX + shadowSide * shadowOffsetX * 0.5,
      moonY,
      Math.abs(moonR - Math.abs(shadowOffsetX) * 0.3),
      moonR,
      0, 0, Math.PI * 2
    );
    const skyColor = SKY_COLORS[state.timeOfDay] || SKY_COLORS.night;
    ctx.fillStyle = `rgba(${skyColor.top[0]}, ${skyColor.top[1]}, ${skyColor.top[2]}, ${moonAlpha * 0.85})`;
    ctx.fill();
    ctx.restore();
  }

  function drawAurora() {
    if (state.sunTransition <= 0) return;

    const intensity = state.sunTransition;
    const isNearSunrise = state.timeOfDay === 'dawn' || state.timeOfDay === 'morning';
    const hueBase = isNearSunrise ? 30 : 280; // Warm for sunrise, purple for sunset

    for (let i = 0; i < 3; i++) {
      const y = height * (0.1 + i * 0.08);
      const waveHeight = height * 0.06 * intensity;

      ctx.beginPath();
      ctx.moveTo(0, y);

      for (let x = 0; x <= width; x += 8) {
        const wave = Math.sin(x * 0.003 + time * 0.3 + i * 1.5) * waveHeight;
        ctx.lineTo(x, y + wave);
      }

      ctx.lineTo(width, y + waveHeight * 2);
      ctx.lineTo(0, y + waveHeight * 2);
      ctx.closePath();

      const hue = hueBase + i * 20;
      ctx.fillStyle = `hsla(${hue}, 70%, 60%, ${intensity * 0.08})`;
      ctx.fill();
    }
  }

  // ── Animated Cloud Layer ──

  function drawClouds() {
    const cloudOpacityBase = (state.cloudCover / 100) * 0.35;
    if (cloudOpacityBase < 0.01) return; // No clouds to draw

    const windDrift = state.windSpeed * 0.008 * Math.cos((state.windDirection * Math.PI) / 180);

    for (const cloud of clouds) {
      // Drift with wind
      cloud.x += cloud.speed + windDrift;

      // Wrap around
      if (cloud.x > width + cloud.width) {
        cloud.x = -cloud.width;
      } else if (cloud.x < -cloud.width * 1.5) {
        cloud.x = width + cloud.width * 0.5;
      }

      const alpha = cloud.opacity * cloudOpacityBase;
      if (alpha < 0.005) continue;

      // Determine cloud color based on time/weather
      let cloudR = 200, cloudG = 210, cloudB = 220;
      if (state.timeOfDay === 'night') {
        cloudR = 30; cloudG = 35; cloudB = 50;
      } else if (state.timeOfDay === 'dawn' || state.timeOfDay === 'dusk') {
        cloudR = 180; cloudG = 140; cloudB = 120;
      }
      if (state.weatherCategory === 'storm') {
        cloudR = Math.round(cloudR * 0.4);
        cloudG = Math.round(cloudG * 0.4);
        cloudB = Math.round(cloudB * 0.45);
      }

      // Draw fluffy cloud from overlapping ellipses
      for (const blob of cloud.blobs) {
        const bx = cloud.x + blob.xOff * cloud.width;
        const by = cloud.y + blob.yOff * cloud.height;
        const bw = cloud.width * blob.scale * 0.5;
        const bh = cloud.height * blob.scale * 0.5;

        ctx.beginPath();
        ctx.ellipse(bx, by, bw, bh, 0, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${cloudR}, ${cloudG}, ${cloudB}, ${alpha})`;
        ctx.fill();
      }
    }
  }

  function drawWeatherParticles() {
    const cat = state.weatherCategory;
    const needParticles = ['rain', 'drizzle', 'storm', 'snow'].includes(cat);
    const targetCount = cat === 'storm' ? 300 : cat === 'rain' ? 150 : cat === 'drizzle' ? 50 : cat === 'snow' ? 100 : 0;

    // Add new particles
    while (needParticles && weatherParticles.length < targetCount) {
      const p = createWeatherParticle();
      if (p) weatherParticles.push(p);
    }

    // Update and draw
    for (let i = weatherParticles.length - 1; i >= 0; i--) {
      const p = weatherParticles[i];

      if (p.type === 'rain') {
        p.y += p.speed;
        p.x += state.windSpeed * 0.05;

        if (p.y > height) {
          weatherParticles.splice(i, 1);
          // Spawn splash impact ripple at landscape baseline
          if (splashes.length < 80) {
            splashes.push({ x: p.x, y: height * 0.87, r: 0, alpha: 0.35 });
          }
          continue;
        }

        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x + state.windSpeed * 0.03, p.y - p.length);
        ctx.strokeStyle = `rgba(180, 200, 255, ${p.alpha})`;
        ctx.lineWidth = 1;
        ctx.stroke();
      }

      if (p.type === 'snow') {
        p.y += p.speed;
        p.wobble += 0.02;
        p.x += Math.sin(p.wobble) * 0.5 + state.windSpeed * 0.02;

        if (p.y > height * 0.75) {
          weatherParticles.splice(i, 1);
          continue;
        }

        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(240, 245, 255, ${p.alpha})`;
        ctx.fill();
      }
    }

    // Fog effect
    if (cat === 'fog') {
      for (let i = 0; i < 3; i++) {
        const y = height * (0.3 + i * 0.15);
        const alpha = 0.04 + Math.sin(time * 0.1 + i) * 0.02;
        ctx.fillStyle = `rgba(180, 190, 200, ${alpha})`;
        ctx.fillRect(0, y, width, height * 0.15);
      }
    }
  }

  // ── Rain Splash Ripples ──

  function drawSplashes() {
    for (let i = splashes.length - 1; i >= 0; i--) {
      const s = splashes[i];
      s.r += 0.8;
      s.alpha *= 0.88;
      if (s.alpha < 0.01) { splashes.splice(i, 1); continue; }
      ctx.beginPath();
      ctx.ellipse(s.x, s.y, s.r, s.r * 0.3, 0, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(180, 200, 255, ${s.alpha})`;
      ctx.lineWidth = 0.8;
      ctx.stroke();
    }
  }

  // ── Firefly Particles ──

  function updateFireflies(active) {
    if (!active) { fireflies = []; return; }
    while (fireflies.length < MAX_FIREFLIES) {
      fireflies.push({
        x: Math.random() * width,
        y: height * 0.45 + Math.random() * height * 0.45,
        phase: Math.random() * Math.PI * 2,
        speed: 0.004 + Math.random() * 0.006,
        drift: (Math.random() - 0.5) * 0.4,
        size: 1.5 + Math.random() * 2,
      });
    }
  }

  function drawFireflies() {
    if (fireflies.length === 0) return;
    const isWarm = (state.temperature ?? 0) > 15;
    const isNight = state.brightness < 0.25;
    const isClear = state.weatherCategory === 'clear' || state.weatherCategory === 'cloudy';
    if (!isWarm || !isNight || !isClear) return;

    for (const f of fireflies) {
      f.phase += f.speed;
      f.x += f.drift;
      if (f.x < 0) f.x = width;
      if (f.x > width) f.x = 0;

      const glow = Math.pow(Math.max(0, Math.sin(f.phase)), 3);
      if (glow < 0.01) continue;

      const radius = f.size * 4;
      const grad = ctx.createRadialGradient(f.x, f.y, 0, f.x, f.y, radius);
      grad.addColorStop(0, `rgba(200, 255, 130, ${glow * 0.9})`);
      grad.addColorStop(0.3, `rgba(160, 240, 80, ${glow * 0.4})`);
      grad.addColorStop(1, 'rgba(160, 240, 80, 0)');
      ctx.beginPath();
      ctx.arc(f.x, f.y, radius, 0, Math.PI * 2);
      ctx.fillStyle = grad;
      ctx.fill();
    }
  }

  // ── Snow Accumulation ──

  /**
   * Draws a snow pile that grows upward from the landscape during snowfall.
   * The pile follows the terrain with per-column bumps, filled with a white
   * gradient whose opacity scales with the accumulation level.
   */
  function drawSnowAccumulation() {
    // Update accumulation level
    if (state.weatherCategory === 'snow') {
      snowAccumulation = Math.min(1, snowAccumulation + 0.00003);
    } else {
      snowAccumulation = Math.max(0, snowAccumulation - 0.00001);
    }
    if (snowAccumulation < 0.01 || landscape.length < 2) return;

    const pileMaxHeight = height * 0.04 * snowAccumulation;

    ctx.beginPath();
    // Start at the first landscape point
    ctx.moveTo(landscape[0].x, landscape[0].y);

    // Draw the top edge of the snow pile (slightly lumpy, following terrain)
    for (let i = 0; i < landscape.length; i++) {
      const pt = landscape[i];
      const bump = Math.sin(pt.x * 0.02 + 1.5) * pileMaxHeight * 0.35;
      ctx.lineTo(pt.x, pt.y - pileMaxHeight + bump);
    }

    // Walk back along the landscape for the bottom edge of the pile
    for (let i = landscape.length - 1; i >= 0; i--) {
      ctx.lineTo(landscape[i].x, landscape[i].y);
    }
    ctx.closePath();

    const snowGradient = ctx.createLinearGradient(0, 0, 0, height);
    snowGradient.addColorStop(0, `rgba(240, 245, 255, 0)`);
    snowGradient.addColorStop(0.6, `rgba(240, 245, 255, ${snowAccumulation * 0.75})`);
    snowGradient.addColorStop(1, `rgba(255, 255, 255, ${snowAccumulation * 0.9})`);
    ctx.fillStyle = snowGradient;
    ctx.fill();
  }

  // ── Heat Shimmer ──

  /**
   * Applies a sinusoidal horizontal displacement to the bottom 45% of the frame,
   * simulating the rising heat distortion visible above hot surfaces.
   * Active when temperature > 30°C in clear or cloudy conditions.
   */
  function applyHeatShimmer() {
    const isHot = (state.temperature ?? 0) > 30;
    const isClear = state.weatherCategory === 'clear' || state.weatherCategory === 'cloudy';
    if (!isHot || !isClear || !offscreenCanvas) return;

    const intensity = clamp(((state.temperature ?? 30) - 30) / 10, 0, 1);
    if (intensity < 0.01) return;

    const stripH = Math.ceil(height * 0.45);
    const srcY = height - stripH;

    // Capture the rendered bottom region to the offscreen canvas
    offscreenCtx.clearRect(0, 0, width, stripH);
    offscreenCtx.drawImage(canvas, 0, srcY, width, stripH, 0, 0, width, stripH);

    // Redraw back with per-strip sinusoidal displacement
    const stripSize = 4;
    for (let y = 0; y < stripH; y += stripSize) {
      const displacement = Math.sin(shimmerPhase + y * 0.4) * intensity * 3;
      ctx.drawImage(
        offscreenCanvas,
        0, y, width, Math.min(stripSize, stripH - y),
        displacement, srcY + y, width, Math.min(stripSize, stripH - y)
      );
    }

    shimmerPhase += 0.02;
  }

  // ── Lightning Flash ──

  function scheduleLightning() {
    if (state.weatherCategory !== 'storm') return;
    const delay = 8000 + Math.random() * 27000; // 8–35 seconds between flashes
    lightningTimer = setTimeout(() => {
      if (state.weatherCategory !== 'storm') return;
      // Notify audio engine so it can trigger a thunder transient in sync
      if (lightningCallback) lightningCallback();
      // Trigger double flash: initial bright, short gap, secondary weaker flash
      lightningAlpha = 0.85;
      setTimeout(() => {
        lightningAlpha = 0;
        setTimeout(() => {
          lightningAlpha = 0.4;
          setTimeout(() => {
            lightningAlpha = 0;
          }, 80);
        }, 25);
      }, 50);
      // Schedule next
      scheduleLightning();
    }, delay);
  }

  function stopLightning() {
    if (lightningTimer) {
      clearTimeout(lightningTimer);
      lightningTimer = null;
    }
    lightningAlpha = 0;
  }

  function drawLightning() {
    if (lightningAlpha <= 0.01) {
      lightningAlpha = 0;
      return;
    }
    ctx.fillStyle = `rgba(255, 255, 255, ${lightningAlpha})`;
    ctx.fillRect(0, 0, width, height);
    lightningAlpha *= 0.85; // Exponential decay
  }

  // ── Waveform-Reactive Landscape ──

  function drawLandscape(waveformData) {
    if (landscape.length < 2) return;

    ctx.beginPath();
    ctx.moveTo(landscape[0].x, landscape[0].y);

    for (let i = 1; i < landscape.length; i++) {
      let y = landscape[i].y;

      // Waveform displacement: map landscape points to waveform samples
      if (waveformData) {
        const sampleIndex = Math.floor((i / landscape.length) * waveformData.length);
        const sample = waveformData[sampleIndex] || 0;
        // ±3px Y displacement for a subtle breathing effect
        y += sample * 3;
      }

      ctx.lineTo(landscape[i].x, y);
    }
    ctx.lineTo(width, height);
    ctx.lineTo(0, height);
    ctx.closePath();

    // Dark silhouette with slight color variation by time
    const colors = SKY_COLORS[state.timeOfDay] || SKY_COLORS.night;
    const r = Math.max(0, colors.bottom[0] * 0.2);
    const g = Math.max(0, colors.bottom[1] * 0.2);
    const b = Math.max(0, colors.bottom[2] * 0.2);
    ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
    ctx.fill();
  }

  function drawWaterWave(fftData) {
    const baseY = getWaterlineY();
    const waveAmplitude = 4 + (state.tideLevel != null ? state.tideLevel * 0.8 : 2);

    // Use low-frequency FFT bins for wave motion
    const bassEnergy = fftData ? averageBins(fftData, 0, 8) : 0;
    const ampMod = 1 + bassEnergy * 3;

    ctx.beginPath();
    ctx.moveTo(0, baseY);

    for (let x = 0; x <= width; x += 3) {
      const wave1 = Math.sin(x * 0.008 + time * 0.8) * waveAmplitude * ampMod;
      const wave2 = Math.sin(x * 0.015 + time * 1.2 + 1) * waveAmplitude * 0.5 * ampMod;
      ctx.lineTo(x, baseY + wave1 + wave2);
    }

    ctx.lineTo(width, height);
    ctx.lineTo(0, height);
    ctx.closePath();

    const waterColor = state.timeOfDay === 'night'
      ? 'rgba(10, 15, 30, 0.6)'
      : 'rgba(30, 50, 80, 0.4)';
    ctx.fillStyle = waterColor;
    ctx.fill();

    // Subtle wave line highlight
    ctx.beginPath();
    ctx.moveTo(0, baseY);
    for (let x = 0; x <= width; x += 3) {
      const wave1 = Math.sin(x * 0.008 + time * 0.8) * waveAmplitude * ampMod;
      const wave2 = Math.sin(x * 0.015 + time * 1.2 + 1) * waveAmplitude * 0.5 * ampMod;
      ctx.lineTo(x, baseY + wave1 + wave2);
    }
    ctx.strokeStyle = `rgba(150, 180, 220, ${0.1 + bassEnergy * 0.2})`;
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  function getWaterlineY() {
    return height * 0.88;
  }

  function drawParticles(fftData) {
    const midEnergy = fftData ? averageBins(fftData, 8, 32) : 0;

    for (const p of particles) {
      // Move with wind
      p.x += p.speedX + state.windSpeed * 0.015 * Math.sin((state.windDirection * Math.PI) / 180);
      p.y += p.speedY;
      p.pulse += 0.02;

      // Wrap around
      if (p.x > width) p.x = 0;
      if (p.x < 0) p.x = width;
      if (p.y > height * 0.7) p.y = 0;
      if (p.y < 0) p.y = height * 0.7;

      // Pulse with mid-frequency audio
      const audioPulse = 1 + midEnergy * 2;
      const alpha = p.alpha * (0.7 + Math.sin(p.pulse) * 0.3) * audioPulse;

      ctx.beginPath();
      ctx.arc(p.x, p.y, Math.max(0, p.size * audioPulse), 0, Math.PI * 2);
      ctx.fillStyle = `rgba(200, 210, 240, ${Math.min(alpha, 0.6)})`;
      ctx.fill();
    }
  }

  // ── Chord Display ──

  function updateChordDisplay(chordInfo) {
    if (!chordNameEl || !chordTimelineEl) return;

    const qualityLabel = QUALITY_NAMES[chordInfo.quality] || chordInfo.quality;
    const newText = `${chordInfo.rootName}${qualityLabel}`;

    // Store allQualities for dot coloring
    if (chordInfo.allQualities?.length > 0) {
      currentAllQualities = chordInfo.allQualities;
    }

    // Fade transition
    chordNameEl.classList.remove('fade-in');
    chordNameEl.classList.add('fade-out');

    clearTimeout(chordFadeTimer);
    chordFadeTimer = setTimeout(() => {
      chordNameEl.textContent = newText;
      // Apply quality-based color
      chordNameEl.style.color = QUALITY_COLORS[chordInfo.quality] || 'rgba(255, 255, 255, 0.9)';
      chordNameEl.classList.remove('fade-out');
      chordNameEl.classList.add('fade-in');
      currentChordText = newText;
    }, 200);

    // Update timeline dots
    updateTimelineDots(chordInfo.index, chordInfo.total);
  }

  function updateTimelineDots(currentIndex, total) {
    if (!chordTimelineEl) return;

    // Rebuild dots if count changed (with smooth transition)
    const existingDots = chordTimelineEl.children.length;
    if (existingDots !== total) {
      // Fade out old dots
      chordTimelineEl.classList.add('transitioning');
      setTimeout(() => {
        chordTimelineEl.innerHTML = '';
        for (let i = 0; i < total; i++) {
          const dot = document.createElement('div');
          dot.className = 'dot';
          if (currentAllQualities[i]) {
            dot.setAttribute('data-quality', currentAllQualities[i]);
          }
          chordTimelineEl.appendChild(dot);
        }
        // Apply current state to new dots
        applyDotStates(currentIndex);
        // Fade in new dots
        chordTimelineEl.classList.remove('transitioning');
      }, 300);
      return;
    }

    applyDotStates(currentIndex);
  }

  function applyDotStates(currentIndex) {
    for (let i = 0; i < chordTimelineEl.children.length; i++) {
      const dot = chordTimelineEl.children[i];
      // Preserve data-quality attribute when resetting class
      const quality = dot.getAttribute('data-quality') || currentAllQualities[i];
      dot.className = 'dot';
      if (quality) dot.setAttribute('data-quality', quality);
      if (i === currentIndex) {
        dot.classList.add('active');
      } else if (i < currentIndex) {
        dot.classList.add('past');
      }
    }
  }

  // --- Main Loop ---

  function draw() {
    const fftData = analyser ? analyser.getValue() : null;
    const waveformData = waveformAnalyser ? waveformAnalyser.getValue() : null;

    // Full redraw
    drawSky();
    drawStars(fftData);
    drawMilkyWay();      // Galactic band — behind celestial bodies and clouds
    drawShootingStars(); // Meteor streaks — same dark-sky conditions
    drawSun();
    drawMoon();
    drawAurora();
    drawClouds();
    drawWeatherParticles();
    drawSplashes();
    drawFireflies();
    drawParticles(fftData);
    drawLandscape(waveformData);
    drawSnowAccumulation();
    drawWaterWave(fftData);
    // Lightning overlay — on top of everything (storm only)
    drawLightning();
    // Heat shimmer — applied last, displaces the already-rendered frame
    applyHeatShimmer();

    time += 0.016;
    animFrame = requestAnimationFrame(draw);
  }

  // --- Utilities ---

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function lerp(a, b, t) {
    return a + (b - a) * t;
  }

  function adjustColor(color, shift) {
    return [
      Math.round(color[0] * shift.bright),
      Math.round(color[1] * shift.bright * shift.sat),
      Math.round(color[2] * shift.bright),
    ];
  }

  function averageBins(data, start, end) {
    let sum = 0;
    const e = Math.min(end, data.length);
    for (let i = start; i < e; i++) {
      // Clamp to [-140, 0] dB before normalizing — analyser can return -Infinity
      // at startup (no audio yet), which would produce negative energy values and
      // cause arc() to receive a negative radius, throwing IndexSizeError.
      sum += clamp((data[i] + 140) / 140, 0, 1);
    }
    return sum / (e - start);
  }

  // --- Public API ---

  resize();
  window.addEventListener('resize', resize);
  initParticles();

  return {
    start() {
      if (!animFrame) draw();
    },

    stop() {
      if (animFrame) {
        cancelAnimationFrame(animFrame);
        animFrame = null;
      }
    },

    /**
     * Update visualization state from weather/music data.
     */
    updateState(newState) {
      const prevCategory = state.weatherCategory;
      const prevMilkyWayIntensity = state.milkyWayIntensity ?? 0;
      Object.assign(state, newState);

      // Start/stop lightning based on storm state
      if (newState.weatherCategory !== undefined) {
        if (newState.weatherCategory === 'storm' && prevCategory !== 'storm') {
          scheduleLightning();
        } else if (newState.weatherCategory !== 'storm' && prevCategory === 'storm') {
          stopLightning();
        }
      }

      // Start/stop shooting star scheduling based on Milky Way visibility
      if (newState.milkyWayIntensity !== undefined) {
        const intensity = newState.milkyWayIntensity;
        if (intensity > 0.1 && prevMilkyWayIntensity <= 0.1) {
          scheduleShootingStar(); // conditions became favourable
        } else if (intensity <= 0.1 && prevMilkyWayIntensity > 0.1) {
          stopShootingStars();    // sky no longer dark/clear enough
        }
      }

      // Update firefly population when conditions change
      if (newState.weatherCategory !== undefined || newState.brightness !== undefined || newState.temperature !== undefined) {
        const isWarm = (state.temperature ?? 0) > 15;
        const isNight = state.brightness < 0.25;
        const isClear = state.weatherCategory === 'clear' || state.weatherCategory === 'cloudy';
        updateFireflies(isWarm && isNight && isClear);
      }
    },

    /**
     * Register a callback to fire when a lightning flash triggers.
     * Used to synchronise audio thunder with the visual flash.
     * @param {Function} fn - Called with no arguments on each flash
     */
    onLightning(fn) {
      lightningCallback = fn;
    },

    /**
     * Register a callback to fire when a shooting star spawns.
     * Used to trigger a soft audio ding in sync with the visual streak.
     * @param {Function} fn - Called with no arguments on each meteor
     */
    onShootingStar(fn) {
      shootingStarCallback = fn;
    },

    /**
     * Called by engine on chord change — updates chord name display + timeline.
     */
    onChordChange(chordInfo) {
      updateChordDisplay(chordInfo);
    },

    dispose() {
      this.stop();
      window.removeEventListener('resize', resize);
      clearTimeout(chordFadeTimer);
      stopLightning();
      stopShootingStars();
    },
  };
}
