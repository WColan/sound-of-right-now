import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createControls } from './controls.js';
import { FakeDocument, FakeElement, click, input, keydown } from '../test/fake-dom.js';
import { getBrowserLocation, reverseGeocode, searchCities } from '../weather/location.js';

vi.mock('../weather/location.js', () => ({
  searchCities: vi.fn(),
  getBrowserLocation: vi.fn(),
  reverseGeocode: vi.fn(),
  formatLocation: (result) => `${result.name}${result.admin1 ? `, ${result.admin1}` : ''}`,
}));

function setupDom() {
  const document = new FakeDocument();
  global.document = document;

  const locationBtn = new FakeElement('button', document);
  locationBtn.id = 'location-btn';

  const searchPanel = new FakeElement('div', document);
  searchPanel.id = 'location-search';
  searchPanel.classList.add('hidden');

  const cityInput = new FakeElement('input', document);
  cityInput.id = 'city-input';

  const currentLocationBtn = new FakeElement('button', document);
  currentLocationBtn.id = 'current-location-btn';

  const randomLocationBtn = new FakeElement('button', document);
  randomLocationBtn.id = 'random-location-btn';

  const cityResults = new FakeElement('div', document);
  cityResults.id = 'city-results';

  searchPanel.appendChild(cityInput);
  searchPanel.appendChild(currentLocationBtn);
  searchPanel.appendChild(randomLocationBtn);
  searchPanel.appendChild(cityResults);
  document.body.appendChild(locationBtn);
  document.body.appendChild(searchPanel);

  return { locationBtn, searchPanel, cityInput, currentLocationBtn, randomLocationBtn, cityResults };
}

describe('createControls', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
    delete global.document;
  });

  it('opens and closes the location search panel', () => {
    const { locationBtn, searchPanel, cityInput, currentLocationBtn, randomLocationBtn } = setupDom();
    createControls(() => {});

    click(locationBtn);
    expect(searchPanel.classList.contains('hidden')).toBe(false);
    expect(cityInput.getAttribute('aria-expanded')).toBe('true');
    expect(currentLocationBtn.classList.contains('hidden')).toBe(false);
    expect(randomLocationBtn.classList.contains('hidden')).toBe(false);

    keydown(cityInput, 'Escape');
    expect(searchPanel.classList.contains('hidden')).toBe(true);
    expect(cityInput.getAttribute('aria-expanded')).toBe('false');
  });

  it('supports ArrowUp/ArrowDown/Enter keyboard selection', async () => {
    const results = [
      { name: 'San Francisco', admin1: 'California', latitude: 37.77, longitude: -122.42 },
      { name: 'San Diego', admin1: 'California', latitude: 32.71, longitude: -117.16 },
      { name: 'San Jose', admin1: 'California', latitude: 37.33, longitude: -121.88 },
    ];
    searchCities.mockResolvedValue(results);

    const { locationBtn, searchPanel, cityInput, cityResults } = setupDom();
    const onLocationSelect = vi.fn();
    createControls(onLocationSelect);

    click(locationBtn);
    input(cityInput, 'san');
    await vi.advanceTimersByTimeAsync(300);

    expect(cityResults.children).toHaveLength(3);
    expect(cityResults.children[0].classList.contains('active')).toBe(true);

    keydown(cityInput, 'ArrowDown');
    expect(cityResults.children[1].classList.contains('active')).toBe(true);

    keydown(cityInput, 'ArrowUp');
    expect(cityResults.children[0].classList.contains('active')).toBe(true);

    keydown(cityInput, 'ArrowUp');
    expect(cityResults.children[2].classList.contains('active')).toBe(true);

    keydown(cityInput, 'Enter');
    expect(onLocationSelect).toHaveBeenCalledTimes(1);
    expect(onLocationSelect).toHaveBeenCalledWith(results[2]);
    expect(searchPanel.classList.contains('hidden')).toBe(true);
  });

  it('hides current-location while typing and selects current location on click', async () => {
    getBrowserLocation.mockResolvedValue({ latitude: 37.77, longitude: -122.42, name: null });
    reverseGeocode.mockResolvedValue('San Francisco, United States');

    const { locationBtn, searchPanel, cityInput, currentLocationBtn, randomLocationBtn } = setupDom();
    const onLocationSelect = vi.fn();
    createControls(onLocationSelect);

    click(locationBtn);
    expect(currentLocationBtn.classList.contains('hidden')).toBe(false);
    expect(randomLocationBtn.classList.contains('hidden')).toBe(false);

    input(cityInput, 's');
    expect(currentLocationBtn.classList.contains('hidden')).toBe(true);
    expect(randomLocationBtn.classList.contains('hidden')).toBe(true);

    input(cityInput, '');
    expect(currentLocationBtn.classList.contains('hidden')).toBe(false);
    expect(randomLocationBtn.classList.contains('hidden')).toBe(false);

    click(currentLocationBtn);
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    expect(getBrowserLocation).toHaveBeenCalledTimes(1);
    expect(reverseGeocode).toHaveBeenCalledWith(37.77, -122.42);
    expect(onLocationSelect).toHaveBeenCalledWith({
      latitude: 37.77,
      longitude: -122.42,
      name: 'San Francisco, United States',
      admin1: '',
      country: '',
    });
    expect(searchPanel.classList.contains('hidden')).toBe(true);
  });

  it('selects a random location and retries unresolved reverse-geocode names', async () => {
    reverseGeocode
      .mockResolvedValueOnce('12.34, -56.78')
      .mockResolvedValueOnce('Tokyo, Japan');

    const { locationBtn, randomLocationBtn, searchPanel } = setupDom();
    const onLocationSelect = vi.fn();
    createControls(onLocationSelect);

    click(locationBtn);
    click(randomLocationBtn);

    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();

    expect(reverseGeocode).toHaveBeenCalledTimes(2);
    expect(onLocationSelect).toHaveBeenCalledTimes(1);
    const selected = onLocationSelect.mock.calls[0][0];
    expect(selected.name).toBe('Tokyo, Japan');
    expect(typeof selected.latitude).toBe('number');
    expect(typeof selected.longitude).toBe('number');
    expect(selected.latitude).toBeGreaterThanOrEqual(-85);
    expect(selected.latitude).toBeLessThanOrEqual(85);
    expect(selected.longitude).toBeGreaterThanOrEqual(-180);
    expect(selected.longitude).toBeLessThanOrEqual(180);
    expect(searchPanel.classList.contains('hidden')).toBe(true);
  });
});
