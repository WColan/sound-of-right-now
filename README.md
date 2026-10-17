# Sound of Right Now

**A living orchestra for this place, this moment.**

Open the app, share your location (or search any city), and listen to *now*: the air, the light, the sea, the sky overhead, the creatures and people around you, and the planet underneath, each played by the instrument that most obviously belongs to it.

The one rule: **every data source has an instrument, and there's an intuitive reason for the pairing.** Wind is breath, so the winds play it. Brass is gold, so the horns belong to the sun. Droplets are plucks, so rain plays the harp. Crickets chirp at the real temperature (Dolbear's law). The cellos swell on the actual period of the waves offshore. An earthquake reaches you as timpani, after a delay set by how far the seismic waves had to travel.

## How it works

```
 ┌──────────── free, keyless APIs + local astronomy ────────────┐
 │ weather · marine · river · tide · air/pollen · space weather │
 │ earthquakes · ISS · iNaturalist · population · holidays      │
 │ sun/moon/planets/stars (astronomy-engine) · calendar          │
 └──────────────────────────────┬───────────────────────────────┘
                                ▼
                 src/now/feed.js  →  NowSnapshot (pure)
                                ▼
          src/music/score.js   (pure: snapshot → sections + legend)
                                ▼
          src/music/stage.js   (pure: attention budget)
                                ▼
     src/music/orchestra/  ── 18 sections → zone buses → hall → master
                                ▼                         ▲
     src/visual/  (WebGL2 true-sky renderer)     movement conductor
```

- **Feed** polls each source on its natural cadence (weather 1 min, ISS 5–60 s, quakes 3 min, space weather 5 min, sea 15 min, life once a day) and emits a single `NowSnapshot`. Any source can fail or not apply (inland → no sea); it just goes quiet.
- **Score** is a pure function. Each section answers "what in this moment does this instrument stand for?" and writes a plain-English `why` that appears in the legend panel.
- **Stage** is the attention budget that keeps twenty sources from turning into noise. At most **3 sections are featured** at a time, at most one per registral zone. Featured sections hold for 90 s minimum so the spotlight doesn't flicker. Rare events (a quake, the hour bell) take a spotlight and duck everything else.
- **Orchestra** owns the Tone.js graph. Each section feeds one of five EQ-carved zones (sub / low / mid / upper / high) so sections never mask each other. The zones run into a hall shaped by humidity, visibility and landscape.

## The orchestra

| Section | Instruments | Listens to | Why it fits |
|---|---|---|---|
| **Strings** | violins, violas, celli (sampled) | temperature, sunlight | The harmonic bed is the air itself. Warm air gets sharper keys and brighter modes, and violins rise with the sun. |
| **Basses** | contrabass + sub sine | pressure & 3-h tendency | The weight of the air is the weight of the low end. A falling barometer makes the basses uneasy. |
| **Ocean** | celli & basses swells + surf wash | wave height/period/direction, SST, tide | Swells breathe on the real wave period and arrive from the real direction. A rising tide lifts the line. |
| **River** | low pizzicato & harp running figure | GloFAS discharge vs. median | Running water runs, and the figure quickens when the river is in flood. |
| **Winds** | flute, clarinet, rushing air, wind chimes | wind speed, gusts, direction | Wind is breath. The woodwinds swell on gusts from the side the wind blows, and a featured flute plays the gust motif. |
| **Horns** | French horns (sampled) | sun altitude, cloud | Brass is gold. A horn call greets sunrise, a chorale plays at dusk, and warm distant tones sit under daylight. |
| **Rain** | harp, piano, glockenspiel + rain hiss | precipitation rate, snowfall | Droplets are plucks, so heavier rain means denser notes. Snow falls as slow pentatonic glockenspiel flakes. |
| **Storm** | timpani rolls, trombones, gong, thunder | storm codes, CAPE | Storm energy is drum energy. Lightning appears first, and the thunder follows about 3 s per km later. |
| **Air** | grain crackle, pizzicato motes, master haze | AQI, PM2.5, pollen | Particles blur the light and the sound. |
| **Moon** | celesta (+ glockenspiel) | moon altitude, illumination, waxing/waning | Moonlight is cold silver. The motif climbs while the moon waxes and descends while it wanes. |
| **Planets** | pure sine "spheres" | which planets are above the horizon | Kepler: each planet sings at its orbital frequency relative to Earth's, so inner planets are high and outer planets low. |
| **Aurora** | high violin tremolo + shimmer | NOAA Kp, solar wind, geomagnetic latitude | When the magnetic field trembles the sky shimmers, and the strings shimmer with it. |
| **Meteors** | crotale/glock sparks, bell tree | active shower ZHR, darkness, cloud | Each shooting star is one spark of metal, and it streaks across the visualizer at the same instant. |
| **ISS** | a gliding FM tone | ISS position, range, radial velocity | Something is passing overhead at 7.7 km/s. Its pitch bends with its true Doppler shift and pans with its azimuth. |
| **Life** | synthesized birds, crickets, frogs | sun, season, temperature, humidity, iNaturalist species | Dawn chorus with a local bird "cast" seeded from species seen nearby. Crickets chirp at the Dolbear rate. |
| **People** | muted pizzicato & marimba pulse | population, local hour, weekday/holiday | A town has a heartbeat: busiest at rush hour, nearly still at 4 am. |
| **Bells** | FM tubular bells + piano | local clock, population, public holidays | Towns ring the hour. Westminster quarters play in the current key, and a full peal rings on public holidays. |
| **Earth** | timpani, gong, sub thump | USGS quakes, regional restlessness | The ground speaks in drums. Bigger quakes sound lower, and the sound arrives after the waves' travel time. |

