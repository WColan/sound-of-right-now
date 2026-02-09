# Sound of Right Now

A generative ambient music web app that sonifies live weather and environmental conditions. Every location sounds different, every hour sounds different, and the music evolves continuously without repeating.

Open the app, share your location (or search for a city), and listen to the weather.

## How It Works

Real-time environmental data is fetched from free public APIs and mapped to musical parameters through a pure-function pipeline:

```
[Weather APIs] → [Mapper] → [Interpolator] → [Sound Engine] → [Audio Output]
                                                    ↓
                                              [Visualizer]
```

**Weather conditions** control the texture — rain brings pink noise and dripping percussion patterns, storms bring brown noise and driving rhythms, fog brings ethereal suspended chords, clear skies bring minimal, open soundscapes.

**Temperature** selects the musical mode (cold = dark Locrian/Aeolian, warm = bright Ionian/Lydian) and root note, creating a distinct harmonic identity for each climate.

**Time of day** shapes brightness — filters open at noon, close at night. Volume follows a natural day/night curve. Golden hour (near sunrise/sunset) applies a warm filter reduction.

**Wind** drives rhythmic density, arpeggio direction, and stereo panning of percussion.

**Atmospheric pressure** controls bass depth and harmonic rhythm — low pressure systems produce faster chord changes and deeper bass, while high pressure brings slow-moving, stable harmony.

**Humidity** controls reverb — dry air is intimate, humid air is spacious and washed.

**Moon phase** modulates LFO depth, rate, and chorus — full moon = more movement.

**Tides** (coastal locations only, via NOAA) swell the bass volume with water level.

**UV index** brightens the arpeggio's filter cutoff — high UV = shimmering high frequencies.

**Air quality (AQI)** creates a haze effect — polluted air muffles the master filter and increases reverb, like hearing music through thick air.

**Season** subtly shifts overall brightness — summer is brighter, winter is darker, with hemisphere awareness.

## Voices

The sound engine has 7 independent voices, each with a distinct role:

| Voice | Oscillator | Role |
|-------|-----------|------|
| **Pad** | Dual fatsine PolySynth (A/B crossfade) | Sustained chords with seamless 3-second crossfade transitions between chord changes. 3 detuned sines per note for warm chorusing. |
| **Arpeggio** | Fatsine (2 voices, 12 cent spread) | Rhythmic melodic patterns cycling through chord tones. 8-step Sequence with 4 weather-driven rhythm templates (ethereal, flowing, rippling, cascading). |
| **Bass** | MonoSynth (sawtooth) | Deep foundation with portamento glide between chord roots. LFO-modulated filter via additive gain node. |
| **Drone** | Dual sine (root + fifth) | Barely-audible sub-bass at octave 1. Felt more than heard. Always present, volume varies with pressure. |
| **Melody** | Triangle Synth | Occasional 3-5 note phrases triggered probabilistically (25-60%) on chord changes. Weighted note selection favoring stepwise motion. |
| **Texture** | NoiseSynth + AutoFilter | Ambient noise layer (pink/white/brown depending on weather) with rain drop overlay. |
| **Percussion** | MembraneSynth + MetalSynth | Subtle rhythmic punctuation in 16-step patterns. 5 weather-driven categories: minimal, pulse, dripping, driving, ghost. |

## Audio Signal Chain

```
[Voices] → [Per-voice Panners] → [Chorus] → [FeedbackDelay] → [Reverb] → [Master Filter] → [Master Velocity] → [Limiter] → [Analyser] → [Destination]
```

- **Binaural panning** spreads voices across the stereo field (arpeggio left, melody right, bass/pad/drone center)
- **Master velocity** applies time-of-day volume scaling (night = 0.4x, noon = 1.0x)
- **Smooth interpolation** — continuous parameters (volume, filters, panning) ramp over 3-45 seconds; discrete parameters (key, mode, patterns) snap at musically appropriate moments

## Chord Progressions

Chords are generated from diatonic 7th chord templates driven by weather:

- **Clear** → calm progressions (I-IV-I-V)
- **Cloudy** → gentle movement (I-VI-II-V)
- **Rain/Drizzle** → melancholy (I-IV-VII-III)
- **Storm** → tense 8-chord cycles (I-II-V-I-VII-III-VI-IV)
- **Fog** → suspended, minimal (I-IV-I)
- **Snow** → sparse (I-V-IV-I)

Voice leading minimizes semitone movement between voicings. Harmonic rhythm (time per chord) is pressure-driven: 2 measures in storms, up to 8 measures in high-pressure calm.

