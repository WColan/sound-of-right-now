/**
 * Handle global keyboard shortcuts for primary runtime controls.
 */
export function handleMainKeydown(event, {
  isEngineReady,
  activeTagName,
  pauseBtn,
  secondaryMenuController,
  weatherPanel,
  audioPanel,
  conductorPanel,
  locationBtn,
  mixBtn,
  toggleWeatherPanel,
  toggleAudioPanel,
  toggleConductorPanel,
  canvas,
}) {
  if (!isEngineReady) return;
  if (activeTagName === 'INPUT' || activeTagName === 'TEXTAREA' || activeTagName === 'SELECT') return;

  switch (event.key) {
    case ' ':
      event.preventDefault();
      pauseBtn?.click();
      break;
    case 'Escape':
      secondaryMenuController?.close?.();
      weatherPanel?.classList.add('hidden');
      audioPanel?.classList.add('hidden');
      conductorPanel?.classList.add('hidden');
      break;
    case 'l':
    case 'L':
      event.preventDefault();
      locationBtn?.click?.();
      break;
    case 'm':
    case 'M':
      mixBtn?.click?.();
      break;
    case 'w':
    case 'W':
      toggleWeatherPanel?.();
      break;
    case 'a':
    case 'A':
      toggleAudioPanel?.();
      break;
    case 'c':
    case 'C':
      toggleConductorPanel?.();
      break;
    case 'f':
    case 'F':
      canvas?.requestFullscreen?.();
      break;
    default:
      break;
  }
}
