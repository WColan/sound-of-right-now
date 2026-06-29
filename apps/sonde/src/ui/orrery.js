/**
 * Orrery — SONDE's sound-reactive visualizer.
 *
 * Draws the solar system as you hear it: the Sun at centre (pulsing with the
 * overall audio energy), concentric orbit rings, each planet at its true
 * heliocentric longitude, alignment lines when planets form aspects, Earth as
 * the listener's vantage, and a moon-phase glyph. Presentation only — it reads
 * snapshots produced by the sky layer and FFT data from the engine analyser.
 *
 * Bodies are also hover/tap interactive: pointing at one shows a tooltip naming
 * it and explaining how it's shaping the sound right now (see ./influence.js).
 */
import { describeBody, findBodyAt } from './influence.js';

const BODY_VIEW = {
  Mercury: { color: '#b9a07a', meanAU: 0.387, size: 2.5 },
  Venus:   { color: '#e8cda0', meanAU: 0.723, size: 4 },
  Mars:    { color: '#d3754a', meanAU: 1.524, size: 3.2 },
  Jupiter: { color: '#d8a878', meanAU: 5.203, size: 7 },
  Saturn:  { color: '#e0c89a', meanAU: 9.537, size: 6 },
  Uranus:  { color: '#9fd6d8', meanAU: 19.19, size: 5 },
  Neptune: { color: '#6f8fe0', meanAU: 30.07, size: 5 },
  Pluto:   { color: '#a98e86', meanAU: 39.48, size: 2 },
};
const EARTH_VIEW = { color: '#5da6ff', meanAU: 1.0, size: 3.4 };

const AU_MIN = 0.387;
const AU_MAX = 39.48;

