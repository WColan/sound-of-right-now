# Sound of Right Now — Claude Instructions

## Release Checklist (Required Before Every Vercel Deploy)

Before any deployment to Vercel — no exceptions, no reminders needed — always do both of these:

1. **Bump the version** in `src/version.js`.
   - Format: `YYYY.MM.DD.N` (CalVer — use today's date, increment `N` if multiple releases on same day).
   - Example: `'2026.03.13.1'`

2. **Update `README.md`** to reflect any new features, controls, voices, or architectural changes introduced in this release.
   - Controls section (keyboard shortcuts, panels, UI)
   - Voices table (if voices were added/removed/renamed)
   - Architecture diagrams (if signal path changed)
   - Any other sections that are now out of date

Do this as part of the commit before deploying, not as an afterthought.

## Versioning

- File: `src/version.js`
- Scheme: CalVer `YYYY.MM.DD.N[.P]`
  - `N` = daily build counter (start at 1, increment for same-day releases)
  - `P` = optional point release for patches within the same build

## Tech Stack

- Vanilla JS (ES modules), Vite v7, Tone.js v15, Canvas 2D, Vitest
- Deployed to Vercel

## Key Paths

- Version: `src/version.js`
- Entry: `src/main.js`
- Music engine: `src/music/engine.js`
- Weather → Music mapping (pure fn): `src/music/mapper.js`
- Parameter interpolation: `src/music/interpolator.js`
- Chord/harmony progression: `src/music/progression.js`
- Long-form expression arcs: `src/music/movement.js`
- Scale/note utilities: `src/music/scale.js`
- UI: `src/ui/`
- Weather fetching: `src/weather/fetcher.js`
- Voices: `src/music/voices/` (pad, arpeggio, bass, drone, melody, texture, percussion, windchime, choir)

## Dev Commands

```
npm run dev          # Dev server at localhost:5173 (HMR enabled)
npm run build        # Production bundle → dist/
npm test             # Run tests once
npm run test:watch   # Continuous test watch
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
