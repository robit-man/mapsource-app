# Deployment readiness — v0.1.0

Date: 2026-09-26  
Target: `app.mapsource.io` → `127.0.0.1:3220`

## Decision

**Ready for controlled deployment.** The release candidate satisfies the repository release gate and the loopback staging checks. Production DNS/tunnel verification remains the final external gate.

## Scope

- One-page Mapsource Trail React/MapLibre application.
- Server-side `mapsource` npm integration for search and route planning.
- Allowlisted proxies for Mapsource vector tiles, terrain, glyphs, and Esri World Imagery.
- Hike/run/bike modes, draggable and tap-movable stops, route ordering, elevation, maneuvers, and route replay.
- Loopback systemd service plus Cloudflare Tunnel ingress.

## Evidence

| Gate | Result |
|---|---|
| Formatting | Pass |
| ESLint | Pass |
| TypeScript project build | Pass |
| Unit tests | 3 passed; statements 89.06%, functions 100%, lines 100% |
| Production build | Pass; explicit MapLibre worker and shared assets emitted |
| Browser regression | 3 passed, 1 intentionally skipped desktop-only duplicate |
| Dependency audit | 0 vulnerabilities at `high` threshold |
| Live loopback route | 200; 283 geometry points; 3.142 km |
| Live satellite tile | 200; 22,729 bytes |
| Visual inspection | Desktop and 412 px mobile pass with live tiles, terrain, labels, route, and controls |
| Credential scan | No credential-shaped values found in repository sources |

## Risk controls

- API credentials remain behind the Node server and are never serialized to the browser.
- Proxy destinations are fixed in code; tile coordinates and response byte size are bounded.
- Search, route, and renderer endpoints have per-IP rate limits.
- Service binds to loopback and has a hardened systemd unit.
- Imagery attribution is visible, with source provenance and licensing caveat recorded.
- Rollback procedure is documented in `docs/runbook.md`.

## Go/no-go checks

- [x] Candidate builds from a clean generated-output state.
- [x] Loopback readiness and representative user workflow pass.
- [x] Rollback path is documented.
- [x] No secrets are present in source.
- [ ] systemd unit installed and verified.
- [ ] Public hostname and TLS path verified.

