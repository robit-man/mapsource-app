# Staging regression gate — v0.1.0

Date: 2026-09-26  
Environment: production build served on `127.0.0.1:3220`

## Automated result

`npm run validate` passed in one uninterrupted final run:

- Prettier: pass
- ESLint: pass
- TypeScript: pass
- Vitest: 3/3 pass with configured coverage thresholds
- Vite production build: pass
- Playwright desktop/mobile suite: 3 pass, 1 expected skip
- `npm audit --audit-level=high`: 0 vulnerabilities

The browser suite verifies route planning, search, Satellite selection, replay progress, the mobile planner, tap-to-move mode, and the presence of both MapLibre production worker assets.

## Live dependency result

`npm run deploy:check` against loopback:

| Probe | Result |
|---|---|
| `/health/live` | 200, 35 ms |
| `/health/ready` | 200, 23 ms |
| `/map/style.json` | 200, 8 ms |
| `/api/route` | 200, 216 ms, 283 points |
| `/map/satellite/5/5/11.jpg` | 200, 138 ms, 22,729 bytes |

## Manual result

Live desktop (1440×900) and mobile (412×915) views were inspected with unmocked Mapsource vector tiles, labels, terrain, real routing, markers, and elevation data. Both final views loaded the 3.14 km route without page errors. A missing production MapLibre worker discovered during the first visual pass was fixed by emitting both the worker and its shared module as explicit build assets; the browser gate now asserts both files.

**Gate: PASS**
