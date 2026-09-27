# Mapsource app request todo

This is the canonical, durable request ledger for `app.mapsource.io`. Each user
request has its own checkbox so implementation details are not lost by grouping
them into broad themes. Update the checkbox and add evidence in the same commit
that implements a request.

Status contract:

- `[x]` means the source change and a focused browser contract pass.
- `[ ] (in progress)` means source exists but the full local, deployed, and live
  verification for the current release is not complete.
- `[ ]` means the request remains queued.
- Physical sensor behavior stays open until exercised on real iOS/Android
  hardware, even when simulated browser coverage passes.

## App foundation and deployment

- [x] APP-001 Build a standalone one-page Mapsource integration app in its own
      repository, adjacent to the service and SDK repositories.
- [x] APP-002 Use a clean Mapsource-colored, rounded glass interface inspired
      by the useful planning interactions in Google Maps, Strava, and AllTrails.
- [x] APP-003 Keep the Mapsource API credential server-side and use the
      `mapsource` package/API boundary for authenticated calls.
- [x] APP-004 Serve the app at `app.mapsource.io` through loopback plus the
      existing tunnel.
- [x] APP-005 Run the app under an enabled systemd service with automatic
      restart and startup after host reboot.

## Map chrome, control geometry, and browser behavior

- [x] APP-006 Remove the old top-left brand chrome and the separate map-tilt
      control.
- [x] APP-007 Keep only the circular search control at top and the layers
      control to its right; expand search into a full row.
- [x] APP-008 Close the layers chooser after a layer is selected.
- [x] APP-009 Keep compact controls circular, elongated actions pill-shaped,
      and nested card radii calculated consistently against their containers.
- [x] APP-010 Prevent browser-level pinch, focus, keyboard, and wheel page zoom
      while preserving MapLibre pinch/drag/rotate interaction.
- [ ] APP-011 Disable page-wide text selection and native touch callouts so
      long presses and drags cannot select text.
- [x] APP-012 Keep the map attribution/info control closed on first load and at
      the true bottom-right of the screen.
- [x] APP-013 Center the attribution `i` only in its closed circular state; in
      its open state keep it right-aligned in a rounded box.
- [x] APP-014 Render the attribution `i` in Mapsource green on the same control
      background used by the other map controls.

## Map surfaces, imagery, terrain, and transitions

- [x] APP-015 Provide real Mapsource, satellite, elevation, dark, and light map
      surfaces.
- [x] APP-016 Source satellite imagery from the adjacent Earth integration and
      retain visible provider attribution and provenance.
- [x] APP-017 Use Mapsource's custom vector-style API for Mapsource, dark, and
      light rather than placeholder raster/panel behavior.
- [x] APP-018 Show meaningful real-image previews for every layer, with no
      question-mark/broken-image fallbacks and rounded-card geometry.
- [x] APP-019 Preserve center, zoom, bearing, and pitch when changing surfaces.
- [x] APP-020 Preserve 3D relief on Mapsource, satellite, elevation, dark, and
      light surfaces.
- [x] APP-021 Add distance fog/horizon blending so pitched terrain hides tile
      boundaries at the far edge.
- [x] APP-022 Rehydrate route geometry, traveled progress, waypoints, building
      selection, and 3D terrain after a style change.
- [x] APP-023 Crossfade layer changes instead of switching
      abruptly.
- [x] APP-024 Keep active device-location following connected
      through a layer change without requiring another location-button press.
- [x] APP-025 Preserve an intentionally detached camera through
      a layer change; resume follow only if follow was active before the change.

## Search and visible-place discovery

- [x] APP-026 Expand search with nearby category shortcuts for food, coffee,
      shopping, groceries, pharmacy, fuel, lodging, and parks.
- [x] APP-027 Populate the search field and results when a category shortcut is
      selected.
- [x] APP-028 Filter discovery to the visible/relevant map region and fit the
      camera to highlighted results without hiding them under the action sheet.
- [x] APP-029 Render simple category-relevant circular icons for businesses and
      places on the map.
- [x] APP-030 Show name, address, phone, website, and OpenStreetMap actions only
      when the selected business actually has those values.
- [x] APP-031 Keep the search loading spinner perfectly circular
      and inset equally from the search pill's top, bottom, and right edges.

## Travel modes and route data

