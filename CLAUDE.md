# Sound of Now (SON family) — Claude Instructions

This is an **npm-workspaces monorepo**. Shared sonification primitives live in
`packages/core` (`@son/core`); each app lives under `apps/`:

- `apps/sonar` (`@son/sonar`) — *Sound of Right Now*, the weather app (paths below).
- `apps/sonde` (`@son/sonde`) — the celestial "music of the spheres" app.

`@son/core` is consumed by SONDE today; SONAR still uses its own local copies of
the shared modules and will be migrated onto `@son/core` in a later PR.

## Release Checklist (Required Before Every Vercel Deploy)

Before any deployment to Vercel — no exceptions, no reminders needed — always do both of these:

1. **Bump the version** in the deployed app's `version.js`
   (`apps/sonar/src/version.js` or `apps/sonde/src/version.js`).
   - Format: `YYYY.MM.DD.N` (CalVer — use today's date, increment `N` if multiple releases on same day).
   - Example: `'2026.03.13.1'`

2. **Update the relevant `README.md`** (the app's and/or the root) to reflect any
   new features, controls, voices, or architectural changes introduced in this release.
   - Controls section (keyboard shortcuts, panels, UI)
   - Voices table (if voices were added/removed/renamed)
   - Architecture diagrams (if signal path changed)
   - Any other sections that are now out of date

Do this as part of the commit before deploying, not as an afterthought.

## Versioning

- Files: `apps/<app>/src/version.js` (one per app)
- Scheme: CalVer `YYYY.MM.DD.N[.P]`
  - `N` = daily build counter (start at 1, increment for same-day releases)
  - `P` = optional point release for patches within the same build

## Tech Stack

- Vanilla JS (ES modules), Vite v7, Tone.js v15, Canvas 2D, Vitest, npm workspaces
- Each app deploys to Vercel as its own project (root = `apps/sonar` / `apps/sonde`)

## Key Paths

### Shared — `@son/core` (`packages/core/src/`)
- Scale + just-intonation utilities: `scale.js`
- Spatial (HRTF panner): `spatial.js`
- Long-form expression arcs: `movement.js`
- Generic param interpolator: `interpolator.js`
- DataSource / Mapper contract (Phase-2 seam): `datasource.js`

### SONAR — `apps/sonar/src/`
- Version: `version.js`
- Entry: `main.js`
- Music engine: `music/engine.js`
- Weather → Music mapping (pure fn): `music/mapper.js`
- Parameter interpolation: `music/interpolator.js`
- Chord/harmony progression: `music/progression.js`
- Voices: `music/voices/` (pad, arpeggio, bass, drone, melody, texture, percussion, windchime, choir)
- Weather fetching: `weather/fetcher.js`
- UI: `ui/`

### SONDE — `apps/sonde/src/`
- Version: `version.js`
- Entry: `main.js`
- Sky data (ephemeris + clock): `sky/ephemeris.js`, `sky/clock.js`
- Sky → Music mapping (pure fn): `music/mapper.js`
- Audio engine + bus: `music/engine.js`, `music/audio-bus.js`
- Voices: `music/voices/` (sun, body, lunar, galilean, aspect)
- UI: `ui/` (orrery, controls, display)

## Dev Commands

```
npm install                  # Install all workspaces (run from repo root)
npm test                     # Run ALL workspace tests once (from root)
npm run test:watch           # Continuous test watch

npm run dev:sonar            # SONAR dev server (or: npm run dev -w @son/sonar)
npm run dev:sonde            # SONDE dev server (or: npm run dev -w @son/sonde)
npm run build:sonar          # Build SONAR → apps/sonar/dist
npm run build:sonde          # Build SONDE → apps/sonde/dist
```

## Architecture: Data Flow

```
[Weather APIs] → fetcher.js → mapper.js → interpolator.js → engine.js → Audio
                                                                ↓
                                                     visualizer.js / display.js
```

- `mapper.js` is a **pure function** — no side effects, easy to unit test without Tone.js
- `interpolator.js` distinguishes **continuous params** (ramp smoothly) vs **discrete params** (snap at musical boundaries like key changes)
- `engine.js` owns the full Tone.js audio graph; all 9 voices connect here

## Adding a New Voice

1. Create `src/music/voices/yourvoice.js` — export `createYourVoice()` returning the voice interface (see below)
2. Instantiate in `engine.js` and wire into the audio graph (gain → effects → master bus)
3. Add volume/param handling in `engine.js` `updateParams()`
4. Add relevant output params to `mapper.js` (the weather → music mapping)
5. Add those params to `interpolator.js` `CONTINUOUS_PARAMS` or `DISCRETE_PARAMS`
6. Update README.md voices table

### Voice Interface Contract

Every voice must implement:
```js
{
  output: Tone.Gain,           // Connect this to the audio graph
  play(note, duration, vel),   // Play a single note
  playChord(notes, duration),  // Play multiple notes
  stop(),                      // Stop all sound immediately
  pause(),                     // Pause (preserve state)
  resume(),                    // Resume from paused state
  dispose(),                   // Tear down all Tone.js nodes
}
```
Some voices also expose `rainOutput` (texture voice) for parallel routing.

## Testing Conventions

- Tests are **colocated** with source files as `*.test.js`
- Framework: Vitest (`describe`, `it`, `beforeEach`, `expect`)
- Tone.js synthesizers and `Tone.Loop` must be mocked — see existing tests for patterns
- Pure functions (mapper, scale, movement) need no Tone.js mocking
- DOM tests use `src/test/fake-dom.js` helpers

## Parameter Types (Interpolator)

When adding mapper output params, classify them in `interpolator.js`:
- **Continuous** — volumes, filter cutoffs, reverb decay, LFO rates → ramp smoothly (3–30s)
- **Discrete** — root note, scale mode, arpeggio pattern, category — snap only at musical phrase boundaries
- **Metadata** — display strings (location, weather description) — ignored by interpolator

## External APIs (All Free, No Keys Required)

- **Weather + Air Quality:** Open-Meteo (`open-meteo.com`)
- **Geocoding / Reverse Geocoding:** Open-Meteo Geocoding API
- **Tides:** NOAA Tidal Predictions (`api.tidesandcurrents.noaa.gov`)
- **Moon phase / Season / Biome:** Local calculations or Open-Meteo land-cover
