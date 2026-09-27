# Production regression gate — v0.1.0

Date: 2026-09-26  
Environment: `https://app.mapsource.io`

## Public boundary checks

| Probe | Result |
|---|---|
| `/` | HTTP/2 200 through Cloudflare TLS |
| `/health/live` | 200, 127 ms |
| `/health/ready` | 200, 69 ms |
| `/map/style.json` | 200, 43 ms |
| `/api/route` | 200, 212 ms, 283 points |
| `/map/satellite/5/5/11.jpg` | 200, 200 ms, 22,729 bytes |

Security headers observed at the public edge include the application CSP, `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, and `Permissions-Policy`.

## Public browser workflow

An unmocked Chromium pass completed on 1440×900 desktop and 412×915 mobile viewports. Each pass:

1. loaded Mapsource vector cartography, labels, terrain, glyphs, and the initial real route;
2. reported the expected 3.14 km route and elevation metrics;
3. selected the Satellite layer and rendered Esri attribution;
4. started route replay and observed progress above zero; and
5. completed with zero page exceptions.

MapLibre cancels obsolete tile requests during camera movement and layer changes by design. Cloudflare's optional injected analytics beacon was refused by the application's intentionally narrow CSP; neither condition affected the application workflow.

**Gate: PASS**

