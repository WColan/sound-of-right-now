/**
 * GLSL for the Now visualizer (WebGL2 / GLSL ES 3.00).
 *
 * World frame: x = east, y = up, z = north. The camera looks out from the
 * listener's position; every sky object is drawn in its true direction.
 */

export const FULLSCREEN_VS = `#version 300 es
in vec2 aPos;
out vec2 vNdc;
void main() {
  vNdc = aPos;
  gl_Position = vec4(aPos, 0.0, 1.0);
}`;

const COMMON = `
precision highp float;
uniform vec2 uRes;
uniform float uTime;
uniform vec3 uCamRight;
uniform vec3 uCamUp;
uniform vec3 uCamFwd;
uniform float uTanH;
uniform float uAspect;

vec3 rayDir(vec2 ndc) {
  return normalize(uCamRight * ndc.x * uTanH * uAspect + uCamUp * ndc.y * uTanH + uCamFwd);
}

float hash11(float p) { p = fract(p * 0.1031); p *= p + 33.33; p *= p + p; return fract(p); }
float hash21(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float hash31(vec3 p) { p = fract(p * 0.1031); p += dot(p, p.zyx + 31.32); return fract((p.x + p.y) * p.z); }

float noise2(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash21(i), hash21(i + vec2(1, 0)), u.x), mix(hash21(i + vec2(0, 1)), hash21(i + vec2(1, 1)), u.x), u.y);
}
float noise3(vec3 p) {
  vec3 i = floor(p), f = fract(p);
  vec3 u = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(mix(hash31(i), hash31(i + vec3(1,0,0)), u.x), mix(hash31(i + vec3(0,1,0)), hash31(i + vec3(1,1,0)), u.x), u.y),
    mix(mix(hash31(i + vec3(0,0,1)), hash31(i + vec3(1,0,1)), u.x), mix(hash31(i + vec3(0,1,1)), hash31(i + vec3(1,1,1)), u.x), u.y),
    u.z);
}
float fbm2(vec2 p) {
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 5; i++) { v += a * noise2(p); p = p * 2.03 + vec2(17.1, 9.2); a *= 0.5; }
  return v;
}
float fbm3(vec3 p) {
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 4; i++) { v += a * noise3(p); p = p * 2.07 + vec3(5.3, 1.7, 9.1); a *= 0.5; }
  return v;
}
float fbm1(float x) {
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 5; i++) { v += a * (noise2(vec2(x, 3.7 * float(i))) * 2.0 - 1.0); x *= 2.1; a *= 0.5; }
  return v;
}
`;

// Sky colour shared by background and water reflections
const SKY_FN = `
uniform vec3 uSunDir;
uniform float uSunAlt;
uniform vec3 uZenith;
uniform vec3 uHorizon;
uniform vec3 uSunGlow;
uniform float uGolden;
uniform float uDark;
uniform float uHaze;

vec3 skyGradient(vec3 d) {
  float h = max(d.y, 0.0);
  float t = pow(1.0 - h, 3.2);
  vec3 c = mix(uZenith, uHorizon, t);
  // Forward scattering: the sky brightens toward the sun, warmly near the horizon
  float mu = max(dot(d, uSunDir), 0.0);
  float sunVis = smoothstep(-0.12, 0.05, uSunDir.y);
  c += uSunGlow * (pow(mu, 8.0) * 0.25 + pow(mu, 64.0) * 0.6) * sunVis * (0.3 + 0.5 * uGolden);
  // Golden hour: a warm band hugging the horizon on the sun's side
  c += vec3(1.0, 0.45, 0.15) * uGolden * pow(1.0 - h, 10.0) * (0.2 + 0.4 * pow(mu, 2.0));
  // Haze (AQI) flattens the gradient toward a dusty beige
  c = mix(c, vec3(0.55, 0.5, 0.42) * (0.25 + 0.75 * (1.0 - uDark)), uHaze * 0.45);
  return c;
}
`;

