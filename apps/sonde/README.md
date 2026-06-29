# SONDE — sounding the heavens

A generative sonification of the **real-time geometry of the solar system**. Where
[SONAR](../sonar) turns live weather into music, SONDE turns the actual positions
and motions of the planets into sound — "music of the spheres," computed live in
your browser. It is a sibling in the **SON** (Sound of Now) family, sharing the
[`@son/core`](../../packages/core) audio toolkit but with a completely different
musical language.

> A *sonde* is a probe sent out to gather data. SONDE sounds out the sky.

## The idea

The harmony is **fixed by orbital geometry, not chosen**. Each body's sidereal
orbital period becomes a just-intonation interval relative to Earth's year (the
fundamental). The whole solar system is therefore a single, perpetually-sounding
consonant chord — the *tuning of the heavens*. Real orbital resonances land as
real intervals (Neptune:Pluto 3:2 ≈ a fifth; Jupiter's moons 1:2:4 ≈ stacked
octaves).

What you hear **evolve** is motion:

| Celestial input | Sound |
| --- | --- |
| Heliocentric longitude (orbital angle) | Stereo **pan** — an audible orrery |
| Heliocentric distance (AU) | Low-pass **filter** — near the Sun is bright, far is dark |
| Orbital angular velocity | **Shimmer** (tremolo) rate — fast inner planets glint, outer planets are steady drones |
| Retrograde motion | **Pitch bend** flat — the planet "turns back" |
| Major aspects (0°/60°/90°/120°/180°) | **Bell blooms** — consonant alignments ring open, tense ones ring sharp |
| Moon phase (illumination) | **Lunar shimmer** voice — dark at new, radiant at full |
| Jupiter's Galilean moons (1:2:4 Laplace resonance) | A locked **polyrhythm** of plucks |

Because real orbits move imperceptibly slowly, SONDE's primary control is a
**time warp**: crank the speed from *Live* up to *1 year/sec* and the orbits,
retrogrades and alignments become audible over a minute or two. **Now** snaps the
sky back to the present instant.

## Voices

- **Sun** — constant root drone at the Earth-fundamental (the 1/1).
- **8 body voices** — Mercury…Pluto (Earth is *you*, the vantage, and does not sound).
- **Lunar** — moon-phase shimmer.
- **Galilean** — Jupiter's Io/Europa/Ganymede polyrhythm.
- **Aspect** — bell blooms on planetary alignments.

## Controls

| Control | Action |
| --- | --- |
| ❚❚ / ▶ | Play / pause |
| 🔊 slider | Master volume |
| ⏱ slider | Time warp: Live · 1 hr/s · 1 day/s · 1 week/s · 1 month/s · 1 year/s |
| Now | Snap the sky back to the live present |
| Hover / tap a body | Inspect any planet, the Sun, Earth, or the Moon — its name and how it's shaping the sound right now (pitch, pan, brightness, shimmer, retrograde). Tap again or tap empty space to dismiss. |

## Architecture

```
SkyClock → ephemeris.getSkySnapshot → mapSkyToMusic (pure)
         → @son/core interpolator → SondeEngine → audio
                                                 ↘ orrery / display (visuals)
```

- **`src/sky/ephemeris.js`** — pure wrapper over [`astronomy-engine`](https://github.com/cosinekitty/astronomy) (MIT): per-body longitude, distance, angular velocity, retrograde, aspects, Galilean phases. No network, no keys, offline, deterministic.
- **`src/sky/clock.js`** — simulation time + the time-warp speed model.
- **`src/music/mapper.js`** — pure `snapshot → musical params` (fully unit-tested, no Tone.js).
- **`src/music/engine.js`** + **`src/music/voices/`** — the Tone.js audio graph.
- **`src/ui/orrery.js`** — the sound-reactive Canvas 2D orrery.

## Dev

```
npm run dev -w @son/sonde      # dev server (HMR)
npm run build -w @son/sonde    # production bundle → apps/sonde/dist
npm test                       # run the whole monorepo's tests (from the root)
```

## Data source

Positions are computed **locally** with `astronomy-engine` (VSOP87-based, ±1
arcminute) — no API keys, no CORS, no rate limits, works offline.
