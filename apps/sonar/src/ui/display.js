import { describeWeatherCode } from '../weather/codes.js';

/**
 * Convert wind bearing in degrees to 8-point compass direction.
 */
export function degreesToCompass(degrees) {
  const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  return dirs[Math.round(degrees / 45) % 8];
}

function capitalize(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

/**
 * Format a local time string from a UTC offset.
 * Uses UTC arithmetic to avoid browser timezone interference.
 */
function formatLocalTime(utcOffsetSeconds) {
  const localMs = Date.now() + utcOffsetSeconds * 1000;
  const d = new Date(localMs);
  const hours = d.getUTCHours();
  const minutes = d.getUTCMinutes();
  const period = hours >= 12 ? 'PM' : 'AM';
  const h12 = hours % 12 || 12;
  return `${h12}:${String(minutes).padStart(2, '0')} ${period}`;
}

/**
 * Updates the info display overlay with current weather and music data.
 * Minimal layout: location + local time on row 1, curated blend on row 2.
 */
export function createDisplay() {
  const locationEl = document.getElementById('info-location');
  const timeEl = document.getElementById('info-time');
  const detailsEl = document.getElementById('info-details');

  let storedUtcOffset = 0;
  let timeInterval = null;

  function updateTimeDisplay() {
    if (timeEl) {
      timeEl.textContent = formatLocalTime(storedUtcOffset);
    }
  }

  // Update the clock every 30 seconds
  timeInterval = setInterval(updateTimeDisplay, 30000);

  return {
    /**
     * Set the location name.
     * @param {string} name
     */
    setLocation(name) {
      locationEl.textContent = name;
    },

    /**
     * Update the display with weather data and musical params.
     * @param {import('../weather/fetcher.js').WeatherState} weather
     * @param {object} musicalParams
     * @param {object} [tideData]
     * @param {object} [aqiData]
     */
    update(weather, musicalParams, tideData = null, aqiData = null) {
      // Store UTC offset for ongoing time updates
      storedUtcOffset = weather.utcOffsetSeconds ?? 0;
      updateTimeDisplay();

      const tempF = Math.round(weather.temperature * 9 / 5 + 32);
      const condition = describeWeatherCode(weather.weatherCode);
      const mode = capitalize(musicalParams.scaleType);
      const bpm = musicalParams.bpm;

      // Single curated blend line: weather + audio essentials
      const blendLine = `${tempF}\u00B0F ${condition}  \u00B7  ${musicalParams.rootNote} ${mode}  \u00B7  ${bpm} BPM`;
      detailsEl.innerHTML = `<div>${blendLine}</div>`;
    },

    /** Clean up the time interval */
    dispose() {
      if (timeInterval) {
        clearInterval(timeInterval);
        timeInterval = null;
      }
    },
  };
}