export const BACKGROUND_FS = `#version 300 es
${COMMON}
${SKY_FN}
in vec2 vNdc;
out vec4 outColor;
uniform mat3 uEq;          // horizontal → equatorial
uniform float uMilky;
uniform vec3 uMoonDir;
uniform float uMoonIllum;
uniform float uMoonWaxing;
uniform vec3 uAurora;      // intensity, hue (0 green … 1 red), audio shimmer
uniform float uPolarSign;  // +1 north, −1 south
uniform float uStarVis;

const vec3 G0 = vec3(-0.0548755604, -0.8734370902, -0.4838350155);
const vec3 G1 = vec3( 0.4941094279, -0.4448296300,  0.7469822445);
const vec3 G2 = vec3(-0.8676661490, -0.1980763734,  0.4559837762);

vec3 milkyWay(vec3 d) {
  vec3 e = uEq * d;
  vec3 g = vec3(dot(G0, e), dot(G1, e), dot(G2, e));
  float b = asin(clamp(g.z, -1.0, 1.0));
  float l = atan(g.y, g.x);
  float band = exp(-pow(b / 0.15, 2.0));
  float core = exp(-pow(l / 0.9, 2.0)) * exp(-pow(b / 0.12, 2.0));
  float clumps = fbm3(g * 7.0);
  float dust = smoothstep(0.45, 0.7, fbm3(g * 11.0 + 3.0)) * exp(-pow(b / 0.06, 2.0));
  float light = band * (0.15 + 1.1 * clumps * clumps) + core * 1.1;
  light *= 1.0 - dust * 0.75;
  return vec3(0.75, 0.78, 0.95) * light + vec3(1.0, 0.8, 0.55) * core * 0.5;
}

vec3 moon(vec3 d) {
  float r = 0.016;
  float ang = acos(clamp(dot(d, uMoonDir), -1.0, 1.0));
  vec3 col = vec3(0.0);
  // Halo, brighter with phase
  col += vec3(0.75, 0.8, 0.95) * exp(-ang / 0.09) * 0.12 * uMoonIllum;
  if (ang < r * 1.02) {
    vec3 sunward = uSunDir - uMoonDir * dot(uSunDir, uMoonDir);
    sunward = length(sunward) > 1e-4 ? normalize(sunward) : uCamRight;
    vec3 perp = normalize(cross(uMoonDir, sunward));
    vec3 off = d - uMoonDir * dot(d, uMoonDir);
    vec2 uv = vec2(dot(off, sunward), dot(off, perp)) / r;
    float rr = dot(uv, uv);
    if (rr <= 1.0) {
      vec3 n = vec3(uv, sqrt(1.0 - rr));
      float cosA = 2.0 * uMoonIllum - 1.0;           // phase angle from lit fraction
      vec3 s = vec3(sqrt(max(0.0, 1.0 - cosA * cosA)), 0.0, cosA);
      float lit = smoothstep(-0.04, 0.06, dot(n, s));
      float maria = 0.82 + 0.18 * fbm2(uv * 3.0 + 11.0);
      vec3 surface = vec3(0.92, 0.9, 0.84) * maria;
      col = mix(vec3(0.02, 0.025, 0.04) + surface * 0.03, surface * 1.1, lit) * smoothstep(1.0, 0.96, rr);
    }
  }
  return col;
}

vec3 aurora(vec3 d) {
  if (uAurora.x <= 0.001 || d.y <= 0.0) return vec3(0.0);
  float t = 2.2 / max(d.y, 0.06);
  vec2 p = d.xz * t;
  float acc = 0.0;
  vec3 col = vec3(0.0);
  for (int i = 0; i < 3; i++) {
    float fi = float(i);
    float wave = fbm1(p.x * 0.08 + fi * 3.1 + uTime * 0.015) * 6.0;
    float centre = mix(6.0, -1.0, uAurora.x) + fi * 3.0;   // strong storms bring the curtains overhead
    float dist = abs(p.y * uPolarSign - centre - wave);
    float curtain = exp(-dist * 0.9) * (0.6 + 0.4 * noise2(vec2(p.x * 1.4 + fi, uTime * 0.4)));
    float rays = 0.55 + 0.45 * noise2(vec2(p.x * 4.0 + fi * 7.0, uTime * 0.25));
    acc += curtain * rays;
  }
  float altW = smoothstep(0.06, 0.32, d.y) * (1.0 - smoothstep(0.8, 1.0, d.y));
  vec3 green = vec3(0.15, 1.0, 0.45);
  vec3 crimson = vec3(0.9, 0.2, 0.55);
  col = mix(green, crimson, clamp(uAurora.y * smoothstep(0.2, 0.7, d.y) * 1.4, 0.0, 1.0));
  return col * acc * altW * uAurora.x * 0.7 * (0.6 + 0.4 * uAurora.z);
}

void main() {
  vec3 d = rayDir(vNdc);
  vec3 c = skyGradient(d);
  // The sun's disc
  float sunAng = acos(clamp(dot(d, uSunDir), -1.0, 1.0));
  c += uSunGlow * 4.0 * smoothstep(0.012, 0.009, sunAng) * smoothstep(-0.03, 0.0, uSunDir.y + 0.02);
  if (d.y > -0.02) {
    if (uMilky > 0.001) c += milkyWay(d) * uMilky * 0.11 * smoothstep(-0.02, 0.15, d.y);
    c += aurora(d);
  }
  c += moon(d) * smoothstep(-0.03, 0.02, uMoonDir.y);
  outColor = vec4(c, 1.0);
}`;

