/**
 * Canvas-based generative visualization.
 *
 * Layers (back to front):
 *   1. Sky gradient (shifts with time of day)
 *   2. Stars (visible at night)
 *   3. Moon (correct phase, with glow)
 *   4. Aurora/shimmer (near sunrise/sunset)
 *   5. Weather particles (rain, snow, fog, or clear)
 *   6. Landscape silhouette (procedural hills)
 *   7. Water/wave line at base (tide + bass FFT)
 *   8. Atmospheric particles (drift with wind, pulse with audio)
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
  };

  // Particles
  let particles = [];
  let weatherParticles = [];
  let stars = [];

  // Landscape
  let landscape = [];

  function resize() {
    width = window.innerWidth;
    height = window.innerHeight;
    canvas.width = width;
    canvas.height = height;
    generateLandscape();
    generateStars();
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

  // --- Drawing Functions ---

  function drawSky() {
    const timeColors = SKY_COLORS[state.timeOfDay] || SKY_COLORS.night;
    const shift = WEATHER_COLOR_SHIFT[state.weatherCategory] || WEATHER_COLOR_SHIFT.clear;

    const gradient = ctx.createLinearGradient(0, 0, 0, height);
    const top = adjustColor(timeColors.top, shift);
    const bottom = adjustColor(timeColors.bottom, shift);

    gradient.addColorStop(0, `rgb(${top[0]}, ${top[1]}, ${top[2]})`);
    gradient.addColorStop(1, `rgb(${bottom[0]}, ${bottom[1]}, ${bottom[2]})`);

    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);
  }

  function drawStars() {
    if (state.brightness > 0.5) return; // No stars during day
    const starAlpha = Math.max(0, (0.5 - state.brightness) * 2);

    for (const star of stars) {
      const twinkle = 0.5 + Math.sin(time * star.twinkleSpeed + star.phase) * 0.5;
      const alpha = starAlpha * twinkle * 0.8;
      ctx.beginPath();
      ctx.arc(star.x, star.y, star.size, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(255, 255, 240, ${alpha})`;
      ctx.fill();
    }
  }

  function drawMoon() {
    if (state.brightness > 0.6) return; // Moon not visible during bright day

    const moonAlpha = Math.max(0, (0.6 - state.brightness) * 2) * 0.9;
    const moonX = width * 0.75;
    const moonY = height * 0.15;
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

  function drawLandscape() {
    if (landscape.length < 2) return;

    ctx.beginPath();
    ctx.moveTo(landscape[0].x, landscape[0].y);
    for (let i = 1; i < landscape.length; i++) {
      ctx.lineTo(landscape[i].x, landscape[i].y);
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
    const baseY = height * 0.88;
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
      ctx.arc(p.x, p.y, p.size * audioPulse, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(200, 210, 240, ${Math.min(alpha, 0.6)})`;
      ctx.fill();
    }
  }

  // --- Main Loop ---

  function draw() {
    const fftData = analyser ? analyser.getValue() : null;

    // Full redraw (no trail for cleaner look with landscape)
    drawSky();
    drawStars();
    drawMoon();
    drawAurora();
    drawWeatherParticles();
    drawParticles(fftData);
    drawLandscape();
    drawWaterWave(fftData);

    time += 0.016;
    animFrame = requestAnimationFrame(draw);
  }

  // --- Utilities ---

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
      sum += (data[i] + 140) / 140; // Normalize from dB (-140 to 0) to 0-1
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
      Object.assign(state, newState);
    },

    dispose() {
      this.stop();
      window.removeEventListener('resize', resize);
    },
  };
}
