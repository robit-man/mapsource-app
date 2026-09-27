# Mapsource app interaction work queue

> The itemized canonical intake ledger is
> [`docs/app-request-todo.md`](./app-request-todo.md). This older acceptance
> view remains for grouped browser contracts; new requests and implementation
> status must be recorded in the canonical ledger first.

This is the durable acceptance queue for the `app.mapsource.io` implementation.
An item is checked when its source change and focused browser contract pass.
The separate release gate records full validation, loopback deployment, live
verification, and delivery. Update this file in the same commit as the
corresponding behavior.

## Release gate

- [x] The standalone app repository exists adjacent to the Mapsource SDK and is
      served at `app.mapsource.io` by an enabled, restart-on-failure systemd
      service that starts again after host reboot.
- [x] `npm run validate` passes from a clean production build.
- [x] `npm audit --audit-level=high` reports no high/critical findings.
- [x] `scripts/deployment-check.mjs` passes against an isolated production build
      on loopback.
- [x] `scripts/deployment-check.mjs` passes against the supervised loopback
      service and the live origin.
- [x] All five route modes and all five map surfaces pass after the supervised
      service is restarted (not merely after rebuilding static assets).
- [x] Desktop and mobile screenshots have been inspected at the live origin.
- [x] Commit is pushed to `main` and its GitHub Actions run is green.

## Verification record

This is evidence for the checkboxes above, not a substitute for the remaining
live and device checks.

| Date       | Scope                       | Command or contract                                            | Result                                                                                                                                                                  |
| ---------- | --------------------------- | -------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-09-26 | Full source gate            | `E2E_PORT=3221 npm run validate`                               | Pass: format, lint, TypeScript, 3 unit tests, clean build, 20 browser tests; 4 viewport-inapplicable cases skipped                                                      |
| 2026-09-26 | Dependency audit            | `npm audit --audit-level=high`                                 | Pass: 0 vulnerabilities                                                                                                                                                 |
| 2026-09-26 | Built-server integration    | `DEPLOYMENT_ORIGIN=http://127.0.0.1:3221 npm run deploy:check` | Pass: 5 styles, 4 previews, raster/vector/satellite tiles, and all 7 real route requests                                                                                |
| 2026-09-26 | Waypoint gesture regression | focused Playwright contract, repeated 3× per viewport          | Pass: 6/6; ordinary pin drag pans without rerouting, hold-drag moves with ≤1 CSS-pixel tracking error                                                                   |
| 2026-09-26 | Supervised/live integration | loopback and `https://app.mapsource.io` deployment checks      | Pass: health, 5 styles, 4 previews, 3 tile classes, all 7 route modes, and satellite after supervised restart                                                           |
| 2026-09-26 | Live waypoint interaction   | browser gesture against `https://app.mapsource.io`             | Pass: ordinary drag changed only camera; 520 ms hold moved stop at 0 px tracking error; reroute returned 200                                                            |
| 2026-09-26 | Boot persistence            | systemd unit state and target-link verification                | Pass: base, app, and tunnel enabled; app active with `Restart=always`; multi-user target link resolves correctly                                                        |
| 2026-09-26 | Live visual inspection      | 1440×900 desktop and Pixel 7 viewports                         | Pass: map, route, controls, action sheet, typography, terrain, attribution, and responsive containment inspected                                                        |
| 2026-09-26 | Hosted release gate         | GitHub Actions run `36300561921` for `608a782`                 | Pass: clean install, Playwright browser install, full validation, and dependency audit                                                                                  |
| 2026-09-27 | Current full source gate    | `npm run validate`; `npm audit --audit-level=high`             | Pass: formatting, lint, TypeScript, 14 unit tests, clean build, 30 applicable browser tests, and 0 vulnerabilities                                                      |
| 2026-09-27 | Built/supervised/live APIs  | `npm run deploy:check` against ports 3224, 3220, and public    | Pass: five styles, previews, tile classes, transit discovery, five route modes, and satellite                                                                           |
| 2026-09-27 | Live navigation interaction | `npm run deploy:check:interaction` against the public origin   | Pass: IP focus, smoothed GPS marker, maneuver arrow, style continuity, locked pinch zoom through later GPS fixes, one-finger pan detach/Recenter, and automatic reroute |
| 2026-09-27 | Hosted release gate         | GitHub Actions run `36334870014` for `316b11b`                 | Pass: clean install, formatting, lint, TypeScript, unit coverage, production build, 30 browser tests, and audit                                                         |
| 2026-09-27 | GPS-during-pinch regression | focused and full mobile Playwright contracts                   | Pass: a GPS fix arrives while both touch points remain down; zoom completes, tracking/follow stays active, and no Recenter control appears                              |
| 2026-09-27 | Regional search ranking     | unit contract plus supervised `/api/search`                    | Pass: nearby Portland matches rank first; explicit `in City, Country` queries retain global lookup                                                                      |
| Pending    | Device sensors              | physical iOS/Android heading and calibration exercise          | Not yet run                                                                                                                                                             |