export const FOREGROUND_FS = `#version 300 es
${COMMON}
${SKY_FN}
in vec2 vNdc;
out vec4 outColor;
uniform vec4 uCloud;        // cover, darkness, drift x, drift z
uniform float uFog;
uniform float uTerrainKind;
uniform float uTerrainSeed;
uniform float uSnowCover;
uniform vec4 uWater;        // present, level, waveHeight, period
uniform vec2 uWaveDir;
uniform float uRiver;
uniform float uRain;
uniform float uSnow;
uniform vec2 uWind;         // screen-space slant, speed
uniform float uFlash;
uniform vec3 uQuake;        // age (s), intensity, azimuth (rad)
uniform vec3 uMoonDir;
uniform float uMoonIllum;
uniform float uActivity;    // human activity → lit windows
uniform vec3 uAudio;        // low, mid, high

const float PI = 3.14159265;

// Ridge height (radians of altitude) for a terrain layer at azimuth a
float ridge(float a, float layer) {
  float k = uTerrainKind;
  float s = uTerrainSeed + layer * 37.0;
  float x = a * (3.0 + layer * 2.0) + s;
  float h;
  if (k == 2.0) {                      // mountain: sharp ridged peaks
    float r = 1.0 - abs(fbm1(x * 0.7));
    h = 0.02 + r * r * (0.16 - layer * 0.045);
  } else if (k == 3.0) {               // urban: a skyline of blocks
    float cell = floor(a * (60.0 + layer * 40.0) + s);
    h = 0.006 + pow(hash11(cell), 2.2) * (0.085 - layer * 0.02);
  } else if (k == 1.0 || k == 8.0) {   // forest/tropical: hills + canopy
    h = 0.012 + (fbm1(x * 0.5) * 0.5 + 0.5) * 0.025 + noise2(vec2(a * 260.0 + s, layer)) * (0.012 - layer * 0.003);
  } else if (k == 4.0) {               // desert: low dunes, occasional mesa
    h = 0.005 + (sin(x * 1.7) * 0.5 + 0.5) * 0.008 + step(0.82, noise2(vec2(x * 0.2, s))) * 0.03;
  } else if (k == 5.0) {               // coastal: headlands to one side
    h = (0.02 + fbm1(x * 0.6) * 0.02) * smoothstep(0.2, 0.6, sin(a + s));
  } else if (k == 6.0) {               // arctic: low ice
    h = 0.006 + abs(fbm1(x)) * 0.012;
  } else if (k == 7.0) {               // wetland: flat with reeds
    h = 0.004 + noise2(vec2(a * 400.0 + s, layer)) * 0.006;
  } else {                             // grassland: gentle rolling
    h = 0.006 + (fbm1(x * 0.6) * 0.5 + 0.5) * 0.02;
  }
  return h;
}

vec4 clouds(vec3 d) {
  if (d.y <= 0.01 || uCloud.x <= 0.01) return vec4(0.0);
  float t = 1.0 / d.y;
  vec2 p = d.xz * t * 0.45 + uCloud.zw;
  float n = fbm2(p * 1.3);
  float n2 = fbm2(p * 3.1 + 7.0);
  float coverage = mix(1.05, 0.25, uCloud.x);
  float dens = smoothstep(coverage, coverage + 0.32, n * 0.75 + n2 * 0.35);
  dens = max(dens, smoothstep(0.85, 1.0, uCloud.x));   // true overcast is solid
  dens *= smoothstep(0.01, 0.12, d.y);
  // Lighting: sunlit tops, darker bases; warm at golden hour; moonlit at night
  float mu = max(dot(d, uSunDir), 0.0);
  float sunUp = smoothstep(-0.1, 0.1, uSunDir.y);
  vec3 lit = mix(uHorizon * 1.1, vec3(1.0), smoothstep(0.0, 0.5, uSunDir.y)) * sunUp;
  lit += vec3(1.0, 0.5, 0.25) * uGolden * 0.9;
  lit += vec3(0.25, 0.28, 0.35) * uMoonIllum * smoothstep(0.0, 0.2, uMoonDir.y) * (1.0 - sunUp);
  vec3 shade = mix(uZenith * 0.6, vec3(0.18, 0.2, 0.24), 1.0 - uDark) * (1.0 - uCloud.y * 0.7);
  float thick = smoothstep(0.3, 1.0, dens) + uCloud.y * 0.4;
  vec3 col = mix(lit, shade, clamp(thick, 0.0, 1.0));
  // Silver lining near the sun
  col += uSunGlow * pow(mu, 12.0) * (1.0 - dens) * 1.2 * sunUp;
  col = mix(col, vec3(0.03, 0.035, 0.05), uDark * 0.75);
  col += vec3(0.75, 0.8, 1.0) * uFlash * dens * 1.5;
  return vec4(col, dens * (0.85 + uCloud.y * 0.15));
}

vec3 groundColor() {
  vec3 base;
  if (uTerrainKind == 4.0) base = vec3(0.35, 0.25, 0.16);
  else if (uTerrainKind == 6.0) base = vec3(0.7, 0.75, 0.82);
  else if (uTerrainKind == 3.0) base = vec3(0.09, 0.09, 0.11);
  else base = vec3(0.07, 0.11, 0.07);
  base = mix(base, vec3(0.8, 0.83, 0.88), uSnowCover);
  float light = max(0.03, smoothstep(-0.2, 0.6, uSunDir.y)) + uMoonIllum * 0.04;
  return base * light;
}

vec3 water(vec3 d, float quakeRipple) {
  float t = 0.05 / max(-d.y, 0.002);
  vec2 p = d.xz * t * 40.0;
  // Deep-water dispersion: wavelength = g T² / 2π
  float omega = 2.0 * PI / max(uWater.w, 2.0);
  float k = omega * omega / 9.81 * 6.0;
  float amp = clamp(uWater.z / 3.0, 0.03, 1.0);
  float phase = dot(p, uWaveDir) * k - uTime * omega;
  vec2 grad = uWaveDir * cos(phase) * amp * 0.35;
  grad += vec2(noise2(p * 2.5 + uTime * 0.6) - 0.5, noise2(p * 2.5 - uTime * 0.5 + 9.0) - 0.5) * (0.18 + amp * 0.3);
  grad += vec2(sin(length(p) * 3.0 - uQuake.x * 6.0)) * quakeRipple * 0.25;
  vec3 n = normalize(vec3(-grad.x, 1.0, -grad.y));
  vec3 r = reflect(d, n);
  r.y = abs(r.y);
  vec3 refl = skyGradient(r);
  // Moon and sun glitter paths
  float clearSky = 1.0 - smoothstep(0.6, 0.95, uCloud.x);   // no glitter path under overcast
  refl += vec3(0.9, 0.9, 0.85) * pow(max(dot(r, uMoonDir), 0.0), 600.0) * uMoonIllum * 4.0 * step(0.0, uMoonDir.y) * clearSky;
  refl += uSunGlow * pow(max(dot(r, uSunDir), 0.0), 900.0) * 6.0 * step(0.0, uSunDir.y) * clearSky;
  float fres = 0.04 + 0.96 * pow(1.0 - max(dot(-d, n), 0.0), 5.0);
  vec3 deep = mix(vec3(0.0, 0.03, 0.05), vec3(0.03, 0.15, 0.2), smoothstep(-0.1, 0.5, uSunDir.y));
  return mix(deep, refl, clamp(fres * 1.4, 0.0, 1.0)) * (1.0 + uAudio.x * 0.15);
}

vec4 precipitation(vec2 ndc) {
  vec4 acc = vec4(0.0);
  if (uRain > 0.01) {
    for (int i = 0; i < 3; i++) {
      float fi = float(i);
      float cols = 90.0 + fi * 70.0;                      // nearer layers: fewer, longer streaks
      vec2 uv = vec2((ndc.x * uAspect + ndc.y * uWind.x * 0.35) * cols, ndc.y);
      float col = floor(uv.x);
      float h = hash11(col * 1.37 + fi * 17.0);
      if (h > uRain * (0.35 - fi * 0.08)) continue;       // only some columns carry a drop
      float speed = 2.2 + fi * 0.9 + h * 1.5;
      float f = fract(uv.y * (1.2 + fi * 0.4) + uTime * speed + h * 13.0);
      float len = 0.12 - fi * 0.03;
      float streak = smoothstep(0.0, 0.02, f) * smoothstep(len, 0.0, f);
      streak *= smoothstep(0.35, 0.0, abs(fract(uv.x) - 0.5));
      acc.rgb += vec3(0.75, 0.8, 0.9) * streak * (0.09 - fi * 0.02);
      acc.a = max(acc.a, streak * (0.09 - fi * 0.02));
    }
  }
  if (uSnow > 0.01) {
    for (int i = 0; i < 3; i++) {
      float fi = float(i);
      float scale = 9.0 + fi * 7.0;
      vec2 uv = vec2(ndc.x * uAspect, ndc.y) * scale;
      uv.y += uTime * (0.25 + fi * 0.1);
      uv.x += sin(uTime * 0.3 + uv.y * 0.7 + fi) * 0.4 + uWind.x * uTime * 0.2;
      vec2 id = floor(uv);
      vec2 f = fract(uv) - 0.5;
      vec2 o = vec2(hash21(id), hash21(id + 5.0)) - 0.5;
      float flake = smoothstep(0.08 - fi * 0.015, 0.0, length(f - o * 0.6)) * step(1.0 - uSnow * 0.7, hash21(id + 11.0));
      float a = flake * (0.55 - fi * 0.12);
      acc.rgb += vec3(0.95) * a;
      acc.a = max(acc.a, a);
    }
  }
  return acc;
}

void main() {
  vec3 d = rayDir(vNdc);
  float alt = asin(clamp(d.y, -1.0, 1.0));
  float az = atan(d.x, d.z);
  float quakeEnv = uQuake.y * exp(-uQuake.x * 0.6) * step(0.0, uQuake.x);
  float tremble = quakeEnv * 0.004 * sin(uTime * 40.0 + az * 3.0);

  vec4 col = vec4(0.0);

  // Clouds over the sky (and over stars drawn underneath)
  vec4 cl = clouds(d);
  col = vec4(cl.rgb * cl.a, cl.a);

  // Terrain silhouettes, far → near, each fogged by distance
  float horizonFog = clamp(0.25 + uFog * 0.75, 0.0, 1.0);
  vec3 skyAtHorizon = skyGradient(normalize(vec3(d.x, 0.02, d.z)));
  float covered = 0.0;
  bool hasWater = uWater.x > 0.5;
  // Terrain never rises above ~0.2 rad: skip the ridge noise for the open sky
  for (int i = 0; i < 3; i++) {
    if (alt > 0.2) break;
    float layer = float(i);
    float h = ridge(az, layer) + tremble;
    // Coastal and ocean views keep the near layers off the sea side
    if (hasWater && uTerrainKind != 5.0 && layer > 0.5) h *= 0.0;
    if (alt < h && alt >= -0.002) {
      vec3 land = groundColor() * (0.5 + layer * 0.35);
      // City lights: windows in the skyline, more of them when people are about
      if (uTerrainKind == 3.0) {
        vec2 w = vec2(az * 900.0, alt * 900.0);
        float win = step(0.86 - uActivity * 0.12, hash21(floor(w) + layer * 31.0)) * step(0.004, h - alt);
        land += vec3(1.0, 0.75, 0.4) * win * uDark * (0.5 + 0.5 * uActivity) * 0.8;
      }
      float distFog = mix(0.75, 0.15, layer / 2.0) * horizonFog + (1.0 - layer / 2.0) * 0.25;
      vec3 c = mix(land, skyAtHorizon, clamp(distFog, 0.0, 0.95));
      col = vec4(c, 1.0);
      covered = 1.0;
    }
  }

  // Below the horizon: sea / river, or the ground
  if (covered < 0.5 && alt < 0.0) {
    if (hasWater) {
      vec3 wc = water(d, quakeEnv);
      col = vec4(mix(wc, skyAtHorizon, smoothstep(-0.03, 0.0, alt) * 0.6), 1.0);
    } else {
      vec3 g = groundColor();
      if (uRiver > 0.5) {
        float band = smoothstep(0.02, 0.0, abs(d.x / max(-d.y, 0.01) * 0.02 + sin(d.z / max(-d.y, 0.01) * 0.05) * 0.4));
        g = mix(g, water(d, quakeEnv) * 0.8, band);
      }
      col = vec4(mix(g, skyAtHorizon, smoothstep(-0.12, 0.0, alt) * horizonFog), 1.0);
    }
  }

  // Fog: everything recedes toward the horizon colour
  float fogAmt = uFog * (1.0 - smoothstep(0.0, 0.5, abs(alt)) * 0.6);
  col.rgb = mix(col.rgb, skyAtHorizon * (0.8 + 0.2 * (1.0 - uDark)), fogAmt * col.a);
  col.a = max(col.a, uFog * 0.75 * smoothstep(0.35, 0.0, abs(alt)));
  if (col.a > 0.0 && covered < 0.5 && alt >= 0.0) col.rgb = mix(col.rgb, skyAtHorizon, uFog * 0.6);

  // Precipitation in front of everything
  vec4 pr = precipitation(vNdc);
  col.rgb = col.rgb + pr.rgb * (0.35 + 0.65 * (1.0 - uDark * 0.6));
  col.a = max(col.a, pr.a);

  // Lightning lights the whole scene
  col.rgb += vec3(0.6, 0.65, 0.8) * uFlash * 0.35;
  col.a = max(col.a, uFlash * 0.3);

  outColor = col;
}`;

