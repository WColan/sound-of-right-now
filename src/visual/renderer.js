/**
 * Now visualizer — WebGL2 renderer.
 *
 * Passes (into a half-float scene buffer, then composited to screen):
 *   1. background  sky scattering, sun, phase-correct moon, Milky Way (true
 *                  galactic position), aurora
 *   2. points      2,000 real stars (rotating with sidereal time), planets,
 *                  the ISS, fireflies
 *   3. lines       constellation figures (after ~10 min of listening), meteors
 *   4. foreground  lit clouds, biome terrain (city windows follow human
 *                  activity), sea with dispersion-correct waves, fog, rain/snow
 *   5. composite   mip-chain bloom, mode-driven colour grade, vignette, grain
 */
import {
  FULLSCREEN_VS, BACKGROUND_FS, FOREGROUND_FS, POINTS_VS, POINTS_FS, LINES_VS, LINES_FS, COMPOSITE_FS,
} from './shaders.js';
import { horizonToEquatorialMatrix } from './mood.js';
import { clamp, lerp, toRad } from '../now/util.js';

const PLANET_COLORS = {
  Mercury: [0.85, 0.82, 0.78], Venus: [1, 0.96, 0.85], Mars: [1, 0.55, 0.35], Jupiter: [1, 0.93, 0.82], Saturn: [1, 0.88, 0.62],
};

/** Approximate B−V colour index → linear RGB. */
export function bvToRgb(bv) {
  const t = clamp((bv + 0.4) / 2.4);
  return [lerp(0.65, 1, clamp(t * 2)), lerp(0.75, 0.82, t), lerp(1, 0.55, clamp(t * 1.4))];
}

/** Equatorial unit vector from RA/Dec (degrees). */
export function equatorialVector(raDeg, decDeg) {
  const ra = toRad(raDeg), dec = toRad(decDeg);
  return [Math.cos(dec) * Math.cos(ra), Math.cos(dec) * Math.sin(ra), Math.sin(dec)];
}

/** Camera basis for a yaw (azimuth, deg) and pitch (deg). */
export function cameraBasis(yawDeg, pitchDeg) {
  const y = toRad(yawDeg), p = toRad(pitchDeg);
  const f = [Math.sin(y), 0, Math.cos(y)];
  const right = [Math.cos(y), 0, -Math.sin(y)];
  const fwd = [f[0] * Math.cos(p), Math.sin(p), f[2] * Math.cos(p)];
  const up = [-f[0] * Math.sin(p), Math.cos(p), -f[2] * Math.sin(p)];
  return { right, up, fwd };
}

function compile(gl, type, src) {
  const s = gl.createShader(type);
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(s);
    gl.deleteShader(s);
    throw new Error(`Shader compile failed: ${log}`);
  }
  return s;
}

function program(gl, vs, fs) {
  const p = gl.createProgram();
  gl.attachShader(p, compile(gl, gl.VERTEX_SHADER, vs));
  gl.attachShader(p, compile(gl, gl.FRAGMENT_SHADER, fs));
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(`Program link failed: ${gl.getProgramInfoLog(p)}`);
  const uniforms = new Map();
  const u = (name) => {
    if (!uniforms.has(name)) uniforms.set(name, gl.getUniformLocation(p, name));
    return uniforms.get(name);
  };
  return { p, u };
}