## Visualization

A full-screen canvas renders a generative landscape synchronized with the weather and audio:

- **Sky gradient** shifts with time of day (dawn gold, night deep blue, storm desaturation)
- **Stars** visible at night with independent twinkle rates
- **Moon** with correct phase rendering (crescent shadow) and fullness-based glow
- **Aurora/shimmer bands** appear near sunrise/sunset
- **Weather particles** — rain streaks, snowflakes with wobble, fog layers
- **Procedural landscape** silhouette from layered sine waves
- **Water wave line** at the base, amplitude modulated by bass FFT energy and tide level
- **Atmospheric particles** drift with wind and pulse with mid-frequency audio

## Data Sources

All APIs are free and require no API keys:

| Source | Data | Polling Interval |
|--------|------|-----------------|
| [Open-Meteo Weather](https://open-meteo.com) | Temperature, humidity, pressure, wind, weather code, sunrise/sunset, UV index | 5 minutes |
| [Open-Meteo Air Quality](https://open-meteo.com/en/docs/air-quality-api) | US AQI, PM2.5 | 15 minutes |
| [NOAA CO-OPS](https://tidesandcurrents.noaa.gov/api/) | Tide water level (coastal US only) | 6 minutes |
| Client-side calculation | Moon phase, seasonal factor | Per weather update |
| Browser Geolocation API | Latitude/longitude | Once at start |

## Tech Stack

- **[Tone.js](https://tonejs.github.io/) v15** — Web Audio synthesis, scheduling, effects
- **[Vite](https://vite.dev/) v7** — Dev server with HMR, production bundler
- **Vanilla JS** — No framework. ES modules, no build-time transpilation.
- **Canvas 2D** — All visualization rendered directly, no libraries

## Project Structure

```
src/
  main.js                    # Boot sequence, data fetcher wiring, HMR cleanup
  music/
    engine.js                # Top-level: voices, effects chain, progression player, panners
    mapper.js                # Pure function: WeatherState → MusicalParams
    interpolator.js          # Smooth transitions: ramps continuous, snaps discrete
    progression.js           # Chord progression templates, harmonic rhythm, Transport-synced player
    scale.js                 # Modes, MIDI conversion, diatonic chords, voice leading
    voices/
      pad.js                 # Dual fatsine A/B crossfade PolySynth
      arpeggio.js            # 8-step Sequence with rhythm templates
      bass.js                # MonoSynth with LFO-modulated filter
      drone.js               # Root + fifth sine sub-bass
      melody.js              # Probabilistic phrase generator
      texture.js             # NoiseSynth + AutoFilter + rain drops
      percussion.js          # 16-step patterns with MembraneSynth + MetalSynth
  weather/
    fetcher.js               # Open-Meteo weather + UV polling
    airquality.js            # Open-Meteo AQI polling
    tides.js                 # NOAA tide station finder + water level polling
    location.js              # Browser geolocation, city search, reverse geocode
    codes.js                 # WMO weather code → category mapping
    moon.js                  # Moon phase + fullness calculation
    season.js                # Hemisphere-aware seasonal factor
  ui/
    display.js               # Location + weather info overlay
    controls.js              # City search UI
    visualizer.js            # Canvas-based generative landscape
  styles/
    main.css                 # Minimal styles for overlay, controls, canvas
```

## Getting Started

```bash
git clone https://github.com/WColan/sound-of-right-now.git
cd sound-of-right-now
npm install
npm run dev
```

Open http://localhost:5173, click **Listen**, and allow location access (or use the city search).

### Build for Production

```bash
npm run build
npm run preview
```

The built output is in `dist/` and can be deployed to any static hosting (Netlify, Vercel, GitHub Pages, etc.).

## Browser Requirements

- A modern browser with Web Audio API support (Chrome, Firefox, Safari, Edge)
- Geolocation permission for automatic location (optional — you can search for any city)
- Audio context requires a user click to start (browser autoplay policy)

## Planned Features

These visualization enhancements are designed but not yet implemented:

- [ ] Chord name display — current chord as subtle overlay with fade transitions
- [ ] Progression timeline bar — visual indicator of position in chord cycle
- [ ] Waveform-reactive landscape — terrain breathes with waveform analyser data
- [ ] Animated cloud layer — ellipse clouds drifting with wind speed/direction
- [ ] Dynamic color palette — CSS custom properties driven by weather state for UI cohesion

## License

MIT
