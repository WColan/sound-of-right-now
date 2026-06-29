/**
 * Controls — wires the transport bar: play/pause, master volume, the time-warp
 * scrubber (snapped to SPEED_PRESETS) and the "Now" button that returns the sky
 * to the live present. Pure DOM glue; all behavior is delegated via callbacks.
 */
import { SPEED_PRESETS } from '../sky/clock.js';

export function createControls({ onPlayPause, onVolume, onSpeed, onNow }) {
  const playBtn = document.getElementById('sonde-play');
  const volSlider = document.getElementById('sonde-volume');
  const speedSlider = document.getElementById('sonde-speed');
  const nowBtn = document.getElementById('sonde-now');

  let playing = true;

  function setPlayingState(isPlaying) {
    playing = isPlaying;
    if (playBtn) playBtn.textContent = playing ? '❚❚' : '▶';
    if (playBtn) playBtn.setAttribute('aria-label', playing ? 'pause' : 'play');
  }

  if (playBtn) {
    playBtn.addEventListener('click', () => {
      setPlayingState(!playing);
      onPlayPause?.(playing);
    });
  }

  if (volSlider) {
    volSlider.addEventListener('input', () => onVolume?.(Number(volSlider.value) / 100));
  }

  if (speedSlider) {
    speedSlider.min = '0';
    speedSlider.max = String(SPEED_PRESETS.length - 1);
    speedSlider.step = '1';
    speedSlider.addEventListener('input', () => {
      const idx = Number(speedSlider.value);
      onSpeed?.(SPEED_PRESETS[idx], idx);
    });
  }

  if (nowBtn) {
    nowBtn.addEventListener('click', () => {
      if (speedSlider) speedSlider.value = '0';
      onNow?.();
    });
  }

  return {
    setPlayingState,
    getSpeedIndex() {
      return speedSlider ? Number(speedSlider.value) : 0;
    },
  };
}