Samples come from **VSCO 2: Community Edition** (CC0), stored as about 13 MB of mono MP3 and loaded in tiers (strings first) after the first sound. Until they arrive, every section plays a synth fallback, so audio starts instantly and the orchestra fills in.

### Harmony

- **Key:** temperature picks a position on the circle of fifths. Each 6 °C is one step, so key changes are always to closely related keys.
- **Mode:** the feels-like temperature sets the mode, from locrian (bitter cold) to lydian (hot). A storm turns a minor mode harmonic or melodic minor.
- **Tempo:** the thermometer sets the pulse, because warm molecules move faster.
- **Chords:** Markov-chain progressions with secondary dominants and minimal-leap inversions. Pressure sets the harmonic rhythm, and the conductor's tension raises adventurousness.

### Movement conductor

Long-form arcs (breathing → stirring → building → climax → descent → stillness) shape dynamics, density, tension and effects across 8–20 minute movements. As each movement settles into stillness, the orchestra **recapitulates the motifs** of the sections featured during that movement.

## Rewards for listening longer

- **Dark adaptation.** At night the visualizer shows more faint stars the longer you stay, with limiting magnitude rising from 3.6 to 5.2 over about 12 minutes, the way your own eyes adjust.
- **Constellations** draw themselves in after 10 minutes.
- **The music of the spheres** opens into a full chord after 20 minutes.
- **Motif recaps** at the end of each movement.
- **A local bird cast.** Each place has consistent bird songs, so you can learn your neighbourhood's voices.
- **Captions for rare moments**, such as "The International Space Station is passing overhead — look up."

## Visualization (WebGL2)

The picture is the true sky over you, not a weather icon. The camera drifts toward whatever matters most right now: the rising sun, the moon, the aurora to the pole, or the ISS.

- Physically motivated sky gradient from the sun's altitude, a warm horizon band at golden hour, and dust haze from AQI
- About 2,000 real stars (Hipparcos, via d3-celestial) rotating with local sidereal time. Stars twinkle and planets don't.
- The Milky Way in its true galactic position, with dust lanes, fading under moonlight and city glow
- A phase-correct moon lit from the sun's real direction
- Aurora curtains toward the magnetic pole, colour shifting toward crimson at high Kp
- Clouds lit by the sun (pink at sunset, silver linings, moonlit at night) and drifting with the wind
- Biome terrain silhouettes. City skylines show lit windows that follow human activity.
- Sea surface with waves whose wavelength follows the real period (deep-water dispersion λ = gT²/2π), plus moon and sun glitter paths
- Rain streaks, snowflakes and fog, lightning that lights the clouds, and a ground tremor when a quake arrives
- Fireflies on warm summer nights, plus meteors and the ISS in sync with their sounds
- Mip-chain bloom, and a colour grade driven by the music: bright modes are warm, tension adds contrast, stillness fades

The renderer uses dynamic resolution on slower GPUs. Browsers without WebGL2 fall back to the v1 Canvas visualizer.

## Controls

- Play/pause, master volume (persisted), sleep timer (off/30/60/90 with a 60 s fade), share link
- **now** panel (`W`): every source we're listening to, with live readings
- **legend** panel (`A`): what you're hearing and why, with featured sections marked ★
- **mix** panel (`M`): mute any of the 18 sections
- **conductor** panel (`C`): movement timeline, phase labels, listening duration, personality overrides
- **guitar** panel (`G` or click the chord): fretboard for the current chord or scale, with a next-chord preview
- `Space` play/pause · `L` change location · `F` fullscreen · `Esc` close panels

## Data sources

All free, no API keys:

| Source | Data | Cadence |
|---|---|---|
| [Open-Meteo Forecast](https://open-meteo.com) | temperature, feels-like, humidity, dew point, pressure + tendency, wind + gusts, cloud, precipitation, snowfall, visibility, CAPE, snow depth, UV, sunrise/sunset | 1 min |
| [Open-Meteo Marine](https://open-meteo.com/en/docs/marine-weather-api) | wave height/period/direction, swell, sea-surface temperature | 15 min |
| [Open-Meteo Flood (GloFAS)](https://open-meteo.com/en/docs/flood-api) | river discharge vs. median | 3 h |
| [Open-Meteo Air Quality](https://open-meteo.com/en/docs/air-quality-api) | US AQI, PM2.5, pollen (Europe) | 15 min |
| [NOAA CO-OPS](https://tidesandcurrents.noaa.gov/api/) | water level + rising/falling | 10 min |
| [NOAA SWPC](https://services.swpc.noaa.gov) | planetary Kp, solar wind | 5 min |
| [USGS Earthquakes](https://earthquake.usgs.gov/earthquakes/feed/) | M2.5+ quakes, past day | 3 min |
| [wheretheiss.at](https://wheretheiss.at) | ISS position | 5–60 s (adaptive) |
| [iNaturalist](https://api.inaturalist.org) | bird / insect / amphibian species seen nearby (30 days) | daily |
| [Open-Meteo Geocoding](https://open-meteo.com/en/docs/geocoding-api) | population of the nearest place | once |
| [Nager.Date](https://date.nager.at) | public holidays | once |
| [BigDataCloud](https://www.bigdatacloud.com) | reverse geocode, country code | once |
| [OpenStreetMap Overpass](https://overpass-api.de) | land cover → biome | once |
| [astronomy-engine](https://github.com/cosinekitty/astronomy) (local) | sun, moon, planets, sidereal time | continuous |
| Local calendar | season, solstice proximity, meteor showers, human activity curve | continuous |

## Project structure

```
src/
  main.js                       app wiring: feed → score → stage → orchestra + visuals
  now/                          data layer (pure normalizers + polling feed)
    feed.js  snapshot.js  sky.js  calendar.js  util.js  http.js
    sources/  weather marine river tide air space quakes iss life place
  music/
    score.js  stage.js          pure mapping + attention budget
    progression.js  movement.js  scale.js  spatial.js  constants.js
    orchestra/
      engine.js  samples.js  toolkit.js
      sections/  strings sea winds horns weather sky life town
    voices/  texture.js  windchime.js   (reused v1 voices)
  visual/
    renderer.js  shaders.js  mood.js  data/sky.json
  ui/                           panels, controls, chord display, captions, guitar
  weather/                      codes, season, biome, location, share
public/samples/                 VSCO-2 CE subset (CC0) + manifest.json
scripts/
  build-samples.mjs             rebuild the sample set from VSCO-2 CE
  build-sky-data.mjs            rebuild the star catalogue
  scaffold-section.js           new orchestra section template
```

## Getting started

```bash
git clone https://github.com/WColan/sound-of-right-now.git
cd sound-of-right-now
npm install
npm run dev
```

Open `http://localhost:5173`, click **Listen**, and allow location access (or use search). Headphones recommended.

```bash
npm run build     # production bundle → dist/
npm test          # vitest
```

## Testing

- Every source normalizer, the calendar (meteor showers, solstices, activity curve) and the true-sky astronomy are tested against fixtures and analytic checks.
- Score mappings have one test per intuition (Dolbear, Kepler, wave period, dawn chorus, fog distance, and so on), and every active section must explain itself in the legend.
- The stage's attention budget is tested for its cap, zone exclusivity, hold time and spotlight ducking.
- The whole orchestra graph runs against a fake Tone.js: voice contract, mutes, sample hand-off, Poisson rain density, lightning-then-thunder, quake arrival delay, bells on the boundary, and conductor stillness.
- Visual math is tested: the star projection matches the analytic equatorial→horizontal conversion, along with the camera basis and mood/grade mappings.

## Browser requirements

- A modern browser with Web Audio. WebGL2 is recommended (otherwise the Canvas fallback is used).
- A user gesture to start audio (autoplay policy). Geolocation is optional.

## Credits

- Orchestral samples: [VSCO 2: Community Edition](https://github.com/sgossner/VSCO-2-CE) by Versilian Studios (CC0)
- Star catalogue and constellation lines: [d3-celestial](https://github.com/ofrohn/d3-celestial) © Olaf Frohn (BSD-3-Clause), from Hipparcos
- Astronomy: [astronomy-engine](https://github.com/cosinekitty/astronomy) (MIT)

## License

MIT