export function createNowVisualizer(canvas, { analyser, skyData, isMobile = false } = {}) {
  const gl = canvas.getContext('webgl2', { antialias: false, alpha: false, premultipliedAlpha: false, powerPreference: 'high-performance' });
  if (!gl) return { supported: false };

  let programs;
  try {
    programs = {
      background: program(gl, FULLSCREEN_VS, BACKGROUND_FS),
      foreground: program(gl, FULLSCREEN_VS, FOREGROUND_FS),
      points: program(gl, POINTS_VS, POINTS_FS),
      lines: program(gl, LINES_VS, LINES_FS),
      composite: program(gl, FULLSCREEN_VS, COMPOSITE_FS),
    };
  } catch (err) {
    console.warn('[visual] WebGL2 programs failed, falling back', err);
    return { supported: false };
  }

  const floatTargets = Boolean(gl.getExtension('EXT_color_buffer_float'));

  // ── Geometry ──
  const quad = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, quad);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);

  function vao(prog, layout) {
    const v = gl.createVertexArray();
    gl.bindVertexArray(v);
    for (const { name, buffer, size } of layout) {
      const loc = gl.getAttribLocation(prog.p, name);
      if (loc < 0) continue;
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.enableVertexAttribArray(loc);
      gl.vertexAttribPointer(loc, size, gl.FLOAT, false, 0, 0);
    }
    gl.bindVertexArray(null);
    return v;
  }
  const quadVaos = Object.fromEntries(['background', 'foreground', 'composite'].map((k) => [k, vao(programs[k], [{ name: 'aPos', buffer: quad, size: 2 }])]));

  function pointSet(count) {
    const dir = gl.createBuffer(), mag = gl.createBuffer(), color = gl.createBuffer();
    const data = { dir: new Float32Array(count * 3), mag: new Float32Array(count), color: new Float32Array(count * 3) };
    return { dir, mag, color, data, count, vao: vao(programs.points, [{ name: 'aDir', buffer: dir, size: 3 }, { name: 'aMag', buffer: mag, size: 1 }, { name: 'aColor', buffer: color, size: 3 }]) };
  }
  function uploadPoints(set, usage = gl.DYNAMIC_DRAW) {
    gl.bindBuffer(gl.ARRAY_BUFFER, set.dir); gl.bufferData(gl.ARRAY_BUFFER, set.data.dir, usage);
    gl.bindBuffer(gl.ARRAY_BUFFER, set.mag); gl.bufferData(gl.ARRAY_BUFFER, set.data.mag, usage);
    gl.bindBuffer(gl.ARRAY_BUFFER, set.color); gl.bufferData(gl.ARRAY_BUFFER, set.data.color, usage);
  }

  // Stars (static, equatorial)
  const starArr = skyData?.stars ?? [];
  const stars = pointSet(starArr.length / 4);
  for (let i = 0; i < stars.count; i++) {
    const [ra, dec, m, bv] = starArr.slice(i * 4, i * 4 + 4);
    stars.data.dir.set(equatorialVector(ra, dec), i * 3);
    stars.data.mag[i] = m;
    stars.data.color.set(bvToRgb(bv), i * 3);
  }
  uploadPoints(stars, gl.STATIC_DRAW);

  // Planets + ISS (horizontal, updated from mood)
  const bodies = pointSet(6);
  // Fireflies (horizontal, animated)
  const FIREFLIES = 36;
  const flies = pointSet(FIREFLIES);
  const flyState = Array.from({ length: FIREFLIES }, (_, i) => ({ az: Math.random() * 80 - 40, alt: -4 + Math.random() * 6, phase: Math.random() * 10, speed: 0.3 + Math.random() * 0.6, seed: i }));

  // Constellation lines (static, equatorial)
  const lineArr = skyData?.lines ?? [];
  const constDir = gl.createBuffer(), constAlpha = gl.createBuffer();
  const constCount = (lineArr.length / 4) * 2;
  {
    const dirs = new Float32Array(constCount * 3);
    for (let i = 0; i < lineArr.length / 4; i++) {
      dirs.set(equatorialVector(lineArr[i * 4], lineArr[i * 4 + 1]), i * 6);
      dirs.set(equatorialVector(lineArr[i * 4 + 2], lineArr[i * 4 + 3]), i * 6 + 3);
    }
    gl.bindBuffer(gl.ARRAY_BUFFER, constDir); gl.bufferData(gl.ARRAY_BUFFER, dirs, gl.STATIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, constAlpha); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(constCount).fill(1), gl.STATIC_DRAW);
  }
  const constVao = vao(programs.lines, [{ name: 'aDir', buffer: constDir, size: 3 }, { name: 'aAlpha', buffer: constAlpha, size: 1 }]);

  // Meteors (horizontal, dynamic lines)
  const MAX_METEORS = 8;
  const meteorDir = gl.createBuffer(), meteorAlpha = gl.createBuffer();
  const meteorDirs = new Float32Array(MAX_METEORS * 6);
  const meteorAlphas = new Float32Array(MAX_METEORS * 2);
  const meteorVao = vao(programs.lines, [{ name: 'aDir', buffer: meteorDir, size: 3 }, { name: 'aAlpha', buffer: meteorAlpha, size: 1 }]);
  let meteors = [];

  // ── Scene target ──
  let fbo = null, sceneTex = null, width = 0, height = 0;
  const maxScale = Math.min(window.devicePixelRatio || 1, 1.5) * (isMobile ? 0.6 : 0.85);
  let renderScale = maxScale;
  // Dynamic resolution: if frames run long, render fewer pixels (and recover when they don't)
  let frameAvg = 16;
  let lastScaleChange = 0;
  function adaptResolution(dtMs, now) {
    frameAvg = lerp(frameAvg, dtMs, 0.05);
    if (now - lastScaleChange < 2000) return;
    if (frameAvg > 34 && renderScale > 0.3) {
      renderScale = Math.max(0.3, renderScale * 0.8);
      lastScaleChange = now;
    } else if (frameAvg < 18 && renderScale < maxScale) {
      renderScale = Math.min(maxScale, renderScale * 1.1);
      lastScaleChange = now;
    }
  }

  function resize() {
    const w = Math.max(2, Math.floor(window.innerWidth * renderScale));
    const h = Math.max(2, Math.floor(window.innerHeight * renderScale));
    if (w === width && h === height) return;
    width = w; height = h;
    canvas.width = w; canvas.height = h;
    canvas.style.width = '100%'; canvas.style.height = '100%';
    if (sceneTex) gl.deleteTexture(sceneTex);
    if (fbo) gl.deleteFramebuffer(fbo);
    sceneTex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, sceneTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, floatTargets ? gl.RGBA16F : gl.RGBA8, w, h, 0, gl.RGBA, floatTargets ? gl.HALF_FLOAT : gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    fbo = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, sceneTex, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  // ── State ──
  let mood = null;
  let moodAt = performance.now();
  let lst0 = 0;
  let yaw = 180;
  let activity = 0.5;
  let flash = 0;
  let flashQueue = [];
  let quake = { at: -1e9, intensity: 0, azimuth: 0 };
  const audio = { low: 0, mid: 0, high: 0 };
  let raf = null;
  const captureWaiters = [];
  const t0 = performance.now();
  let cloudDrift = [0, 0];
  let lastFrame = t0;

  function readAudio() {
    const fft = analyser?.getValue?.();
    if (!fft || !fft.length) return;
    const band = (a, b) => {
      let s = 0;
      for (let i = a; i < b && i < fft.length; i++) s += clamp((fft[i] + 100) / 70);
      return s / Math.max(1, b - a);
    };
    audio.low = lerp(audio.low, band(1, 6), 0.15);
    audio.mid = lerp(audio.mid, band(6, 40), 0.15);
    audio.high = lerp(audio.high, band(40, 120), 0.15);
  }

  function setCommon(prog, cam, aspect, tanH, time) {
    gl.uniform3fv(prog.u('uCamRight'), cam.right);
    gl.uniform3fv(prog.u('uCamUp'), cam.up);
    gl.uniform3fv(prog.u('uCamFwd'), cam.fwd);
    gl.uniform1f(prog.u('uTanH'), tanH);
    gl.uniform1f(prog.u('uAspect'), aspect);
    gl.uniform1f(prog.u('uTime'), time);
    gl.uniform2f(prog.u('uRes'), width, height);
  }

  function setSky(prog, m) {
    gl.uniform3fv(prog.u('uSunDir'), m.sun.dir);
    gl.uniform1f(prog.u('uSunAlt'), m.sun.altitude);
    gl.uniform3fv(prog.u('uZenith'), m.zenith);
    gl.uniform3fv(prog.u('uHorizon'), m.horizon);
    gl.uniform3fv(prog.u('uSunGlow'), m.sunGlow);
    gl.uniform1f(prog.u('uGolden'), m.golden);
    gl.uniform1f(prog.u('uDark'), m.darkness);
    gl.uniform1f(prog.u('uHaze'), m.haze);
    gl.uniform3fv(prog.u('uMoonDir'), m.moon.dir);
    gl.uniform1f(prog.u('uMoonIllum'), m.moon.illumination);
  }

  function frame(now) {
    raf = requestAnimationFrame(frame);
    resize();
    if (!mood) return;
    const dt = Math.min(0.1, (now - lastFrame) / 1000);
    adaptResolution(now - lastFrame, now);
    lastFrame = now;
    const time = (now - t0) / 1000;
    readAudio();

    // Camera drifts toward what matters in the sky, with a slow sway
    const target = mood.focusAzimuth + Math.sin(time / 240) * 18;
    let delta = ((target - yaw + 540) % 360) - 180;
    yaw = (yaw + delta * Math.min(1, dt * 0.05) + 360) % 360;
    const pitch = lerp(7, 15, mood.darkness);
    const quakeAge = (now - quake.at) / 1000;
    const shake = quakeAge >= 0 && quakeAge < 6 ? quake.intensity * Math.exp(-quakeAge * 0.8) * 0.004 : 0;
    const cam = cameraBasis(yaw, pitch);
    const aspect = width / height;
    const tanH = Math.tan(toRad(isMobile && aspect < 1 ? 38 : 30));

    // Sidereal rotation continues between data updates
    const lst = lst0 + ((now - moodAt) / 3600000) * 1.0027379;
    const eq = horizonToEquatorialMatrix(lst, mood.latitude);

    // Lightning flicker
    flashQueue = flashQueue.filter((f) => f.until > now);
    flash = flashQueue.reduce((m, f) => Math.max(m, f.strength * (0.5 + 0.5 * Math.sin((f.until - now) * 0.08))), 0);

    // Wind drives the clouds
    const windRad = toRad(mood.wind.direction + 180);
    const drift = (0.004 + mood.cloud.speed * 0.0016) * dt;
    cloudDrift = [cloudDrift[0] + Math.sin(windRad) * drift, cloudDrift[1] + Math.cos(windRad) * drift];

    gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
    gl.viewport(0, 0, width, height);
    gl.disable(gl.BLEND);

    // 1. Background
    let P = programs.background;
    gl.useProgram(P.p);
    setCommon(P, cam, aspect, tanH, time);
    setSky(P, mood);
    gl.uniformMatrix3fv(P.u('uEq'), false, eq);
    gl.uniform1f(P.u('uMilky'), mood.milkyWay);
    gl.uniform3f(P.u('uAurora'), mood.aurora.intensity, mood.aurora.hue, audio.high);
    gl.uniform1f(P.u('uPolarSign'), mood.southern ? -1 : 1);
    gl.uniform1f(P.u('uStarVis'), mood.starVisibility);
    gl.bindVertexArray(quadVaos.background);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    // 2. Points (additive)
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE);
    P = programs.points;
    gl.useProgram(P.p);
    setCommon(P, cam, aspect, tanH, time);
    gl.uniformMatrix3fv(P.u('uEq'), false, eq);
    gl.uniform1f(P.u('uScale'), renderScale * 1.15);
    if (mood.starVisibility > 0.01) {
      gl.uniform1i(P.u('uEquatorial'), 1);
      gl.uniform1f(P.u('uVis'), mood.starVisibility * (0.85 + audio.high * 0.4));
      gl.uniform1f(P.u('uLimMag'), mood.limitingMag);
      gl.uniform1f(P.u('uTwinkle'), 1);
      gl.bindVertexArray(stars.vao);
      gl.drawArrays(gl.POINTS, 0, stars.count);
    }
    // Planets + ISS: steady light, visible in deeper twilight than faint stars
    gl.uniform1i(P.u('uEquatorial'), 0);
    gl.uniform1f(P.u('uTwinkle'), 0);
    gl.uniform1f(P.u('uVis'), Math.min(1, mood.starVisibility * 1.6 + 0.05));
    gl.uniform1f(P.u('uLimMag'), 3);
    gl.bindVertexArray(bodies.vao);
    gl.drawArrays(gl.POINTS, 0, bodies.count);
    if (mood.fireflies > 0.02) {
      updateFireflies(time);
      gl.uniform1f(P.u('uVis'), mood.fireflies);
      gl.uniform1f(P.u('uLimMag'), 6);
      gl.bindVertexArray(flies.vao);
      gl.drawArrays(gl.POINTS, 0, flies.count);
    }

    // 3. Lines
    P = programs.lines;
    gl.useProgram(P.p);
    setCommon(P, cam, aspect, tanH, time);
    gl.uniformMatrix3fv(P.u('uEq'), false, eq);
    if (mood.constellations > 0.01 && constCount) {
      gl.uniform1i(P.u('uEquatorial'), 1);
      gl.uniform3f(P.u('uColor'), 0.5 * mood.constellations * 0.25, 0.6 * mood.constellations * 0.25, 0.9 * mood.constellations * 0.25);
      gl.bindVertexArray(constVao);
      gl.drawArrays(gl.LINES, 0, constCount);
    }
    if (meteors.length) {
      updateMeteors(now);
      gl.uniform1i(P.u('uEquatorial'), 0);
      gl.uniform3f(P.u('uColor'), 1, 0.97, 0.9);
      gl.bindVertexArray(meteorVao);
      gl.drawArrays(gl.LINES, 0, meteors.length * 2);
    }

    // 4. Foreground (alpha over)
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    P = programs.foreground;
    gl.useProgram(P.p);
    setCommon(P, cam, aspect, tanH, time);
    setSky(P, mood);
    gl.uniform4f(P.u('uCloud'), mood.cloud.cover, mood.cloud.darkness, cloudDrift[0], cloudDrift[1]);
    gl.uniform1f(P.u('uFog'), mood.fog);
    gl.uniform1f(P.u('uTerrainKind'), mood.terrain.kind);
    gl.uniform1f(P.u('uTerrainSeed'), mood.terrain.seed);
    gl.uniform1f(P.u('uSnowCover'), mood.snowCover);
    gl.uniform4f(P.u('uWater'), mood.water.present && !mood.water.river ? 1 : 0, mood.water.level, mood.water.waveHeight, mood.water.wavePeriod);
    const wd = toRad(mood.water.waveDirection + 180);
    gl.uniform2f(P.u('uWaveDir'), Math.sin(wd), Math.cos(wd));
    gl.uniform1f(P.u('uRiver'), mood.water.river ? 1 : 0);
    gl.uniform1f(P.u('uRain'), mood.rain);
    gl.uniform1f(P.u('uSnow'), mood.snow);
    gl.uniform2f(P.u('uWind'), Math.sin(toRad(mood.wind.direction + 180 - yaw)) * clamp(mood.wind.speed / 40), mood.wind.speed);
    gl.uniform1f(P.u('uFlash'), flash);
    gl.uniform3f(P.u('uQuake'), quakeAge, quake.intensity, toRad(quake.azimuth));
    gl.uniform1f(P.u('uActivity'), activity);
    gl.uniform3f(P.u('uAudio'), audio.low, audio.mid, audio.high);
    gl.bindVertexArray(quadVaos.foreground);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    // 5. Composite to screen
    gl.disable(gl.BLEND);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, width, height);
    gl.bindTexture(gl.TEXTURE_2D, sceneTex);
    gl.generateMipmap(gl.TEXTURE_2D);
    P = programs.composite;
    gl.useProgram(P.p);
    gl.uniform1i(P.u('uScene'), 0);
    gl.uniform1f(P.u('uTime'), time);
    const g = mood.grade;
    gl.uniform1f(P.u('uWarmth'), g.warmth);
    gl.uniform1f(P.u('uSaturation'), g.saturation);
    gl.uniform1f(P.u('uContrast'), g.contrast);
    gl.uniform1f(P.u('uExposure'), g.exposure * (1 + flash * 0.4));
    gl.uniform1f(P.u('uVignette'), g.vignette);
    gl.uniform1f(P.u('uBloom'), 0.55 + audio.mid * 0.5);
    gl.uniform2f(P.u('uShake'), Math.sin(time * 37) * shake, Math.cos(time * 41) * shake);
    gl.bindVertexArray(quadVaos.composite);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    gl.bindVertexArray(null);
    // Frame capture must happen while the drawing buffer is still intact
    if (captureWaiters.length) captureWaiters.splice(0).forEach((resolve) => resolve(canvas.toDataURL('image/png')));
  }

  function horizontalVector(altDeg, azDeg) {
    const a = toRad(altDeg), z = toRad(azDeg);
    return [Math.sin(z) * Math.cos(a), Math.sin(a), Math.cos(z) * Math.cos(a)];
  }

  function updateBodies() {
    bodies.data.mag.fill(99);
    mood.planets.forEach((p, i) => {
      bodies.data.dir.set(p.dir, i * 3);
      bodies.data.mag[i] = p.magnitude - 0.6;
      bodies.data.color.set(PLANET_COLORS[p.name] ?? [1, 1, 1], i * 3);
    });
    if (mood.iss?.visible) {
      bodies.data.dir.set(mood.iss.dir, 5 * 3);
      bodies.data.mag[5] = -2.5;
      bodies.data.color.set([1, 1, 1], 5 * 3);
    }
    uploadPoints(bodies);
  }

  function updateFireflies(time) {
    flyState.forEach((f, i) => {
      f.az += Math.sin(time * f.speed + f.phase) * 0.02;
      f.alt += Math.cos(time * f.speed * 0.7 + f.phase) * 0.008;
      const blink = Math.max(0, Math.sin(time * (0.6 + f.speed) + f.phase * 3));
      flies.data.dir.set(horizontalVector(f.alt, yaw + f.az), i * 3);
      flies.data.mag[i] = lerp(6, 0.5, blink ** 4);
      flies.data.color.set([0.85, 1, 0.35], i * 3);
    });
    uploadPoints(flies);
  }

  function updateMeteors(now) {
    meteors = meteors.filter((m) => now < m.start + m.life);
    meteors.forEach((m, i) => {
      const t = clamp((now - m.start) / m.life);
      const head = [m.alt - m.dAlt * t, m.az + m.dAz * t];
      const tail = [head[0] + m.dAlt * 0.35, head[1] - m.dAz * 0.35];
      meteorDirs.set(horizontalVector(head[0], head[1]), i * 6);
      meteorDirs.set(horizontalVector(tail[0], tail[1]), i * 6 + 3);
      const fade = Math.sin(Math.PI * t);
      meteorAlphas[i * 2] = m.brightness * fade;
      meteorAlphas[i * 2 + 1] = 0;
    });
    gl.bindBuffer(gl.ARRAY_BUFFER, meteorDir); gl.bufferData(gl.ARRAY_BUFFER, meteorDirs, gl.DYNAMIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, meteorAlpha); gl.bufferData(gl.ARRAY_BUFFER, meteorAlphas, gl.DYNAMIC_DRAW);
  }

  window.addEventListener('resize', resize);
  resize();

  return {
    supported: true,
    /** PNG data URL of the next rendered frame (for sharing / debugging). */
    capture() {
      return new Promise((resolve) => captureWaiters.push(resolve));
    },
    start() { if (!raf) raf = requestAnimationFrame(frame); },
    stop() { if (raf) cancelAnimationFrame(raf); raf = null; },
    setMood(next, { activity: a } = {}) {
      const first = !mood;
      mood = next;
      moodAt = performance.now();
      lst0 = next.lst;
      if (a != null) activity = a;
      if (first) yaw = next.focusAzimuth;
      updateBodies();
    },
    /** Orchestra events → light. */
    event(e) {
      const now = performance.now();
      if (e.type === 'lightning') {
        // The flash is immediate; the thunder (audio) follows after e.delay
        const strength = clamp(1.2 - (e.distanceKm ?? 4) / 10, 0.25, 1);
        flashQueue.push({ until: now + 180, strength }, { until: now + 420, strength: strength * 0.6 });
      } else if (e.type === 'meteor' && meteors.length < MAX_METEORS) {
        const az = yaw + (e.pan ?? 0) * 40;
        meteors.push({ start: now, life: 500 + (e.brightness ?? 0.3) * 700, alt: 28 + Math.random() * 30, az, dAlt: 6 + Math.random() * 8, dAz: (Math.random() - 0.5) * 16, brightness: 0.4 + (e.brightness ?? 0.3) * 1.4 });
      } else if (e.type === 'quake-arrival') {
        quake = { at: now, intensity: e.intensity ?? 0.5, azimuth: e.quake?.bearing ?? 0 };
      }
    },
    dispose() {
      this.stop();
      window.removeEventListener('resize', resize);
      const ext = gl.getExtension('WEBGL_lose_context');
      ext?.loseContext();
    },
  };
}
