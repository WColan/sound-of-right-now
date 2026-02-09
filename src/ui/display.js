import { describeWeatherCode } from '../weather/codes.js';
import { getMoonPhaseName } from '../weather/moon.js';

/**
 * Updates the info display overlay with current weather and music data.
 */
export function createDisplay() {
  const locationEl = document.getElementById('info-location');
  const detailsEl = document.getElementById('info-details');

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
     */
    update(weather, musicalParams, tideData = null) {
      const tempF = Math.round(weather.temperature * 9 / 5 + 32);
      const condition = describeWeatherCode(weather.weatherCode);
      const moonName = getMoonPhaseName();
      const mode = capitalize(musicalParams.scaleType);
      const bpm = musicalParams.bpm;
      const timeLabel = musicalParams._meta?.timeOfDay || '';

      let line1 = `${tempF}\u00B0F  ${condition}`;
      let line2 = `${musicalParams.rootNote} ${mode}  \u00B7  ${bpm} BPM  \u00B7  ${moonName}`;

      if (tideData) {
        line1 += `  \u00B7  Tide ${tideData.waterLevel.toFixed(1)}ft`;
      }

      detailsEl.innerHTML = `<div>${line1}</div><div style="margin-top: 0.2rem">${line2}</div>`;
    },
  };
}

function capitalize(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}