export const POINTS_VS = `#version 300 es
precision highp float;
in vec3 aDir;       // equatorial (stars) or horizontal (planets, ISS, fireflies)
in float aMag;
in vec3 aColor;
uniform mat3 uEq;
uniform bool uEquatorial;
uniform vec3 uCamRight;
uniform vec3 uCamUp;
uniform vec3 uCamFwd;
uniform float uTanH;
uniform float uAspect;
uniform float uTime;
uniform float uVis;
uniform float uLimMag;
uniform float uScale;
uniform float uTwinkle;
out vec4 vColor;
void main() {
  vec3 d = uEquatorial ? transpose(uEq) * aDir : aDir;
  float cz = dot(d, uCamFwd);
  if (cz <= 0.01) { gl_Position = vec4(2.0, 2.0, 0.0, 1.0); gl_PointSize = 0.0; vColor = vec4(0.0); return; }
  vec2 ndc = vec2(dot(d, uCamRight) / (cz * uTanH * uAspect), dot(d, uCamUp) / (cz * uTanH));
  gl_Position = vec4(ndc, 0.0, 1.0);
  float alt = d.y;
  float ext = smoothstep(-0.01, 0.12, alt);            // atmospheric extinction at the horizon
  float visible = smoothstep(uLimMag + 0.4, uLimMag - 0.4, aMag);
  float id = float(gl_VertexID);
  // Stars twinkle (more near the horizon, through more air); planets shine steadily
  float tw = 1.0 + uTwinkle * 0.35 * sin(uTime * (2.0 + fract(id * 0.618) * 7.0) + id) * (1.2 - alt);
  float bright = pow(2.512, -aMag) * 2.2;
  gl_PointSize = clamp((2.6 - aMag * 0.38) * uScale, 1.0, 9.0 * uScale);
  vColor = vec4(aColor, clamp(bright, 0.08, 1.0) * visible * ext * uVis * tw);
}`;

