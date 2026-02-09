import { searchCities, formatLocation } from '../weather/location.js';

/**
 * Manages the location search UI.
 */
export function createControls(onLocationSelect) {
  const locationBtn = document.getElementById('location-btn');
  const searchPanel = document.getElementById('location-search');
  const cityInput = document.getElementById('city-input');
  const cityResults = document.getElementById('city-results');

  let searchTimeout = null;
  let isOpen = false;

  function toggle() {
    isOpen = !isOpen;
    if (isOpen) {
      searchPanel.classList.remove('hidden');
      cityInput.focus();
    } else {
      searchPanel.classList.add('hidden');
      cityInput.value = '';
      cityResults.innerHTML = '';
    }
  }

  function close() {
    isOpen = false;
    searchPanel.classList.add('hidden');
    cityInput.value = '';
    cityResults.innerHTML = '';
  }

  locationBtn.addEventListener('click', toggle);

  cityInput.addEventListener('input', () => {
    clearTimeout(searchTimeout);
    const query = cityInput.value.trim();

    if (query.length < 2) {
      cityResults.innerHTML = '';
      return;
    }

    // Debounce search
    searchTimeout = setTimeout(async () => {
      const results = await searchCities(query);
      cityResults.innerHTML = '';

      for (const result of results) {
        const div = document.createElement('div');
        div.className = 'city-result';
        div.textContent = formatLocation(result);
        div.addEventListener('click', () => {
          onLocationSelect(result);
          close();
        });
        cityResults.appendChild(div);
      }
    }, 300);
  });

  // Close on Escape
  cityInput.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') close();
  });

  return { close };
}