Focused browser contracts live in `tests/e2e/app.spec.ts`. They cover location
and heading, the complete planner flow, discovery, attribution geometry, all
planner families, all mobile modes, zoom locking, direct waypoint placement,
long-press actions, sheet dragging, the three snap modes, minimized metrics, and
the long waypoint rail. Revealed selected-place details may open the sheet once,
but must never prevent a later drag from reaching the true minimized state.
`scripts/deployment-check.mjs` is the independent
real-backend contract for styles, tiles, previews, and route modes.

## Application chrome and map controls

- [x] Remove the old top-left brand/chrome; retain a circular search control and
      circular layers control.
- [x] Expand search into a full row and close the layers menu after a selection.
- [x] Prevent browser pinch/focus/keyboard zoom without disabling map gestures.
- [ ] Disable page-wide text selection and native touch callouts so map holds,
      stop reordering, and sheet drags cannot trigger browser selection UI.
- [x] Keep every circular control circular; use pill shapes only for elongated
      controls and calculated rounded rectangles for content cards.
- [x] Keep the attribution control closed on load at the true bottom-right. Its
      closed icon is centered and Mapsource green; its open state is a compact
      rounded rectangle with the icon on the right.

## Map surfaces, terrain, and camera

- [x] Load real Mapsource, satellite, elevation, dark, and light surfaces.
      Mapsource/dark/light must use Mapsource's compiled vector-style API.
- [x] Show real preview imagery for every layer without broken-image/question
      icons; previews are nested rounded cards, not pills.
- [x] Preserve center, zoom, bearing, and pitch across style changes.
- [x] Crossfade surface changes without dropping active device-location
      following. Preserve a deliberately detached camera across the change and
      resume follow only when it was active before the new style loaded.
- [x] Rehydrate active route geometry, traveled progress, waypoint connectors,
      and the selected-building extrusion immediately after a style change.
- [x] Preserve 3D terrain on Mapsource, dark, light, elevation, and satellite.
- [x] Add distance fog/horizon blending for aggressively pitched terrain.
- [x] When a mobile sheet covers the lower viewport, fit routes and discoveries
      into the actually visible map region above it.
- [x] Do not re-fit the camera after direct map placement or marker dragging;
      the touched geographic position must remain under the user's finger.
- [x] Prove screen-coordinate parity for waypoint placement and press-and-hold:
      the rendered pin anchor must remain within 2 CSS pixels of the original
      pointer position at pitched/rotated desktop and mobile cameras.
- [x] Render explicit route-snap connectors from every user waypoint to the
      network geometry so a backend-snapped path never appears detached from
      the selected point.

## Travel modes and routing

- [x] Provide walk, bike, car, bus, and train modes with distinct panels,
      professional mode icons, and labels. Bus mode loads mapped bus/transit
      stops; train mode loads mapped railway stations and emphasizes the vector
      railway/light-rail network rather than relying on labels alone.
- [x] Keep all five mode controls simultaneously visible/selectable on mobile.
- [x] Verify live geometry for every mode; car uses `auto`, bus/train use the
      available `bus` network profile, bike uses `bicycle`, and walk uses
      `pedestrian`.
- [x] Historical: simulated route replay was implemented and later removed at
      the owner's request; live GPS navigation now exclusively drives progress.
- [x] Make `Start route` enter live GPS navigation instead of simulated replay;
      advance progress from movement and replace the generic route glyph with a
      direction-specific straight, left, right, or U-turn arrow for the actual
      next action.
- [x] Detect sustained, accuracy-aware route deviation and automatically
      rebuild the route from the current position without forcing a detached
      camera back into follow mode.

## Mobile action sheet

- [x] Support three drag-snap states: minimized, half viewport, and expanded up
      to the search controls.
- [x] Keep the small visual drag pill, but give it a broad invisible grab area.
- [x] Keep the grab target absolutely positioned so it does not push the plan
      title/status row down; top and side insets must match.
- [x] Half and expanded states expose the route work area with internal scroll.
- [x] Minimized state with a route shows compact mode-relevant
      distance/time/gain/loss/high metrics, the next maneuver, waypoint live
      navigation progress, and bottom-aligned
      start/end route actions.