- [x] APP-032 Offer exactly Walk, Bike, Car, Bus, and Train modes; remove Hike
      and Run.
- [x] APP-033 Give every travel mode a professional, distinct SVG icon.
- [x] APP-034 Give every mode a hot-swappable, mode-relevant action panel.
- [x] APP-035 Make all five modes simultaneously selectable on mobile.
- [x] APP-036 Route car with the driving profile and ensure it no longer returns
      the former `route unavailable` state.
- [x] APP-037 Route bus using mapped transit/bus-stop context and make the mode
      selectable and usable.
- [x] APP-038 Route train using rail, light-rail, and station context and make
      the mode selectable and usable.
- [ ] APP-039 Reverify real deployed route geometry and responses for Walk,
      Bike, Car, Bus, and Train after every supervised-service restart.

## Bottom action sheet and compact navigation view

- [x] APP-040 Support exactly three sheet states: minimized, half viewport, and
      expanded up to (but not beneath) the top search controls.
- [x] APP-041 Make the large surrounding region around the small drag indicator
      draggable, not only the few-pixel visual pill.
- [x] APP-042 Keep the drag indicator absolutely positioned so the mode title
      and routing/status pill have equal top and side spacing.
- [x] APP-043 Keep half and expanded panels internally scrollable without
      moving the entire page.
- [x] APP-044 In minimized mode, show compact distance, time, gain, loss, high,
      or other mode-relevant metrics across the top.
- [x] APP-045 In minimized mode, show the next maneuver near the waypoint
      progress rail and use the negative space at the bottom cleanly.
- [x] APP-046 Put Start route and End route actions along the very bottom of the
      minimized panel beneath the route progress display.
- [x] APP-047 In minimized mode, show waypoint names below their progress
      markers.
- [x] APP-048 Let long waypoint sequences extend horizontally, fade at both
      edges, auto-advance with travel, and support touch dragging to inspect hidden
      waypoints without crowding labels.
- [x] APP-049 Show only the travel mode name (`Walk`, `Bike`, `Car`, `Bus`, or
      `Train`) in the panel heading; remove redundant `plan` wording.

## Stops, ordering, and map waypoint manipulation

- [x] APP-050 Start with an empty planner; never preload the Pittock Mansion or
      any other placeholder route.
- [x] APP-051 With no stops, show dashed `Select on map or search` and `Current
location` origin actions; destination shows `Select on map or search`.
- [ ] APP-052 Replace the populated stop row's far-right move/map instruction
      with an always-available `×` remove button.
- [x] APP-053 Render A, numbered intermediate, and B labels upright and padded
      evenly inside pill-shaped stop rows.
- [x] APP-054 Allow stop rows to be reordered from anywhere except explicit
      buttons, update A/number/B labels while moving, and animate neighboring rows
      elastically.
- [x] APP-055 Keep a reordered row directly beneath the finger without jumping
      when its destination slot changes.
- [x] APP-056 Add breathing room around each between-stop `+` button.
- [x] APP-057 Make a new between-stop row a focused `Search stop` input (the
      words are a placeholder, not entered text) using the main search suggestion
      plumbing.
- [x] APP-058 Keep map tap placement and map-marker dragging under the exact
      touched screen coordinate at pitched and rotated cameras.
- [x] APP-059 Move a map waypoint only after a deliberate long press; an
      ordinary drag starting on the marker must pan the map.
- [x] APP-060 Keep a selected/enlarged A, B, or intermediate marker anchored at
      its geographic tip instead of shooting right during scaling.
- [x] APP-061 Draw an explicit connector from a user-selected waypoint to the
      route engine's snapped network coordinate so the route and marker never look
      disconnected.

## Long-press selection, buildings, and place details

- [x] APP-062 A map press-and-hold creates a temporary waypoint at the exact
      touched coordinate with lower-half radial Add, Info, and Navigate actions.
- [x] APP-063 Show a compact resolved place/address blurb above the temporary
      long-press waypoint.
- [x] APP-064 Resolve a selected point automatically to its local business,
      building, or street address without requiring Info first.
- [x] APP-065 When a building is touched, select only its smallest exact
      footprint and highlight its 3D extrusion bright Mapsource green.
- [x] APP-066 Resolve residential buildings through the full local geocoder to
      house number plus street whenever available; do not stop at coordinates.
