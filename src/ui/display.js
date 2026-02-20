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
     * @param {object} [aqiData]
     */
    update(weather, musicalParams, tideData = null, aqiData = null) {
      const tempF = Math.round(weather.temperature * 9 / 5 + 32);
      const condition = describeWeatherCode(weather.weatherCode);
      const moonName = getMoonPhaseName();
      const mode = capitalize(musicalParams.scaleType);
      const bpm = musicalParams.bpm;

      let line1 = `${tempF}\u00B0F  ${condition}`;
      let line2 = `${musicalParams.rootNote} ${mode}  \u00B7  ${bpm} BPM  \u00B7  ${moonName}`;

      if (tideData) {
        line1 += `  \u00B7  Tide ${tideData.waterLevel.toFixed(1)}ft`;
      }

      // Third line: detailed sensor readings
      const windDir = degreesToCompass(weather.windDirection);
      const parts = [
        `${weather.humidity}% RH`,
        `${Math.round(weather.windSpeed)} km/h ${windDir}`,
        `${Math.round(weather.pressure)} hPa`,
      ];
      if (weather.uvIndex != null && weather.uvIndex > 0) {
        parts.push(`UV ${weather.uvIndex.toFixed(0)}`);
      }
      if (aqiData?.aqi != null) {
        parts.push(`AQI ${aqiData.aqi}`);
      }
      const line3 = parts.join('  \u00B7  ');

      detailsEl.innerHTML =
        `<div>${line1}</div>` +
        `<div style="margin-top: 0.2rem">${line2}</div>` +
        `<div class="info-details-sub">${line3}</div>`;
    },
  };
}

function capitalize(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

/**
 * Convert wind bearing in degrees to 8-point compass direction.
 */
function degreesToCompass(degrees) {
  const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  return dirs[Math.round(degrees / 45) % 8];
}