export function createOrrery(canvas, analyser) {
  const ctx = canvas.getContext('2d');
  let width = 0;
  let height = 0;
  let dpr = Math.min(window.devicePixelRatio || 1, 2);
  let stars = [];

  // ── Interaction state ──
  let lastSnapshot = null;
  let lastParams = null;
  let hitTargets = []; // [{ name, x, y, hitR }] rebuilt every frame
  let hovered = null;  // body under the mouse (transient)
  let pinned = null;   // body tapped/clicked (sticky, for touch)
  const activeName = () => pinned || hovered;

  const tooltip = document.createElement('div');
  tooltip.className = 'sonde-tooltip';
  tooltip.style.display = 'none';
  document.body.appendChild(tooltip);

  function renderTooltipContent(name) {
    const info = describeBody(name, lastSnapshot, lastParams);
    tooltip.innerHTML =
      `<div class="tt-title">${info.title}</div>` +
      (info.subtitle ? `<div class="tt-sub">${info.subtitle}</div>` : '') +
      info.lines.map((l) => `<div class="tt-line"><span class="tt-label">${l.label}</span> ${l.value}</div>`).join('');
  }

  function positionTooltip(clientX, clientY) {
    const pad = 14;
    const w = tooltip.offsetWidth;
    const h = tooltip.offsetHeight;
    let x = clientX + pad;
    let y = clientY + pad;
    if (x + w > window.innerWidth - 8) x = clientX - w - pad;
    if (y + h > window.innerHeight - 8) y = clientY - h - pad;
    tooltip.style.left = `${Math.max(8, x)}px`;
    tooltip.style.top = `${Math.max(8, y)}px`;
  }

  function showTooltip(name, clientX, clientY) {
    if (!name || !lastSnapshot) { hideTooltip(); return; }
    renderTooltipContent(name);
    tooltip.style.display = 'block';
    positionTooltip(clientX, clientY);
  }

  function hideTooltip() {
    tooltip.style.display = 'none';
  }

  function pointFromEvent(e) {
    const rect = canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  function onPointerMove(e) {
    if (e.pointerType && e.pointerType !== 'mouse') return; // touch handled on tap
    const { x, y } = pointFromEvent(e);
    const hit = findBodyAt(x, y, hitTargets);
    hovered = hit ? hit.name : null;
    if (pinned) return; // a pinned (tapped) body wins until dismissed
    if (hovered) showTooltip(hovered, e.clientX, e.clientY);
    else hideTooltip();
  }

  function onPointerDown(e) {
    const { x, y } = pointFromEvent(e);
    const hit = findBodyAt(x, y, hitTargets);
    if (hit) {
      pinned = pinned === hit.name ? null : hit.name;
      if (pinned) showTooltip(pinned, e.clientX, e.clientY);
      else hideTooltip();
    } else {
      pinned = null;
      hovered = null;
      hideTooltip();
    }
  }

  function onPointerLeave() {
    hovered = null;
    if (!pinned) hideTooltip();
  }

  canvas.addEventListener('pointermove', onPointerMove, { passive: true });
  canvas.addEventListener('pointerdown', onPointerDown, { passive: true });
  canvas.addEventListener('pointerleave', onPointerLeave, { passive: true });

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    width = canvas.clientWidth;
    height = canvas.clientHeight;
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    seedStars();
  }

  function seedStars() {
    const count = Math.round((width * height) / 6000);
    stars = Array.from({ length: count }, () => ({
      x: Math.random() * width,
      y: Math.random() * height,
      r: Math.random() * 1.2 + 0.2,
      a: Math.random() * 0.5 + 0.2,
    }));
  }

  /** Log-scaled orbit radius for a mean distance in AU. */
  function ringRadius(au) {
    const minDim = Math.min(width, height);
    const inner = minDim * 0.07;
    const outer = minDim * 0.46;
    const t = (Math.log10(au) - Math.log10(AU_MIN)) / (Math.log10(AU_MAX) - Math.log10(AU_MIN));
    return inner + t * (outer - inner);
  }

  /** Screen position of a body at a heliocentric longitude (deg). */
  function position(au, lonDeg, cx, cy) {
    const r = ringRadius(au);
    const a = (lonDeg * Math.PI) / 180;
    return { x: cx + r * Math.cos(a), y: cy - r * Math.sin(a), r };
  }

  /** Overall low-frequency energy (0–1) from the FFT, for the Sun's pulse. */
  function bassEnergy() {
    if (!analyser) return 0.4;
    const data = analyser.getValue();
    let sum = 0;
    const n = Math.min(64, data.length);
    for (let i = 0; i < n; i++) sum += Math.max(0, (data[i] + 140) / 140); // dB → ~0..1
    return Math.min(1, sum / n);
  }

  function drawMoon(illumination, cx, cy, radius) {
    // Lit disc, then a shadow disc offset by phase to suggest the terminator.
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.fillStyle = '#11131c';
    ctx.fill();
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(220, 226, 245, ${0.2 + 0.8 * illumination})`;
    ctx.globalAlpha = 0.25 + 0.75 * illumination;
    ctx.fill();
    ctx.restore();
  }

  /** Ring + name label drawn around the hovered/tapped body. */
  function drawHighlight(x, y, r, label) {
    ctx.save();
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.85)';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.arc(x, y, r + 5, 0, Math.PI * 2);
    ctx.stroke();
    ctx.font = '600 12px Inter, system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
    ctx.fillText(label, x, y - r - 11);
    ctx.restore();
  }

  function render(snapshot, aspects = [], params = null) {
    if (!width || !height) return;
    lastSnapshot = snapshot;
    lastParams = params;
    const targets = [];
    const active = activeName();
    const cx = width / 2;
    const cy = height / 2;

    // Backdrop
    const bg = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(width, height) * 0.7);
    bg.addColorStop(0, '#0b0e1a');
    bg.addColorStop(1, '#04050a');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, width, height);

    for (const s of stars) {
      ctx.globalAlpha = s.a;
      ctx.fillStyle = '#cdd6ff';
      ctx.fillRect(s.x, s.y, s.r, s.r);
    }
    ctx.globalAlpha = 1;

    // Orbit rings
    ctx.lineWidth = 1;
    for (const name of Object.keys(BODY_VIEW)) {
      ctx.beginPath();
      ctx.arc(cx, cy, ringRadius(BODY_VIEW[name].meanAU), 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(120, 140, 200, 0.10)';
      ctx.stroke();
    }
    // Earth's orbit, faintly highlighted
    ctx.beginPath();
    ctx.arc(cx, cy, ringRadius(EARTH_VIEW.meanAU), 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(93, 166, 255, 0.18)';
    ctx.stroke();

    // Compute screen positions
    const pos = {};
    for (const name of Object.keys(BODY_VIEW)) {
      const b = snapshot.bodies[name];
      if (b) pos[name] = position(BODY_VIEW[name].meanAU, b.lonHelio, cx, cy);
    }

    // Aspect lines (drawn under the planets)
    for (const asp of aspects) {
      const pa = pos[asp.a];
      const pb = pos[asp.b];
      if (!pa || !pb) continue;
      const tense = asp.harmony === 'tense';
      ctx.beginPath();
      ctx.moveTo(pa.x, pa.y);
      ctx.lineTo(pb.x, pb.y);
      ctx.strokeStyle = tense
        ? `rgba(255, 110, 110, ${0.15 + 0.5 * asp.strength})`
        : `rgba(120, 220, 230, ${0.15 + 0.5 * asp.strength})`;
      ctx.lineWidth = 0.5 + 1.5 * asp.strength;
      ctx.stroke();
    }
    ctx.lineWidth = 1;

    // Sun
    const pulse = bassEnergy();
    const sunR = Math.min(width, height) * (0.018 + 0.012 * pulse);
    const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, sunR * 5);
    glow.addColorStop(0, `rgba(255, 226, 150, ${0.85})`);
    glow.addColorStop(0.4, `rgba(255, 180, 90, ${0.35 + 0.3 * pulse})`);
    glow.addColorStop(1, 'rgba(255, 160, 60, 0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(cx, cy, sunR * 5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffe9b0';
    ctx.beginPath();
    ctx.arc(cx, cy, sunR, 0, Math.PI * 2);
    ctx.fill();
    targets.push({ name: 'Sun', x: cx, y: cy, hitR: Math.max(sunR + 4, 20) });
    if (active === 'Sun') drawHighlight(cx, cy, sunR, 'Sun');

    // Earth (the vantage)
    if (snapshot.earth) {
      const pe = position(EARTH_VIEW.meanAU, snapshot.earth.lonHelio, cx, cy);
      ctx.beginPath();
      ctx.arc(pe.x, pe.y, EARTH_VIEW.size, 0, Math.PI * 2);
      ctx.fillStyle = EARTH_VIEW.color;
      ctx.fill();
      ctx.strokeStyle = 'rgba(160, 200, 255, 0.6)';
      ctx.beginPath();
      ctx.arc(pe.x, pe.y, EARTH_VIEW.size + 3, 0, Math.PI * 2);
      ctx.stroke();
      targets.push({ name: 'Earth', x: pe.x, y: pe.y, hitR: Math.max(EARTH_VIEW.size + 8, 14) });
      if (active === 'Earth') drawHighlight(pe.x, pe.y, EARTH_VIEW.size, 'Earth');
    }

    // Planets
    for (const name of Object.keys(BODY_VIEW)) {
      const p = pos[name];
      const b = snapshot.bodies[name];
      if (!p || !b) continue;
      const view = BODY_VIEW[name];

      // Soft glow
      const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, view.size * 4);
      g.addColorStop(0, view.color);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.globalAlpha = 0.5;
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(p.x, p.y, view.size * 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;

      ctx.beginPath();
      ctx.arc(p.x, p.y, view.size, 0, Math.PI * 2);
      ctx.fillStyle = view.color;
      ctx.fill();

      // Retrograde marker
      if (b.retrograde) {
        ctx.strokeStyle = 'rgba(255, 120, 120, 0.8)';
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.arc(p.x, p.y, view.size + 3.5, 0, Math.PI * 2);
        ctx.stroke();
        ctx.lineWidth = 1;
      }

      targets.push({ name, x: p.x, y: p.y, hitR: Math.max(view.size + 8, 14) });
      if (active === name) drawHighlight(p.x, p.y, view.size, name);
    }

    // Moon-phase glyph, bottom-left
    if (snapshot.moon) {
      drawMoon(snapshot.moon.illumination, 38, height - 38, 16);
      targets.push({ name: 'Moon', x: 38, y: height - 38, hitR: 22 });
      if (active === 'Moon') drawHighlight(38, height - 38, 16, 'Moon');
    }

    // Publish hit targets and keep an open tooltip's values live under time-warp.
    hitTargets = targets;
    if (active) renderTooltipContent(active);
  }

  const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(resize) : null;
  if (ro) ro.observe(canvas);
  else window.addEventListener('resize', resize);
  resize();

  return {
    render,
    resize,
    dispose() {
      if (ro) ro.disconnect();
      else window.removeEventListener('resize', resize);
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointerleave', onPointerLeave);
      tooltip.remove();
    },
  };
}
