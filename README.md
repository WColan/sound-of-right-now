# Sound of Right Now

A generative ambient music web app that sonifies live weather and environmental conditions. Every location sounds different, every hour sounds different, and the music evolves continuously without repeating.

Open the app, share your location (or search for any city), and listen to the weather.

## How It Works

Real-time environmental data is fetched from public APIs and mapped through a pure-function music pipeline:

```
[Weather APIs] -> [Mapper] -> [Interpolator] -> [Sound Engine] -> [Audio Output]
                                                    |
                                                    v
                                               [Visualizer]
```

Core mappings:

- **Weather category** sets harmonic mood and texture (clear/cloudy/fog/drizzle/rain/snow/storm).
- **Temperature + apparent temperature** choose mode/root and influence tempo and timbre profile.
- **Time of day + sunrise/sunset proximity** shape brightness, volume scaling, and golden-hour warmth.
- **Wind speed/direction** drive rhythmic density, stereo movement, filter sweeps, and wind-chime activity.
- **Pressure + pressure trend** control harmonic rhythm, low-end behavior, and tension/brightness shifts.
- **Humidity** controls reverb tail/wetness and subtle brightness.
- **Cloud cover** dims brightness and master filter.
- **Moon phase/fullness** modulate LFO and chorus behavior.
- **AQI** introduces haze (filter damping + wetter reverb).
- **Tides** (coastal) swell bass response.
- **Season + latitude** add hemisphere-aware seasonal modulation.
- **UV index** opens arpeggio brightness and can trigger microtonal drift context.

## Voices

The engine runs **8 voices**:

| Voice | Role |
|-------|------|
| **Pad** | Sustained harmonic bed using dual-synth A/B crossfades for smooth chord transitions |
| **Arpeggio** | Chord-aware rhythmic motion with weather-driven rhythm templates |
| **Bass** | Foundation layer with optional walking-bass behavior in darker moods |
| **Drone** | Sub root+fifth support, pressure/category-shaped filtering |
| **Melody** | Probabilistic phrase generator responding to chord and celestial context |
| **Texture** | Atmospheric noise layer with optional rain-drop transient overlay |
| **Percussion** | Subtle membrane/metal patterns by weather category |
| **Wind Chime** | Sparse high-register stochastic notes activated by wind |

## Audio Architecture

Main path:

```
[Pad/Arp/Bass/Texture/Drone/Melody via spatial panners]
  -> [Chorus] -> [Delay] -> [Reverb] -> [Master Filter]
  -> [Master Gain Stack] -> [Limiter] -> [Analysers] -> [Destination]
```

Additional paths:

- **Percussion** uses a dedicated short reverb into the master gain stack.
- **Bass + Drone** also feed a parallel sub-bass bus (lowpass + saturation + gain) into the master gain stack.
- **Master Gain Stack** composes weather gain, user volume slider, and sleep-fade attenuation.

### Spatial Audio

- Uses **Tone.js `Panner3D` with HRTF** on supported browsers for binaural headphone imaging.
- Falls back automatically to stereo `Panner` if `Panner3D` is unavailable.
- Arpeggio, melody, percussion, texture, pad, and wind-chime are spatialized; bass and drone remain center-focused for mono-safe low end.
- Existing weather-driven pan/width params are reused to control 3D position/depth.
- This is **Web Audio app-level spatialization**. It does not force Apple OS-level personalized/head-tracked Spatial Audio behavior.

Transition behavior:

- Continuous parameters ramp smoothly (filters, volume, panning, width, etc.).
- Discrete parameters switch at musical boundaries (key/mode/pattern category).

## Harmony & Progression

Progressions are generated from diatonic 7th-chord vocabularies with mood-aware Markov weighting:

- Weather category maps to mood (`calm`, `gentle`, `melancholy`, `tense`, `suspended`, `sparse`).
- Harmonic rhythm is pressure-driven (storm faster, stable high pressure slower).
- Secondary dominants are injected probabilistically by mood.
- Bass inversion selection minimizes leap size between chords.
- Weather category shifts can trigger immediate progression swaps for dramatic changes (storm/fog/snow).

## Visualization

The full-screen canvas visualizer is weather/audio reactive and currently includes:

- Dynamic sky palette by time-of-day + weather
- Sun and moon positioning from rise/set times
- Moon phase shading and fullness glow
- Stars with FFT-reactive twinkle at night
- Sunrise/sunset aurora bands
- Animated clouds with wind drift
- Weather particles (rain/snow/fog) and rain splash ripples
- Lightning flashes in storms
- Waveform-reactive landscape silhouette
- Tide + bass-reactive water layer
- Fireflies (conditional warm-night behavior)
- Snow accumulation and melt
- Heat shimmer under hot clear/cloudy conditions
- Chord name + progression timeline overlay

## Controls

UI controls include:

- Play/pause
- Master volume slider (persisted)
- Change location search
- Mix panel (per-voice mute toggles)
- "What am I hearing?" contextual panel
- Sleep timer (off/30/60/90 with 60s fade-out)
- Share link (lat/lng permalink copy)

Keyboard shortcuts:

- `Space`: play/pause
- `L`: open location search
- `M`: open/close mix panel
- `?`: open/close "What am I hearing?"
- `Escape`: close action menu
- `F`: request fullscreen

## Data Sources

All APIs used are free and require no API keys:

| Source | Data | Polling Interval |
|--------|------|------------------|
| [Open-Meteo Weather](https://open-meteo.com) | Temperature, apparent temperature, humidity, pressure, wind, weather code, cloud cover, UV, sunrise/sunset | 1 minute |
| [Open-Meteo Air Quality](https://open-meteo.com/en/docs/air-quality-api) | US AQI, PM2.5 | 15 minutes |
| [NOAA CO-OPS](https://tidesandcurrents.noaa.gov/api/) | Tide water level (nearest coastal station) | 10 minutes |
| Client-side calculation | Moon phase/fullness, season factor, pressure trend | Per weather update |
| Browser Geolocation API | Initial coordinates | On startup |

## Tech Stack

- [Tone.js](https://tonejs.github.io/) v15
- [Vite](https://vite.dev/) v7
- Vanilla JavaScript (ES modules)
- Canvas 2D
- Vitest

## Project Structure

```
src/
  main.js
  music/
    engine.js
    engine.spatial.test.js
    mapper.js
    interpolator.js
    progression.js
    progression.test.js
    scale.js
    spatial.js
    spatial.test.js
    voices/
      pad.js
      arpeggio.js
      bass.js
      drone.js
      melody.js
      texture.js
      percussion.js
      windchime.js
  weather/
    fetcher.js
    fetcher.test.js
    airquality.js
    tides.js
    location.js
    codes.js
    moon.js
    season.js
  ui/
    display.js
    controls.js
    visualizer.js
  styles/
    main.css
```

## Getting Started

```bash
git clone https://github.com/WColan/sound-of-right-now.git
cd sound-of-right-now
npm install
npm run dev
```

Open `http://localhost:5173`, click **Listen**, and allow location access (or use search).

## Scripts

```bash
npm run dev
npm run build
npm run preview
npm test
npm run test:watch
```

## Testing

Current automated coverage includes:

- Weather timezone/UV correctness
- Fetcher lifecycle race safety (stale in-flight response suppression)
- Progression player pause/resume lifecycle behavior

Run tests:

```bash
npm test
```

## Browser Requirements

- Modern browser with Web Audio API support (Chrome, Firefox, Safari, Edge)
- User gesture to start audio context (autoplay policy)
- Geolocation permission is optional (location search works without it)

## License

MIT
