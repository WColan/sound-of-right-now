import {
  searchCities,
  formatLocation,
  getBrowserLocation,
  reverseGeocode,
} from '../weather/location.js';

/**
 * Manages the location search UI.
 */
export function createControls(onLocationSelect) {
  const locationBtn = document.getElementById('location-btn');
  const searchPanel = document.getElementById('location-search');
  const cityInput = document.getElementById('city-input');
  const currentLocationBtn = document.getElementById('current-location-btn');
  const randomLocationBtn = document.getElementById('random-location-btn');
  const cityResults = document.getElementById('city-results');

  let searchTimeout = null;
  let isOpen = false;
  let latestSearchId = 0;
  let latestCurrentLocationRequestId = 0;
  let latestRandomLocationRequestId = 0;
  let latestResults = [];
  let activeResultIndex = -1;

  cityInput.setAttribute('role', 'combobox');
  cityInput.setAttribute('aria-autocomplete', 'list');
  cityInput.setAttribute('aria-controls', 'city-results');
  cityInput.setAttribute('aria-expanded', 'false');
  cityResults.setAttribute('role', 'listbox');

  function setActiveResult(index) {
    if (latestResults.length === 0) {
      activeResultIndex = -1;
      cityInput.removeAttribute('aria-activedescendant');
      return;
    }

    const next = Math.max(0, Math.min(index, latestResults.length - 1));
    activeResultIndex = next;

    const nodes = cityResults.querySelectorAll('.city-result');
    nodes.forEach((node, i) => {
      const isActive = i === activeResultIndex;
      node.classList.toggle('active', isActive);
      node.setAttribute('aria-selected', isActive ? 'true' : 'false');
    });

    const activeNode = nodes[activeResultIndex];
    if (activeNode) {
      cityInput.setAttribute('aria-activedescendant', activeNode.id);
      activeNode.scrollIntoView({ block: 'nearest' });
    }
  }

  function resetResults() {
    latestResults = [];
    activeResultIndex = -1;
    cityInput.removeAttribute('aria-activedescendant');
    cityResults.innerHTML = '';
  }

  function setQuickLocationButtonsVisible(visible) {
    currentLocationBtn?.classList.toggle('hidden', !visible);
    randomLocationBtn?.classList.toggle('hidden', !visible);
  }

  function isCoordinateFallbackName(name) {
    return /^-?\d+(?:\.\d+)?\s*,\s*-?\d+(?:\.\d+)?$/.test(String(name || '').trim());
  }

  function randomLatitude() {
    return -85 + Math.random() * 170;
  }

  function randomLongitude() {
    return -180 + Math.random() * 360;
  }

  async function pickRandomResolvableLocation(maxAttempts = 10) {
    for (let i = 0; i < maxAttempts; i += 1) {
      const latitude = randomLatitude();
      const longitude = randomLongitude();
      const name = await reverseGeocode(latitude, longitude);
      if (name && !isCoordinateFallbackName(name)) {
        return { latitude, longitude, name };
      }
    }

    // If reverse geocoding repeatedly fails to resolve a place name, still return
    // a random point so weather APIs continue to work globally.
    const latitude = randomLatitude();
    const longitude = randomLongitude();
    const name = await reverseGeocode(latitude, longitude);
    return {
      latitude,
      longitude,
      name: name && !isCoordinateFallbackName(name) ? name : 'Random location',
    };
  }

  function selectResult(index) {
    const result = latestResults[index];
    if (!result) return;

    Promise.resolve(onLocationSelect(result)).catch((err) => {
      console.error('Failed to change location:', err);
    });
    close();
  }

  function renderResults(results) {
    latestResults = results;
    activeResultIndex = results.length > 0 ? 0 : -1;
    cityResults.innerHTML = '';

    results.forEach((result, index) => {
      const div = document.createElement('div');
      div.className = 'city-result';
      div.id = `city-result-${index}`;
      div.setAttribute('role', 'option');
      div.setAttribute('aria-selected', index === activeResultIndex ? 'true' : 'false');
      div.textContent = formatLocation(result);

      div.addEventListener('mouseenter', () => {
        setActiveResult(index);
      });
      div.addEventListener('click', () => {
        selectResult(index);
      });

      cityResults.appendChild(div);
    });

    if (results.length > 0) {
      setActiveResult(activeResultIndex);
    } else {
      cityInput.removeAttribute('aria-activedescendant');
    }
  }

  function toggle() {
    isOpen = !isOpen;
    if (isOpen) {
      searchPanel.classList.remove('hidden');
      cityInput.setAttribute('aria-expanded', 'true');
      setQuickLocationButtonsVisible(true);
      cityInput.focus();
    } else {
      clearTimeout(searchTimeout);
      searchTimeout = null;
      searchPanel.classList.add('hidden');
      cityInput.setAttribute('aria-expanded', 'false');
      cityInput.value = '';
      resetResults();
      setQuickLocationButtonsVisible(true);
      latestSearchId++;
      latestCurrentLocationRequestId++;
      latestRandomLocationRequestId++;
    }
  }

  function close() {
    clearTimeout(searchTimeout);
    searchTimeout = null;
    isOpen = false;
    searchPanel.classList.add('hidden');
    cityInput.setAttribute('aria-expanded', 'false');
    cityInput.value = '';
    resetResults();
    setQuickLocationButtonsVisible(true);
    latestSearchId++;
    latestCurrentLocationRequestId++;
    latestRandomLocationRequestId++;
  }

  locationBtn.addEventListener('click', toggle);

  cityInput.addEventListener('input', () => {
    clearTimeout(searchTimeout);
    const query = cityInput.value.trim();
    setQuickLocationButtonsVisible(query.length === 0);

    if (query.length < 2) {
      resetResults();
      return;
    }

    // Debounce search
    searchTimeout = setTimeout(async () => {
      const searchId = ++latestSearchId;
      const results = await searchCities(query);
      if (!isOpen) return;
      if (searchId !== latestSearchId) return;
      if (cityInput.value.trim() !== query) return;
      renderResults(results);
    }, 300);
  });

  if (currentLocationBtn) {
    currentLocationBtn.addEventListener('click', async () => {
      if (!isOpen) return;
      const requestId = ++latestCurrentLocationRequestId;
      currentLocationBtn.setAttribute('aria-busy', 'true');

      try {
        const browserLocation = await getBrowserLocation();
        if (!browserLocation) return;
        if (!isOpen || requestId !== latestCurrentLocationRequestId) return;

        const resolvedName = await reverseGeocode(browserLocation.latitude, browserLocation.longitude);
        if (!isOpen || requestId !== latestCurrentLocationRequestId) return;

        await Promise.resolve(onLocationSelect({
          ...browserLocation,
          name: resolvedName || 'Current location',
          admin1: '',
          country: '',
        }));
        close();
      } catch (err) {
        console.error('Failed to use current location:', err);
      } finally {
        if (requestId === latestCurrentLocationRequestId) {
          currentLocationBtn.removeAttribute('aria-busy');
        }
      }
    });
  }

  if (randomLocationBtn) {
    randomLocationBtn.addEventListener('click', async () => {
      if (!isOpen) return;
      const requestId = ++latestRandomLocationRequestId;
      randomLocationBtn.setAttribute('aria-busy', 'true');

      try {
        const randomLocation = await pickRandomResolvableLocation();
        if (!isOpen || requestId !== latestRandomLocationRequestId) return;

        await Promise.resolve(onLocationSelect({
          ...randomLocation,
          admin1: '',
          country: '',
        }));
        close();
      } catch (err) {
        console.error('Failed to select random location:', err);
      } finally {
        if (requestId === latestRandomLocationRequestId) {
          randomLocationBtn.removeAttribute('aria-busy');
        }
      }
    });
  }

  // Keyboard navigation for location search
  cityInput.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      close();
      return;
    }

    if (e.key === 'ArrowDown') {
      if (latestResults.length === 0) return;
      e.preventDefault();
      setActiveResult(activeResultIndex < 0 ? 0 : (activeResultIndex + 1) % latestResults.length);
      return;
    }

    if (e.key === 'ArrowUp') {
      if (latestResults.length === 0) return;
      e.preventDefault();
      setActiveResult(activeResultIndex < 0
        ? latestResults.length - 1
        : (activeResultIndex - 1 + latestResults.length) % latestResults.length);
      return;
    }

    if (e.key === 'Enter') {
      if (latestResults.length === 0) return;
      e.preventDefault();
      const index = activeResultIndex >= 0 ? activeResultIndex : 0;
      selectResult(index);
    }
  });

  return { close };
}
