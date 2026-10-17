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

- Vanilla JS (ES modules), Vite v7, Tone.js v15, WebGL2 (Canvas 2D fallback), astronomy-engine, Vitest
- Deployed to Vercel

## Key Paths

- Version: `src/version.js`
- Entry / wiring: `src/main.js`
- Data layer: `src/now/` (`feed.js` polling, `snapshot.js` pure merge, `sky.js` astronomy, `calendar.js`, `sources/*`)
- Snapshot → music mapping (pure fn): `src/music/score.js`
- Attention budget (pure fn): `src/music/stage.js`
- Orchestra graph: `src/music/orchestra/engine.js`; sections in `src/music/orchestra/sections/`; shared helpers in `toolkit.js`; sample loading in `samples.js`
- Chord/harmony progression: `src/music/progression.js`
- Long-form expression arcs: `src/music/movement.js`
- Visuals: `src/visual/` (`renderer.js` WebGL2, `shaders.js`, `mood.js` pure)
- UI: `src/ui/`
- Samples: `public/samples/` (rebuild with `node scripts/build-samples.mjs`)

## Dev Commands

```
npm run dev          # Dev server at localhost:5173 (HMR enabled)
npm run build        # Production bundle → dist/
npm test             # Run tests once
npm run test:watch   # Continuous test watch
```

## Architecture: Data Flow

```
[Free APIs + local astronomy] → now/feed.js → NowSnapshot → score.js → stage.js → orchestra/engine.js → Audio
                                                                   ↘ visual/mood.js → visual/renderer.js
```

- `score.js`, `stage.js`, `mood.js`, `snapshot.js` and every `sources/*` normalizer are **pure** — test without Tone.js or network
- Sections ramp their own continuous params; key/mode/category changes go through the progression player (queued to cycle ends unless dramatic)
- Sections sit in registral zones (`ZONES` in score.js) — at most one featured section per zone, max 3 featured

## The One Rule

Every data source maps to a sound with an **intuitive, explainable reason** ("wind is breath → woodwinds"). Every mapping must add a `why()` legend line in `score.js` that a listener would nod at. If you can't write the why, don't add the mapping.

## Adding a New Section

1. `node scripts/scaffold-section.js yoursection` → `src/music/orchestra/sections/yoursection.js`
2. Add the source (if new) under `src/now/sources/` with a pure `normalize*` + fixture tests; wire it into `feed.js` / `snapshot.js`
3. Map it in `score.js` (level, salience, params, legend `why`) and add the id to a zone in `ZONES`
4. Register the factory in `FACTORIES` in `orchestra/engine.js`; add a label in `src/ui/now-panels.js`
5. Tests in `score.test.js` and `orchestra.test.js`; update README sections table

### Section Contract

Every section must implement:
```js
{
  id, output: Tone.Gain, base,          // base = createSectionBase(): level/role/mute
  update(params, { role, gainDb }, ramp),
  onChord(chord, { first }),
  play(note, duration, vel), playChord(notes, duration),
  start(), stop(), pause(), resume(), dispose(),
  motif?(time), setHarmony?({ root, mode }), setMuted?(bool)
}
```
Use `createVoice()` (sample + synth fallback) — never share a Tone.Sampler between voices.

## Testing Conventions

- Tests are **colocated** with source files as `*.test.js`
- Framework: Vitest (`describe`, `it`, `beforeEach`, `expect`)
- Orchestra tests mock Tone with `src/test/fake-tone.js` (`vi.mock('tone', async () => (await import('../../test/fake-tone.js')).createFakeToneModule())`); `Tone.__advance(seconds)` runs Transport-scheduled events
- Snapshot fixtures: `src/test/now-fixtures.js` (`makeSnapshot({...})`)
- DOM tests use `src/test/fake-dom.js` helpers

## External APIs (All Free, No Keys Required)

- Open-Meteo: forecast, marine, flood (GloFAS), air quality, geocoding
- NOAA: CO-OPS tides, SWPC space weather
- USGS earthquake feed · wheretheiss.at · iNaturalist · Nager.Date holidays · BigDataCloud reverse geocode · Overpass (biome)
- Local: astronomy-engine (sun/moon/planets), calendar (meteor showers, activity curve)