export const POINTS_FS = `#version 300 es
precision highp float;
in vec4 vColor;
out vec4 outColor;
void main() {
  vec2 c = gl_PointCoord - 0.5;
  float r = length(c);
  float core = smoothstep(0.5, 0.0, r);
  float a = vColor.a * core * core;
  outColor = vec4(vColor.rgb * a, a);
}`;

export const LINES_VS = `#version 300 es
precision highp float;
in vec3 aDir;
in float aAlpha;
uniform mat3 uEq;
uniform bool uEquatorial;
uniform vec3 uCamRight;
uniform vec3 uCamUp;
uniform vec3 uCamFwd;
uniform float uTanH;
uniform float uAspect;
out float vAlpha;
void main() {
  vec3 d = uEquatorial ? transpose(uEq) * aDir : aDir;
  float cz = max(dot(d, uCamFwd), 0.02);
  vec2 ndc = vec2(dot(d, uCamRight) / (cz * uTanH * uAspect), dot(d, uCamUp) / (cz * uTanH));
  gl_Position = vec4(ndc, 0.0, 1.0);
  vAlpha = aAlpha * smoothstep(0.0, 0.08, d.y) * step(0.02, dot(d, uCamFwd));
}`;

export const LINES_FS = `#version 300 es
precision highp float;
in float vAlpha;
uniform vec3 uColor;
out vec4 outColor;
void main() { outColor = vec4(uColor * vAlpha, vAlpha); }`;

