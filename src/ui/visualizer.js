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
  };

  // Particles
  let particles = [];
  let weatherParticles = [];
  let stars = [];

  // Clouds
  let clouds = [];

  // Landscape
  let landscape = [];

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
    generateLandscape();
    generateStars();
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

  // ── Chord Display ──

  function updateChordDisplay(chordInfo) {
    if (!chordNameEl || !chordTimelineEl) return;

    const qualityLabel = QUALITY_NAMES[chordInfo.quality] || chordInfo.quality;
    const newText = `${chordInfo.rootName}${qualityLabel}`;

    // Fade transition
    chordNameEl.classList.remove('fade-in');
    chordNameEl.classList.add('fade-out');

    clearTimeout(chordFadeTimer);
    chordFadeTimer = setTimeout(() => {
      chordNameEl.textContent = newText;
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
      dot.className = 'dot';
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
    drawStars();
    drawMoon();
    drawAurora();
    drawClouds();
    drawWeatherParticles();
    drawParticles(fftData);
    drawLandscape(waveformData);
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
    },
  };
}
