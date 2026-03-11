/**
 * Pull-to-refresh for mobile PWA (fullscreen home-screen mode).
 *
 * Draws a small arc indicator that fills as the user pulls down,
 * then triggers a page reload with a brief completion animation.
 *
 * Only activates on touch devices and ignores pulls that start on
 * interactive controls (inputs, sliders, scrollable containers).
 */

const THRESHOLD = 100;       // px of pull distance required to trigger reload
const MAX_PULL   = 140;      // px beyond which we clamp
const INDICATOR_Y_MAX = 64;  // how far the indicator travels down from the top
const DEAD_ZONE  = 10;       // px of movement before indicator appears (avoids false triggers on taps)

/**
 * Initialise pull-to-refresh on the document.
 * Call once after DOMContentLoaded.
 */
export function setupPullToRefresh() {
  // Only activate on touch-capable devices
  if (!('ontouchstart' in window)) return { dispose: () => {} };

  const indicator = document.getElementById('ptr-indicator');
  if (!indicator) return { dispose: () => {} };

  const circle = indicator.querySelector('.ptr-arc');
  const circumference = circle ? 2 * Math.PI * 18 : 0; // r=18

  if (circle) {
    circle.style.strokeDasharray  = `${circumference}`;
    circle.style.strokeDashoffset = `${circumference}`;
  }

  let startY = 0;
  let pulling = false;
  let triggered = false;
  let lastProgress = 0;

  function shouldIgnore(e) {
    const t = e.target;
    // Ignore pulls that start on interactive elements or scrollable containers
    return !!t.closest('input, textarea, select, .volume-slider, .city-results, .info-panel');
  }

  function onTouchStart(e) {
    if (shouldIgnore(e)) return;
    // Only pull-to-refresh when already at top (this app has no scroll, but guard anyway)
    if (window.scrollY > 0) return;
    startY = e.touches[0].clientY;
    pulling = true;
    triggered = false;
    lastProgress = 0;
  }

  function onTouchMove(e) {
    if (!pulling) return;

    const currentY = e.touches[0].clientY;
    const delta = currentY - startY;

    // Only care about downward pulls past the dead zone
    if (delta <= DEAD_ZONE) {
      hide();
      return;
    }

    // Prevent the browser's own overscroll behaviour
    e.preventDefault();

    const effective = delta - DEAD_ZONE;
    const clamped = Math.min(effective, MAX_PULL);
    const progress = Math.min(clamped / THRESHOLD, 1);
    const indicatorY = (clamped / MAX_PULL) * INDICATOR_Y_MAX;

    lastProgress = progress;
    show(progress, indicatorY);
  }

  function onTouchEnd() {
    if (!pulling) return;
    pulling = false;

    if (triggered) return;

    if (lastProgress >= 1) {
      triggered = true;
      triggerReload();
    } else {
      hide();
    }
  }

  function show(progress, y) {
    indicator.classList.add('active');
    indicator.style.transform = `translateX(-50%) translateY(${y}px)`;
    indicator.style.opacity = String(Math.min(progress * 1.5, 1));

    if (circle) {
      const offset = circumference * (1 - progress);
      circle.style.strokeDashoffset = `${offset}`;
    }

    // Add a "ready" visual cue when fully pulled
    if (progress >= 1) {
      indicator.classList.add('ready');
    } else {
      indicator.classList.remove('ready');
    }
  }

  function hide() {
    lastProgress = 0;
    indicator.classList.remove('active', 'ready');
    indicator.style.transform = 'translateX(-50%) translateY(0px)';
    indicator.style.opacity = '0';

    if (circle) {
      circle.style.strokeDashoffset = `${circumference}`;
    }
  }

  function triggerReload() {
    indicator.classList.add('reloading');

    // Brief animation before actual reload so user gets visual feedback
    setTimeout(() => {
      window.location.reload();
    }, 500);
  }

  document.addEventListener('touchstart', onTouchStart, { passive: true });
  document.addEventListener('touchmove', onTouchMove, { passive: false });
  document.addEventListener('touchend', onTouchEnd, { passive: true });
  document.addEventListener('touchcancel', onTouchEnd, { passive: true });

  return {
    dispose() {
      document.removeEventListener('touchstart', onTouchStart);
      document.removeEventListener('touchmove', onTouchMove);
      document.removeEventListener('touchend', onTouchEnd);
      document.removeEventListener('touchcancel', onTouchEnd);
    },
  };
}
