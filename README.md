# Mapsource Trail

A complete one-page route-planning application built with the public [`mapsource`](https://www.npmjs.com/package/mapsource) npm package. It demonstrates the kind of end-to-end mapping experience normally split across a basemap vendor, search provider, routing provider, elevation provider, and a separate outdoor activity application.

The live deployment is available at [`app.mapsource.io`](https://app.mapsource.io).

## What the example includes

- Mapsource vector cartography, glyphs, terrain tiles, local place search, pedestrian/bicycle routing, maneuvers, and route elevation.
- Walk, bicycle, car, bus, and train planning with 2–10 ordered stops. Bus views reference mapped bus stops; train views reference mapped railway tracks, stations, and light-rail stations while distinguishing network previews from live schedules.
- Draggable map stops, tap-to-reposition mode, editable stop names, inline local search for inserted stops, and elastic route-stop reordering with live A/#/B relabeling.
- Route replay with progress, heading-following camera, 1×/2×/4× speed, and a hydrated traveled path.
- Elevation gain, loss, high point, profile, distance, duration, and turn-by-turn directions.
- Mapsource, satellite, elevation, dark, and light surfaces with real local imagery previews. Esri World Imagery comes from the canonical Satellite source used by the adjacent NOCLIP Earth application, with attribution available from the closed-by-default map information control.
- Responsive glass UI: a full planner on desktop and a touch-tracking, draggable bottom sheet on phones.
- Location tracking requests device orientation from the same user gesture, follows compass heading, and falls back to the nearest route bearing when heading data is unavailable. Browser-level zoom is locked while native map gestures remain active.

The interface is an original Mapsource implementation. It demonstrates familiar map, activity, and trail-planning interaction patterns without copying proprietary product assets or source code.

## Architecture

```text
Browser (React + MapLibre)
  ├─ /api/search       ─┐
  ├─ /api/route        ─┼─ Node/Fastify example server
  ├─ /map/style.json   ─┤    └─ mapsource npm client → Mapsource API
  ├─ /map/tiles/*      ─┤
  ├─ /map/terrain/*    ─┤
  └─ /map/satellite/* ──┘       → allowlisted Esri World Imagery tiles
```

The Mapsource API key never enters browser JavaScript, HTML, URLs, or local storage. The server uses the typed npm client for JSON APIs and narrow same-origin binary proxies for renderer resources. Tile paths validate coordinate bounds and never accept arbitrary upstream URLs.

## Run locally

Requirements: Node.js 20.19 or newer and a Mapsource API key.

```bash
npm install
cp .env.example .env
# Add MAPSOURCE_API_KEY to .env, export it through your secret manager,
# or use the adjacent development gateway's site-bound demo key.
npm run dev
```

Open `http://127.0.0.1:3210`. Vite proxies API and map requests to the app server on `127.0.0.1:3220`.

The deployed host uses the adjacent gateway over loopback:

```bash
MAPSOURCE_API_ORIGIN=http://127.0.0.1:8787 npm run build
MAPSOURCE_API_ORIGIN=http://127.0.0.1:8787 npm start
```

## Package integration

The server creates one typed Mapsource client. A real integration can use the same pattern:

```ts
import { createClient } from "mapsource";

const mapsource = createClient({
  apiKey: process.env.MAPSOURCE_API_KEY,
  baseUrl: process.env.MAPSOURCE_API_ORIGIN,
});

const { data, error, response } = await mapsource.POST("/api/route", {
  body: {
    locations: [
      { lat: 45.53616, lon: -122.71256 },
      { lat: 45.52521, lon: -122.71627 },
    ],
    costing: "pedestrian",
    elevation: true,
  },
});

if (error) throw new Error(`Mapsource ${response.status}`);
```

See [`server/index.ts`](server/index.ts) for search, routing, style rewriting, and the renderer proxies.

## Verification

```bash
npm run validate
npm audit --audit-level=high
```

The release gate runs formatting, lint, the sequential TypeScript compiler, unit tests with coverage, a production build, and desktop/mobile Playwright flows. The browser tests cover route planning, expandable search, self-closing layers, all planner families, stop insertion/reordering, replay, attribution state, and the mobile sheet drag gesture.

The durable requirement/status ledger is
[`docs/interaction-work-queue.md`](docs/interaction-work-queue.md). A checked
implementation item requires a passing focused browser contract; live deployment
and physical-device acceptance remain separate, explicit gates in that file.

After starting a production artifact, verify the live boundaries:

```bash
npm run deploy:check
DEPLOYMENT_ORIGIN=https://app.mapsource.io npm run deploy:check
```

## Deployment

The checked-in systemd unit binds the server to loopback on port 3220. The Cloudflare Tunnel routes only `app.mapsource.io` to that origin. See [`docs/runbook.md`](docs/runbook.md) for install, rollback, health, and smoke-test procedures.

## Data and attribution

- Maps and routes: © OpenStreetMap contributors.
- Vector cartography: Mapsource and OpenMapTiles.
- Terrain: Mapzen Terrain Tiles on AWS Open Data.
- Satellite: Tiles © Esri; source credits are shown in the app. Commercial deployments must confirm their Esri licensing basis.

The satellite source derivation and official term references are recorded in [`docs/imagery-provenance.md`](docs/imagery-provenance.md).

## License

Application code is MIT licensed. Third-party data, imagery, and map services retain their own licenses and terms.