- [x] Minimized progress includes named waypoints on an extended horizontal
      rail, draggable by touch, faded at both edges, and auto-panned as live
      navigation advances so long routes do not crowd labels.
- [x] Minimized state without a route uses the available space for a direct
      `Where to?` destination action and nearby food, coffee, outdoors, and fuel
      discovery rather than blank metrics or invented personalization.

## Stops and waypoint manipulation

- [x] Start with an empty planner instead of a preloaded Pittock Mansion route.
- [x] In the empty planner, show dashed origin actions for `Select on map or
search` and `Current location`; destination exposes only `Select on map
or search`.
- [ ] Replace the far-right move-pin action in populated stop pills with an
      always-available remove `×`; map placement remains available through the
      empty-slot flow and dragging stays available from the stop row/map pin.
- [x] Stops use A / intermediate number / B labels and upright map pins.
- [x] Stop rows are pill-shaped and draggable from anywhere except explicit
      controls; labels update during reorder.
- [x] The dragged stop uses a body-level overlay and window-level pointer
      tracking so reordering rows cannot move it away from the finger.
- [x] Add-stop buttons have breathing room and insert between adjacent stops.
- [x] A new stop starts as a focused `Search stop` field using the same local
      Mapsource suggestions as top search; choosing one hydrates coordinates.
- [x] Map taps and marker drags update route coordinates without subsequent
      camera movement creating a false visual jump.
- [x] Waypoint pins move only after a deliberate long press. A normal drag that
      starts on a pin must pan the map exactly like a drag on ordinary map
      space, preventing accidental route edits. The browser contract also
      verifies that arming does not introduce a pointer-to-pin jump.
- [ ] Keep a selected A/B/intermediate map pin anchored at its geographic tip
      when its visual enlarges; scaling must never move the label away from the
      selected coordinate.

## Search and visible-place discovery

- [x] Prefer useful place-search matches in the current map/IP/device region
      over same-name results halfway around the world. Apply the same regional
      ranking contract to top search and stop search, retain intentional global
      lookup, and cover the ordering with deterministic regressions.
- [x] Keep the search loading spinner perfectly circular and inset from the
      pill's right edge by the same distance as its top and bottom edges.
- [x] Expanded search fades in nearby category actions for food, coffee,
      shopping, groceries, pharmacy, fuel, lodging, and parks.
- [x] Category actions populate search, query the visible region, fit results
      once, and render category-specific circular markers.
- [x] Place popups show mapped address plus phone, website, and OpenStreetMap
      actions only when those values exist.
- [x] Press-and-hold on empty map space creates a temporary point with a radial
      lower-half action cluster: add intermediate stop, inspect, and navigate.
- [x] Inspect loads reverse-geocoded place/business data from Mapsource and
      presents details plus route actions inside the action sheet.
- [x] Show the resolved place name and full mapped address in a compact label
      above the long-press waypoint.
- [x] Navigate uses current device location as origin when starting a new route;
      when a destination already exists it asks before replacing it.
- [x] The inspection-card Navigate action makes the selected point the
      destination. It uses the current position only while tracking is active;
      otherwise it leaves a destination-only route, expands the sheet to half,
      and arms origin selection from map, search, or current location.
- [ ] Tapping ordinary map space outside a held-point marker/action cluster
      clears the held point, building highlight, and unrevealed inspection.
- [x] Resolve a held map point immediately to the mapped business/building and
      street address, rather than requiring the separate info action first.
- [x] When the held point intersects a rendered building, highlight that exact
      footprint bright green while keeping the waypoint and radial actions at
      the original pointer location.
- [x] Select only the smallest exact building footprint, render the highlight
      on its 3D extrusion, and resolve details from its address/centroid rather
      than reverse-geocoding the visually displaced facade pixel.
- [x] Resolve house number plus street for residential buildings through the
      full local geocoder path; coordinates are a subtitle/fallback and must not
      replace an available postal address.
- [x] Keep travel-mode headers concise (`Walk`, `Bike`, `Car`, and so on)
      without redundant `plan` wording.
- [x] Use the resolved street address as the selected-building heading, keep
      coordinates as its subtitle, and suppress generic OSM values such as
      `yes`, `building`, and `residential` from user-facing labels.
- [ ] After the held point is anchored, focus it in the center of the visible
      upper map when the sheet is half open; with a minimized sheet, place it
      only slightly above the full viewport center.

## Location and heading

- [x] On the first page load, resolve the visitor's approximate region through
      Mapsource's existing `/api/location` IP-location endpoint and focus the
      map there before nearby/topographic context is presented. Preserve the
      current default camera as the privacy-safe fallback when lookup fails,
      and never let a late response override a user's camera interaction,
      route, or explicit device-location choice.