- [x] APP-067 In the selected-place panel, use the address as the heading and
      coordinates as the subtitle; hide generic tags such as `yes`, `building`, or
      `residential`.
- [x] APP-068 The selected-place Navigate action makes the point the
      destination and uses current position as origin when location is enabled.
- [x] APP-069 When location is not enabled, Navigate keeps the destination,
      opens the half panel, and focuses the workflow on choosing an origin by map,
      search, or current location.
- [x] APP-070 Ask before replacing an existing route destination; with no
      existing destination, configure the selected point directly.
- [ ] APP-071 Clear the temporary waypoint, radial actions, building highlight,
      and unrevealed inspection when ordinary map space is tapped.
- [ ] APP-072 Center a newly long-pressed place in the actually visible upper
      map while the sheet is half open; with the minimized sheet place it slightly
      above full-viewport center.

## Device location, compass, camera follow, and initial region

- [x] APP-073 On first load, call the same Mapsource
      `/api/location` IP-location plumbing used by the primary site and center the
      map on the derived region for locally relevant terrain/nearby context.
- [x] APP-074 Keep the current Portland camera as a privacy-safe
      fallback and never let a late IP response override manual camera movement, a
      route, or explicit device location.
- [x] APP-075 Request geolocation and orientation/compass access together when
      the location control is activated.
- [x] APP-076 Use absolute, screen-compensated, tilt-aware heading with circular
      accuracy-weighted smoothing, moving GPS course, and route-bearing fallback.
- [ ] APP-077 Validate compass calibration and orientation on real iOS and
      Android hardware under the deployed HTTPS origin.
- [x] APP-078 With the sheet half open, center tracked location at the center of
      the visible upper half (about one-quarter viewport height / three-quarters up
      from the bottom), not behind the sheet.
- [ ] APP-079 Let pinch, rotate, and wheel/buttons adjust the camera while
      device-location follow remains locked; zoom must stay anchored on the
      current location and subsequent GPS fixes must preserve the chosen zoom.
- [x] APP-080 Only a one-pointer map pan detaches camera follow. Keep live
      position updates and the user marker active, and do not show `Recenter`
      for pinch, rotate, pitch, wheel, or +/- zoom.
- [x] APP-081 Show a compact `Recenter` tooltip beside the
      location control while detached and restore camera follow when pressed.

## Live navigation, next action, and rerouting

- [x] APP-082 Keep explicit route replay available as a separate preview tool
      with play/pause, restart, speed, and progress.
- [x] APP-083 `Start route` enters live GPS navigation; it must
      never start simulated route replay.
- [x] APP-084 Advance route progress and next-turn distance from
      real position fixes as the user moves.
- [x] APP-085 Replace the generic route icon in the compact next
      turn row with the direction-specific straight, left, right, U-turn, or
      arrival arrow/icon for the actual next action.
- [x] APP-086 Detect sustained, accuracy-aware departure from the
      route and automatically request a new route from the current position.
- [x] APP-087 Automatic rerouting must not force an intentionally
      detached camera back into follow mode.
- [x] APP-088 Preserve route visibility and live-navigation state
      across every map-surface change without requiring a mode toggle or another
      location-button press.
- [x] APP-089 Smooth active GPS fixes with an accuracy-aware moving window and
      continuously interpolate the visible current-location marker, camera,
      route progress, and heading without delaying genuine large movements.
- [x] APP-090 Prefer the selected map feature's name for natural areas, trails,
      parks, and other named features; show coordinates after that name, and use
      coordinates alone when neither an address nor a meaningful name exists.
- [ ] APP-091 Correct compass/map alignment from the actual sensor reference
      frames: use the W3C tilt and screen-orientation transform, reject invalid
      calibration, prefer fresh device heading over the distinct GPS course,
      and avoid fixed-degree correction offsets.
- [ ] APP-092 Reproduce and fix the confirmed physical-device failure where a
      GPS update delivered during a two-finger gesture cancels MapLibre pinch
      zoom. The acceptance test must inject location fixes while both touches
      remain down; +/- zoom, pinch zoom, marker updates, and camera follow must
      remain active together, and only a one-finger pan may reveal `Recenter`.
      Physical retest of release `4f53a14` still failed: the synthetic GPS-only
      regression did not reproduce continuous orientation camera updates during
      the gesture and is not accepted as proof of the handset behavior.
