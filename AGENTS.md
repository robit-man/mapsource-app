# Mapsource Trail agent guide

## Purpose

This repository is the public end-to-end integration example for the `mapsource` npm package. The browser owns interaction and rendering; `server/index.ts` is the credential boundary and the only code allowed to call authenticated Mapsource endpoints.

## Contracts that must not drift

- Use `mapsource` package types for JSON API requests and responses. Do not maintain a hand-written second OpenAPI contract.
- Keep `MAPSOURCE_API_KEY` server-side. Never place it in browser code, a query string, generated documentation, screenshots, fixtures, or logs.
- Binary renderer proxies must remain exact allowlists. Validate tile coordinates before constructing an upstream URL; never turn them into a general-purpose proxy.
- The Satellite option is derived from the adjacent Earth repository's `esri-world-imagery` basemap. Preserve the source URL, visible attribution, and provenance in `docs/imagery-provenance.md` together.
- OpenStreetMap, OpenMapTiles, Mapzen, and Esri attribution must stay visible when their data is rendered.

## Type checking and release gates

Run the compiler before every push:

```bash
npm run typecheck
```

Run the complete gate before pushing `main` or deploying:

```bash
npm run validate
npm audit --audit-level=high
```

`npm run validate` includes format, lint, TypeScript, unit coverage, a clean production build, and deterministic desktop/mobile Playwright flows. Do not weaken a failing gate to land a change.

## Local services

- Vite development UI: `127.0.0.1:3210`
- App server: `127.0.0.1:3220`
- Adjacent Mapsource gateway: `127.0.0.1:8787`
- Public target: `https://app.mapsource.io`

The application is intentionally loopback-bound. Cloudflare Tunnel is the only public ingress.

## Deployment safety

- Build before restarting the service; the server serves only `dist/`.
- Check `/health/live`, `/health/ready`, `/map/style.json`, a representative vector tile, and a real route before changing tunnel ingress.
- Preserve the previous Git commit for rollback. Roll back source by commit, rebuild, restart, and rerun live probes.
- Do not write credentials into the repository. The optional `/etc/mapsource-app.env` is root-owned mode `0600`.
- Do not mutate the adjacent Mapsource repository's protected geospatial assets. This app reads APIs only.

## UI rules

- Keep map interaction usable at 360 CSS pixels wide and with touch input.
- A user must be able to drag a marker or select Move and tap the map.
- Route progress is driven by live device location only. Do not restore simulated route replay controls or timers.
- The spatial-tools catalog must be projected from the installed `mapsource` package operation catalog. Interactive examples may add experience-specific copy, but must not become a second hand-maintained API inventory. Every published operation remains discoverable even when shared-demo-key safety means it is documentation-only.
- Keep controls accessible by name, pressed/expanded state, keyboard focus, and non-color state indicators.
