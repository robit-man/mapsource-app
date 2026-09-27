# Mapsource Trail deployment report — v0.1.0

Date: 2026-09-26  
Status: **deployed and verified**

## Outcome

Mapsource Trail is live at `https://app.mapsource.io` and its source is public at `https://github.com/robit-man/mapsource-app`. It is a complete example integration of the `mapsource` npm package with server-held credentials, Mapsource vector/terrain resources, real routing and search, elevation, route replay, movable ordered stops, and optional attributed satellite imagery.

## Quality result

- release gate: pass
- dependency audit: 0 high-or-greater vulnerabilities
- production browser workflow: pass on desktop and mobile
- public API smoke: pass
- systemd restarts after deployment: 0
- rollback: not required

## Notable defect prevented

The unmocked visual gate found that the initial Vite production output omitted MapLibre's module-worker dependency, even though functional UI tests passed. The build now emits both worker modules explicitly and Playwright asserts their presence. This prevents a silent blank-map production failure.

## Operations

The app runs as `mapsource-app.service`, binds only to loopback port 3220, and is exposed solely through the existing remotely managed Cloudflare Tunnel. The app does not write runtime caches, image archives, or log files; logs remain in journald. Deployment, health, log, and rollback procedures are documented in `docs/runbook.md`.