- [x] Location click requests both geolocation and orientation permission.
- [x] While device tracking is active, center the user in the map area that is
      actually visible above a half-height mobile action sheet.
- [x] Keep map zoom user-controlled while location/heading tracking is active;
      preserve the selected zoom across sensor updates and keep the location
      anchored at the visible-region center after zooming.
- [ ] Keep pinch, rotate, pitch, wheel, and +/- zoom locked to the current
      location while navigation remains live. Only a one-pointer pan detaches
      camera follow and reveals the nearby `Recenter` control.
- [x] Smooth GPS jitter with an accuracy-aware moving average and continuous
      marker interpolation while preserving prompt real movement and rerouting.
- [x] Use a selected natural/trail/park feature name plus coordinates when an
      address is unavailable, falling back to coordinates for unnamed terrain.
- [ ] Correct compass alignment through the sensor, screen, and map-bearing
      reference frames; never conceal the cause with a fixed angle offset.
- [ ] Physical-device regression: inject GPS and continuous orientation events
      during an in-progress pinch and prove zoom continues while follow and
      marker updates remain active. Release `4f53a14` passed GPS-only emulation
      but failed the reporting physical handset, so that test was insufficient.
- [x] During live navigation, one-finger map dragging detaches only the camera,
      keeps GPS/progress/rerouting active, reveals `Recenter`, and restores
      current-location follow from either `Recenter` or the location control.
      Two-finger and zoom gestures must never take this path.
- [x] Smoothly return an active location-follow camera to the locked center
      after two-finger zoom; sensor updates must not interrupt the easing.
- [x] With location follow active, use the lower-right compass as a persistent
      top-down/angled perspective toggle rather than briefly resetting before
      the next sensor update restores the angled pitch.
- [x] Long-press that heading control to toggle a small raw phone-heading degree
      readout in the existing button; long-press again restores the rotating
      compass icon without also triggering the perspective click.
- [x] At close zooms, label residential buildings with available house numbers,
      using collision and priority controls comparable to business labels.
- [x] Show a calibration instruction when the compass reports low confidence;
      while motion is established, dynamically weight GPS course more heavily
      than the uncertain compass as part of the displayed heading.
- [x] Restore the current route inputs and waypoint order, travel mode, surface
      and camera, sheet mode, discovery filter, and
      selected-place context after refresh from a validated, size-bounded,
      versioned local snapshot. Recalculate the route from canonical inputs and
      do not persist browser permission or live sensor/request handles.
- [x] Sort ordinary place-search candidates nearest-first after relevance
      filtering, using lexical quality only for equal-distance ties; do not
      override the stated destination in explicitly region-qualified queries.
- [ ] Physical-device regression: scene bearing is currently reported roughly
      45 degrees counter-clockwise from reality. Capture raw/transformed/source/
      map-bearing telemetry and fix the actual reference-frame selection. A
      retest after `e318a77` still showed roughly 25 degrees: remove camera
      interpolation lag and convert WebKit magnetic heading to true heading with
      location/date-derived WMM2025 declination, not a constant offset. The
      WMM-corrected physical build is still reported roughly 20 degrees
      counter-clockwise; audit Earth/device/screen/projected-map transforms,
      lock to one deterministic sensor source, and smooth only the final
      corrected bearing.
- [x] Use tilt-compensated absolute orientation, screen rotation compensation,
      accuracy-weighted circular smoothing without a hard compass cutoff, GPS
      course while moving, bounded movement-derived self-correction, and
      nearest-route bearing fallback.
- [ ] Verify heading and calibration behavior on a real mobile sensor in the
      deployed HTTPS application; browser simulation is necessary but not
      sufficient for sensor acceptance.

## Tests already represented in source

- [x] Search, nearby discovery, surface selection, camera preservation,
      terrain, fog, and live navigation progress.
- [x] Orientation permission, heading smoothing, and calibration rejection.
- [x] Every desktop planner family and every mobile mode control.
- [x] Inline stop search and reorder pointer lock.
- [x] Browser zoom lock and mobile sheet dragging.
- [x] Business discovery and conditional actions.
- [x] Attribution closed/open geometry.
- [x] Direct map placement preserves camera framing.
- [x] Long-press point actions and action-sheet inspection/navigation.
- [x] Long waypoint progress rail overflow, touch pan, edge fade, and auto-pan.
- [x] Pointer-to-pin parity, route-snap connectors, automatic held-point address
      resolution, and selected-building highlighting.