export const COMPOSITE_FS = `#version 300 es
precision highp float;
in vec2 vNdc;
out vec4 outColor;
uniform sampler2D uScene;
uniform float uTime;
uniform float uWarmth;
uniform float uSaturation;
uniform float uContrast;
uniform float uExposure;
uniform float uVignette;
uniform float uBloom;
uniform vec2 uShake;

vec3 aces(vec3 x) { return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0); }

void main() {
  vec2 uv = vNdc * 0.5 + 0.5 + uShake;
  vec3 c = texture(uScene, uv).rgb;
  // Mip-chain bloom: bright things glow
  vec3 glow = vec3(0.0);
  glow += max(textureLod(uScene, uv, 2.0).rgb - 0.45, 0.0) * 0.6;
  glow += max(textureLod(uScene, uv, 4.0).rgb - 0.35, 0.0) * 0.8;
  glow += max(textureLod(uScene, uv, 6.0).rgb - 0.25, 0.0) * 1.0;
  c += glow * uBloom;
  c *= uExposure * 1.05;
  // Warmth follows the music's mode: bright modes golden, dark modes blue
  c *= mix(vec3(0.88, 0.96, 1.12), vec3(1.12, 1.0, 0.86), uWarmth * 0.5 + 0.5);
  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
  c = mix(vec3(l), c, uSaturation);
  c = (c - 0.18) * uContrast + 0.18;
  c = aces(max(c, 0.0));
  float v = smoothstep(1.4, 0.35, length(vNdc * vec2(1.0, 0.85)));
  c *= mix(1.0, v, uVignette);
  // Fine grain so gradients never band
  float g = fract(sin(dot(gl_FragCoord.xy + uTime, vec2(12.9898, 78.233))) * 43758.5453);
  c += (g - 0.5) / 255.0 * 1.5;
  outColor = vec4(pow(c, vec3(1.0 / 2.2)), 1.0);
}`;
