# Requirements traceability

| Requirement | Implementation | Verification |
|---|---|---|
| One-page Mapsource map app | `src/App.tsx`, `src/components/MapCanvas.tsx` | Desktop/mobile Playwright |
| Search UI | `SearchBar.tsx`, `/api/search` | Search/add-stop Playwright flow |
| Hike-specific routes and metrics | `RoutePanel.tsx`, `/api/route` | Live route probe + E2E fixture |
| Drag and tap stop movement | draggable MapLibre markers + Move mode | Mobile Move E2E, manual live check |
| Route replay | route interpolation and replay controls | Unit route math + Playwright replay |
| Satellite from Earth | exact Esri source in server relay | Imagery provenance + live tile probe |
| Key remains server-side | Fastify boundary and same-origin routes | source review, browser bundle search |
| Public availability | systemd service + Cloudflare ingress | loopback and public smoke checks |
