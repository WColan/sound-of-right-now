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
- UI: `src/ui/`
- Weather: `src/weather/`
