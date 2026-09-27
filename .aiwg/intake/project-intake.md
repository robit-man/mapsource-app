# Project intake — Mapsource Trail

## Metadata

- Project: Mapsource Trail (`mapsource-app`)
- Owner: Roko / Mapsource
- Date: 2026-09-26
- Stakeholders: Mapsource maintainers, prospective developers, outdoor-route users

## Problem and outcome

Mapsource needs a public, complete integration that proves its npm package can support a polished consumer mapping workflow rather than isolated API snippets. The outcome is a fast one-page hiking and route application at `app.mapsource.io` with live Mapsource search, route, elevation, map, and terrain data.

Success means:

- A first route and map render without user configuration.
- Search, multi-stop editing, drag/tap repositioning, satellite, and replay work on desktop and phone.
- No Mapsource credential reaches the browser.
- Production readiness and live health checks pass.

## Scope

In scope: responsive SPA, loopback server, typed Mapsource npm integration, bounded map resource relays, hike/run/bike routes, elevation, replay, exact Earth-derived satellite option, tests, systemd unit, Cloudflare hostname, public deployment.

Out of scope: durable user activity accounts, social feeds, GPS activity recording, offline satellite storage, payment, or copying proprietary product assets.

## Non-functional requirements

- Security: strong credential isolation, allowlisted relays, CSP, zero high/critical dependency advisories.
- Reliability: supervised service, restart on failure, live/ready probes, rollback procedure.
- Performance: interactive shell remains responsive while routing; bounded upstream timeouts and 8 MiB response cap.
- Privacy: no account or location history persistence; browser geolocation is opt-in and remains in the browser.
- Portability: ordinary Node/Vite build; no managed-cloud runtime dependency.

## Testing strategy

- Profile: Production
- Unit: required; route math and formatting; automated and CI-gated.
- Integration: required; real loopback Mapsource route plus map/style/tile probes.
- E2E: required; desktop and mobile Chromium, mocked deterministic API boundaries.
- Security: `npm audit --audit-level=high`, CSP/credential boundary review.
- Accessibility: named controls, keyboard focus, semantic expanded/pressed states, touch targets.
- Target: at least 80% statement coverage of isolated domain utilities and 100% coverage of release-critical public flows through unit/integration/E2E evidence.

## Data and integrations

- Public OSM/OpenMapTiles/Mapzen-derived data through Mapsource.
- Esri World Imagery interactive tile display with explicit attribution and documented license risk.
- No persisted PII.

## Priorities

- Delivery speed: 0.30
- Cost efficiency: 0.15
- Quality/security: 0.30
- Reliability/scale: 0.25

Non-negotiable: key isolation, attribution, responsive touch interaction, tested release, loopback-only origin.