- [ ] APP-093 Reproduce and fix the confirmed physical-device heading error:
      the rendered scene is roughly 45 degrees counter-clockwise from the real
      device heading. Record raw compass, transformed heading, selected heading
      source, and final map bearing; correct the reference-frame/source error
      without adding a fixed 45-degree offset, then validate on real hardware.
      Physical retest after `e318a77` reduced but did not remove the error
      (roughly 25 degrees counter-clockwise). Account for both camera-animation
      lag and WebKit magnetic-north headings by applying location/date-derived
      WMM2025 declination to the map's true-north bearing. A subsequent physical
      retest after the WMM correction still reports roughly 20 degrees
      counter-clockwise. Audit the complete Earth/device/screen/map transform,
      keep the sensor source deterministic, convert geodetic true heading into
      the active map projection at the live location, and restore circular
      smoothing after all reference-frame corrections rather than before them.
      Never hard-reject a finite heading based on its reported accuracy: every
      compass update must move the scene at a confidence-weighted rate, while
      sustained natural movement gradually self-corrects compass bias against
      the measured true course without a fixed offset.
- [x] APP-094 Make place search region-aware: rank useful matches in and near
      the map's current/derived user region ahead of same-name results from
      distant countries, while retaining a deliberate path to globally search
      for a specifically requested remote place. Cover text search, stop search,
      and category discovery with ranking regression tests.
- [x] APP-095 During live navigation, allow a one-finger map drag to detach
      the camera without stopping GPS, progress, or rerouting. Show `Recenter`
      while detached; both that tooltip and the location control must restore
      follow around the latest current-location fix. Pinch/rotate/zoom must not
      enter this detached state.
- [x] APP-096 When location follow is active, let a two-finger zoom temporarily
      move the focal point, then smoothly ease the tracked location back to its
      locked visible-region center. Continuous GPS and compass updates must not
      interrupt that return or make it jump.
- [x] APP-097 While location follow is active, make the navigation compass
      toggle between top-down and angled perspective. Persist the selected pitch
      across compass/GPS updates instead of snapping back to the angled view.
- [x] APP-098 Long-press the lower-right heading/compass control to replace its
      rotating icon with a compact raw phone heading in degrees for physical
      debugging. Long-press again to restore the icon, and suppress the click
      action after a completed hold.
- [x] APP-099 Show available house numbers over residential building footprints
      at useful close zooms, comparable to visible business names but with
      collision/priority rules that keep dense neighborhoods legible.
- [x] APP-100 When compass confidence is low, visibly instruct the user to
      rotate and tilt the phone through multiple orientations to calibrate it.
      Continue using every finite compass sample, but while genuinely moving,
      increasingly favor measured direction of travel—especially when compass
      confidence is poor—as part of the live heading fusion.
- [x] APP-101 Restore durable app state across a page refresh: waypoint values,
      order and roles; travel mode; route/replay position; map surface and
      camera; route-panel mode; discovery filter; and selected-place context.
      Recompute route geometry from the restored inputs, validate and bound the
      versioned browser snapshot, and never serialize permissions, live sensor
      handles, animations, or in-flight requests.

## Release evidence required before closing in-progress work

- [x] TODO-VERIFY-001 `npm run validate` passes from a clean production build.
- [x] TODO-VERIFY-002 `npm audit --audit-level=high` passes.
- [x] TODO-VERIFY-003 The isolated built-server deployment check passes.
- [x] TODO-VERIFY-004 The supervised loopback deployment check passes after a
      restart of `mapsource-app.service`.
- [x] TODO-VERIFY-005 The public `https://app.mapsource.io` deployment check
      passes for all surfaces and all five route modes.
- [x] TODO-VERIFY-006 Live desktop and mobile browser checks cover IP focus,
      location follow/detach/recenter, pinch while navigating, style switching,
      live progress, maneuver arrows, and automatic rerouting.
- [x] TODO-VERIFY-007 Release commit `316b11b` is pushed to `main`; GitHub
      Actions release-gate run `36334870014` completed successfully.
- [ ] TODO-VERIFY-008 Confirm the corrected pinch and heading behavior on the
      reporting physical handset after this release reaches the public origin.
