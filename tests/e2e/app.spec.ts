import { expect, test, type Page } from "@playwright/test";

const routeResponse = {
  schema: "mapsource-route.v1",
  profile: "pedestrian",
  summary: { distanceKm: 3.142, durationSeconds: 2221 },
  geometry: {
    type: "LineString",
    coordinates: [
      [-122.71256, 45.53616],
      [-122.7141, 45.532],
      [-122.71627, 45.52521],
    ],
  },
  maneuvers: [
    {
      instruction: "Follow Lower Macleay Trail.",
      distanceKm: 1.72,
      durationSeconds: 1210,
      shapeIndex: 0,
    },
    {
      instruction: "Continue toward the overlook.",
      distanceKm: 1.422,
      durationSeconds: 1011,
      shapeIndex: 1,
    },
  ],
  elevation: {
    samples: [42, 55, 78, 113, 160, 209, 260, 284],
    gainMeters: 260,
    lossMeters: 18,
    minMeters: 42,
    maxMeters: 284,
  },
};

async function stubApplicationApis(page: Page) {
  await page.route("**/api/route", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify(routeResponse),
    });
  });
  await page.route("**/api/search?**", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        schema: "mapsource-lookup.v1",
        results: [
          {
            id: "forest-park",
            kind: "landmark",
            name: "Forest Park",
            displayName: "Forest Park, Portland, Oregon",
            coordinate: { lat: 45.5723, lon: -122.741 },
          },
        ],
      }),
    });
  });
  await page.route("**/api/discover?**", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        category: "restaurant",
        radius: 2400,
        places: [
          {
            id: "osm-node-101",
            name: "Trail House Cafe",
            categories: ["restaurant"],
            coordinate: { lat: 45.533, lon: -122.72 },
            address: {
              housenumber: "12",
              street: "Forest Road",
              city: "Portland",
              postcode: "97210",
              country: "United States",
            },
            distanceMeters: 430,
            properties: {
              phone: "+1 503 555 0101",
              website: "https://example.com/trail-house",
            },
            sources: [
              {
                dataset: "OpenStreetMap",
                id: "node/101",
                url: "https://www.openstreetmap.org/node/101",
              },
            ],
          },
        ],
      }),
    });
  });
  await page.route("**/api/inspect?**", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        schema: "mapsource-places.v1",
        place: {
          id: "osm-node-101",
          name: "Trail House Cafe",
          categories: ["restaurant", "cafe"],
          coordinate: { lat: 45.533, lon: -122.72 },
          address: {
            housenumber: "12",
            street: "Forest Road",
            city: "Portland",
            postcode: "97210",
            country: "United States",
          },
          distanceMeters: 12,
          properties: {
            phone: "+1 503 555 0101",
            website: "https://example.com/trail-house",
          },
          sources: [
            {
              dataset: "OpenStreetMap",
              id: "node/101",
              url: "https://www.openstreetmap.org/node/101",
            },
          ],
        },
        candidates: [],
      }),
    });
  });
  await page.route("**/map/style.json*", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        version: 8,
        name: "Mapsource test",
        sources: {
          "mapsource-terrain": {
            type: "raster-dem",
            tiles: ["/test-terrain/{z}/{x}/{y}.png"],
            tileSize: 256,
            maxzoom: 0,
            encoding: "terrarium",
          },
          "test-buildings": {
            type: "geojson",
            data: {
              type: "FeatureCollection",
              features: [
                {
                  type: "Feature",
                  properties: {
                    building: "yes",
                    name: "Building collection",
                    render_height: 9,
                    render_min_height: 0,
                  },
                  geometry: {
                    type: "Polygon",
                    coordinates: [
                      [
                        [-124, 44],
                        [-121, 44],
                        [-121, 47],
                        [-124, 47],
                        [-124, 44],
                      ],
                    ],
                  },
                },
                {
                  type: "Feature",
                  properties: {
                    building: "yes",
                    name: "Trail House Cafe",
                    render_height: 24,
                    render_min_height: 2,
                  },
                  geometry: {
                    type: "Polygon",
                    coordinates: [
                      [
                        [-123, 45],
                        [-122, 45],
                        [-122, 46],
                        [-123, 46],
                        [-123, 45],
                      ],
                    ],
                  },
                },
              ],
            },
          },
        },
        layers: [
          {
            id: "background",
            type: "background",
            paint: { "background-color": "#263027" },
          },
          {
            id: "buildings.fill",
            type: "fill",
            source: "test-buildings",
            paint: { "fill-color": "#263027", "fill-opacity": 0.01 },
          },
          {
            id: "buildings.extrusion",
            type: "fill-extrusion",
            source: "test-buildings",
            paint: {
              "fill-extrusion-color": "#263027",
              "fill-extrusion-height": ["get", "render_height"],
              "fill-extrusion-base": ["get", "render_min_height"],
            },
          },
        ],
      }),
    });
  });
  await page.route("**/test-terrain/**", async (route) => {
    await route.fulfill({ status: 204 });
  });
  await page.route("**/map/satellite/**", async (route) => {
    await route.fulfill({ status: 204 });
  });
  await page.route("**/map/preview/**", async (route) => {
    await route.fulfill({ status: 204 });
  });
  await page.route("**/map/tiles/raster/**", async (route) => {
    await route.fulfill({ status: 204 });
  });
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    const testWindow = window as Window & { __orientationRequests?: number };
    testWindow.__orientationRequests = 0;
    const Orientation = window.DeviceOrientationEvent ?? class extends Event {};
    Object.defineProperty(Orientation, "requestPermission", {
      configurable: true,
      value: () => {
        testWindow.__orientationRequests =
          (testWindow.__orientationRequests ?? 0) + 1;
        return Promise.resolve("granted");
      },
    });
    Object.defineProperty(window, "DeviceOrientationEvent", {
      configurable: true,
      value: Orientation,
    });
  });
  await stubApplicationApis(page);
  await page.goto("/");
  await expect(
    await page.request.get("/assets/maplibre-gl-worker.mjs"),
  ).toBeOK();
  await expect(
    await page.request.get("/assets/maplibre-gl-shared.mjs"),
  ).toBeOK();
  await expect(page.getByRole("heading", { name: "Hike plan" })).toBeVisible();
  await expect(
    page.locator(".stat-primary").getByText("3.14 km"),
  ).toBeVisible();
  await expect(page.locator(".brand-mark")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Open search" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Map layers" })).toBeVisible();
  await expect(page.locator(".maplibregl-ctrl-attrib")).not.toHaveClass(
    /maplibregl-compact-show/,
  );
  await expect(page.locator(".maplibregl-ctrl-attrib")).toBeVisible();
});

test("requests orientation with location and follows an absolute heading", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["geolocation"], {
    origin: new URL(page.url()).origin,
  });
  await context.setGeolocation({
    latitude: 45.531,
    longitude: -122.716,
    accuracy: 8,
  });
  const locate = page.getByRole("button", { name: "Find my location" });
  await locate.click();
  await expect(locate).toHaveAttribute("data-orientation", "granted");
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (window as Window & { __orientationRequests?: number })
            .__orientationRequests ?? 0,
      ),
    )
    .toBe(1);
  await page.evaluate(() => {
    const orientation = new Event("deviceorientationabsolute");
    Object.defineProperties(orientation, {
      absolute: { value: true },
      alpha: { value: 270 },
    });
    window.dispatchEvent(orientation);
  });
  await expect(locate).toHaveAttribute("data-heading", "90.0");
  await expect(page.locator(".map-canvas")).toHaveAttribute(
    "data-camera-bearing",
    "90.0",
  );
  await page.evaluate(() => {
    const inaccurate = new Event("deviceorientationabsolute");
    Object.defineProperties(inaccurate, {
      absolute: { value: true },
      webkitCompassAccuracy: { value: 90 },
      webkitCompassHeading: { value: 180 },
    });
    window.dispatchEvent(inaccurate);
  });
  await expect(locate).toHaveAttribute("data-orientation", "calibrate");
  await expect(locate).toHaveAttribute("data-heading", "90.0");
  await page.evaluate(() => {
    const accurate = new Event("deviceorientationabsolute");
    Object.defineProperties(accurate, {
      absolute: { value: true },
      webkitCompassAccuracy: { value: 5 },
      webkitCompassHeading: { value: 100 },
    });
    window.dispatchEvent(accurate);
  });
  await expect(locate).toHaveAttribute("data-orientation", "granted");
  await expect(locate).toHaveAttribute("data-heading", "92.4");
});

test("plans, searches, layers, and replays a hike", async ({
  page,
  isMobile,
}) => {
  await page.getByRole("button", { name: "Map layers" }).click();
  await expect(page.getByRole("button", { name: /Elevation/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /Dark/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /Light/ })).toBeVisible();
  await expect(page.locator(".map-canvas")).toHaveAttribute(
    "data-camera",
    /.+/,
  );
  const originalCamera = await page
    .locator(".map-canvas")
    .getAttribute("data-camera");
  await page.getByRole("button", { name: /Dark/ }).click();
  await expect(page.locator(".map-canvas")).toHaveAttribute(
    "data-surface",
    "dark",
  );
  await expect(page.locator(".map-canvas")).toHaveAttribute(
    "data-terrain",
    "on",
  );
  await expect(page.locator(".map-canvas")).toHaveAttribute("data-fog", "on");
  await expect(page.locator(".map-canvas")).toHaveAttribute(
    "data-camera",
    originalCamera ?? "",
  );
  await page.getByRole("button", { name: "Map layers" }).click();
  await page.getByRole("button", { name: /Light/ }).click();
  await expect(page.locator(".map-canvas")).toHaveAttribute(
    "data-surface",
    "light",
  );
  await expect(page.locator(".map-canvas")).toHaveAttribute(
    "data-terrain",
    "on",
  );
  await page.getByRole("button", { name: "Map layers" }).click();
  await page.getByRole("button", { name: /Elevation/ }).click();
  await expect(page.locator(".map-canvas")).toHaveAttribute(
    "data-surface",
    "elevation",
  );
  await page.getByRole("button", { name: "Map layers" }).click();
  await page.getByRole("button", { name: /Satellite/ }).click();
  await expect(page.getByRole("button", { name: /Satellite/ })).toBeHidden();
  await expect(
    page.getByRole("button", { name: "Map layers" }),
  ).toHaveAttribute("aria-expanded", "false");

  await page.getByRole("button", { name: "Open search" }).click();
  const search = page.getByLabel("Search trailheads, parks, and addresses");
  await search.fill("Forest Park");
  await expect(page.getByRole("option")).toContainText("Forest Park");
  await page.getByRole("option").click();
  await expect(page.getByLabel("Stop 2")).toHaveValue("Forest Park");
  await expect(page.getByText("Routing", { exact: true })).toBeVisible();
  await expect(page.getByText("Live", { exact: true })).toBeVisible();

  if (isMobile) {
    await page.getByRole("button", { name: "Expand route planner" }).click();
  }
  const progress = page.getByRole("slider", { name: "Replay progress" });
  await progress.fill("0.125");
  await expect(progress).toHaveValue("0.125");
  await page.getByRole("button", { name: "Play replay" }).click();
  await expect(
    page.getByRole("button", { name: "Pause replay" }),
  ).toBeVisible();
});

test("discovers visible businesses and exposes available actions", async ({
  page,
}) => {
  await page.getByRole("button", { name: "Open search" }).click();
  await expect(page.getByLabel("Explore nearby")).toBeVisible();
  await page.getByRole("button", { name: "Hungry" }).click();
  await expect(
    page.getByLabel("Search trailheads, parks, and addresses"),
  ).toHaveValue("restaurants");
  const marker = page.getByRole("button", { name: "Trail House Cafe" });
  await expect(marker).toBeVisible();
  await marker.click();
  await expect(page.getByText("Trail House Cafe")).toBeVisible();
  await expect(page.getByRole("link", { name: "Call" })).toHaveAttribute(
    "href",
    "tel:+1 503 555 0101",
  );
  await expect(page.getByRole("link", { name: "Website" })).toHaveAttribute(
    "href",
    "https://example.com/trail-house",
  );
  await expect(
    page.getByRole("link", { name: "OpenStreetMap" }),
  ).toHaveAttribute("href", "https://www.openstreetmap.org/node/101");
});

test("keeps attribution circular closed and a rounded box open", async ({
  page,
}) => {
  const attribution = page.locator(".maplibregl-ctrl-attrib");
  const closed = await attribution.boundingBox();
  expect(closed?.width).toBe(32);
  expect(closed?.height).toBe(32);
  await attribution.locator(".maplibregl-ctrl-attrib-button").click();
  await expect(attribution).toHaveAttribute("open", "");
  const open = await attribution.boundingBox();
  expect(open!.width).toBeGreaterThan(open!.height);
  expect(
    await attribution.evaluate((node) => getComputedStyle(node).borderRadius),
  ).toBe("13px");
});

test("switches every planner family and inserts or reorders route stops", async ({
  page,
  isMobile,
}) => {
  test.skip(Boolean(isMobile), "desktop reordering contract");
  const modeSwitchBox = await page.locator(".mode-switch").boundingBox();
  expect(modeSwitchBox).not.toBeNull();
  for (const label of [
    "Hike",
    "Walk",
    "Run",
    "Bike",
    "Car",
    "Transit",
    "Train",
  ]) {
    const buttonBox = await page
      .getByRole("button", { name: label })
      .boundingBox();
    expect(buttonBox).not.toBeNull();
    expect(buttonBox!.x).toBeGreaterThanOrEqual(modeSwitchBox!.x);
    expect(buttonBox!.x + buttonBox!.width).toBeLessThanOrEqual(
      modeSwitchBox!.x + modeSwitchBox!.width + 1,
    );
  }
  await page.getByRole("button", { name: "Car" }).click();
  await expect(page.getByRole("heading", { name: "Drive plan" })).toBeVisible();
  await expect(page.getByText("Road overview")).toBeVisible();

  await page.getByRole("button", { name: "Transit" }).click();
  await expect(
    page.getByRole("heading", { name: "Transit plan" }),
  ).toBeVisible();
  await expect(page.getByText("Transit network route")).toBeVisible();

  await page.getByRole("button", { name: "Train" }).click();
  await expect(page.getByRole("heading", { name: "Train plan" })).toBeVisible();
  await expect(page.getByText("Rail connection preview")).toBeVisible();

  await page.getByRole("button", { name: /Add stop between/ }).click();
  await expect(page.locator(".stop-row")).toHaveCount(3);
  const insertedStop = page.getByLabel("Stop 2");
  await expect(insertedStop).toHaveAttribute("placeholder", "Search stop");
  await expect(insertedStop).toBeFocused();
  await insertedStop.fill("Forest Park");
  const inlineSuggestions = page.getByRole("listbox", {
    name: "Stop search suggestions",
  });
  await expect(inlineSuggestions).toContainText("Forest Park");
  await inlineSuggestions.getByRole("option").click();
  await expect(insertedStop).toHaveValue("Forest Park");
  await expect(page.locator(".stop-row .stop-index")).toHaveText([
    "A",
    "1",
    "B",
  ]);

  const source = page.locator(".stop-row").first();
  const target = page.locator(".stop-row").last();
  const sourceBox = await source.boundingBox();
  const targetBox = await target.boundingBox();
  expect(sourceBox).not.toBeNull();
  expect(targetBox).not.toBeNull();
  await page.mouse.move(
    sourceBox!.x + 49,
    sourceBox!.y + sourceBox!.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(
    targetBox!.x + 49,
    targetBox!.y + targetBox!.height / 2,
    {
      steps: 6,
    },
  );
  const ghostBox = await page.locator(".stop-drag-ghost").boundingBox();
  expect(ghostBox).not.toBeNull();
  expect(
    Math.abs(
      ghostBox!.y +
        ghostBox!.height / 2 -
        (targetBox!.y + targetBox!.height / 2),
    ),
  ).toBeLessThan(4);
  await page.mouse.up();
  await expect(page.locator(".stop-row input").first()).toHaveValue(
    "Forest Park",
  );
  await expect(page.locator(".stop-drag-ghost")).toHaveCount(0);
  await expect(page.locator(".stop-row .stop-index")).toHaveText([
    "A",
    "1",
    "B",
  ]);
});

test("keeps every travel mode directly selectable on mobile", async ({
  page,
  isMobile,
}) => {
  test.skip(!isMobile, "mobile mode-picker contract");
  await expect(page.locator(".map-canvas")).toHaveAttribute(
    "data-route-padding",
    /.+/,
  );
  const mobileBottomPadding = Number(
    (
      await page.locator(".map-canvas").getAttribute("data-route-padding")
    )?.split(",")[2],
  );
  expect(mobileBottomPadding).toBeGreaterThan(
    (page.viewportSize()?.height ?? 800) * 0.45,
  );
  for (const [label, heading] of [
    ["Car", "Drive plan"],
    ["Transit", "Transit plan"],
    ["Train", "Train plan"],
  ] as const) {
    const button = page.getByRole("button", { name: label });
    await expect(button).toBeVisible();
    await button.click();
    await expect(page.getByRole("heading", { name: heading })).toBeVisible();
  }
});

test("locks browser zoom without disabling map interaction", async ({
  page,
  isMobile,
}) => {
  const viewport = await page
    .locator('meta[name="viewport"]')
    .getAttribute("content");
  expect(viewport).toContain("maximum-scale=1.0");
  expect(viewport).toContain("user-scalable=no");
  expect(
    await page.evaluate(() => {
      const event = new WheelEvent("wheel", {
        bubbles: true,
        cancelable: true,
        ctrlKey: true,
        deltaY: -100,
      });
      document.dispatchEvent(event);
      return event.defaultPrevented;
    }),
  ).toBe(true);
  if (isMobile) {
    await page.getByRole("button", { name: "Expand route planner" }).click();
    await page.getByRole("button", { name: /Add stop between/ }).click();
    await expect(page.getByLabel("Stop 2")).toHaveCSS("font-size", "16px");
  }
  await expect(page.locator(".maplibregl-canvas")).toBeVisible();
});

test("keeps the camera under a directly placed map waypoint", async ({
  page,
}) => {
  await page
    .getByRole("button", { name: /Move Lower Macleay Trailhead on map/ })
    .click();
  await expect(
    page.getByText("Tap the map to place this stop, or drag its marker."),
  ).toBeVisible();
  const nextRoute = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/route") &&
      response.request().method() === "POST",
  );
  const canvas = page.locator(".maplibregl-canvas");
  const canvasBox = await canvas.boundingBox();
  expect(canvasBox).not.toBeNull();
  const placement = {
    x: Math.min(canvasBox!.width > 760 ? 800 : 300, canvasBox!.width - 30),
    y: Math.min(180, canvasBox!.height - 30),
  };
  await canvas.click({
    position: placement,
  });
  await nextRoute;
  await expect(page.locator(".map-canvas")).toHaveAttribute(
    "data-route-fit",
    "preserved-direct-manipulation",
  );
  await expect(page.locator(".map-canvas")).toHaveAttribute(
    "data-route-connector-count",
    "2",
  );
  const movedMarker = page.locator(".map-stop").first();
  await expect
    .poll(async () => {
      const marker = await movedMarker.boundingBox();
      if (!marker) return Number.POSITIVE_INFINITY;
      return Math.hypot(
        marker.x + marker.width / 2 - (canvasBox!.x + placement.x),
        marker.y + marker.height - (canvasBox!.y + placement.y),
      );
    })
    .toBeLessThan(2);
});

test("pans from a waypoint drag and moves it only after a long press", async ({
  page,
}) => {
  const marker = page.locator(".map-stop").first();
  const map = page.locator(".map-canvas");
  const stop = page.getByLabel("Stop 1");
  await expect(marker).toHaveAttribute(
    "aria-label",
    /Hold and drag Lower Macleay Trailhead/,
  );

  let routeRequests = 0;
  page.on("request", (request) => {
    if (request.url().endsWith("/api/route") && request.method() === "POST") {
      routeRequests += 1;
    }
  });

  const cameraBeforePan = await map.getAttribute("data-camera");
  const firstBox = await marker.boundingBox();
  expect(firstBox).not.toBeNull();
  await page.mouse.move(
    firstBox!.x + firstBox!.width / 2,
    firstBox!.y + firstBox!.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(
    firstBox!.x + firstBox!.width / 2 + 56,
    firstBox!.y + firstBox!.height / 2 + 22,
    { steps: 5 },
  );
  await page.mouse.up();
  await expect
    .poll(() => map.getAttribute("data-camera"))
    .not.toBe(cameraBeforePan);
  await page.waitForTimeout(300);
  expect(routeRequests).toBe(0);
  await expect(stop).toHaveValue("Lower Macleay Trailhead");

  const heldBox = await marker.boundingBox();
  expect(heldBox).not.toBeNull();
  const drag = { x: 62, y: -28 };
  await page.mouse.move(
    heldBox!.x + heldBox!.width / 2,
    heldBox!.y + heldBox!.height / 2,
  );
  await page.mouse.down();
  await page.waitForTimeout(600);
  await expect(marker).toHaveClass(/is-dragging/);
  const nextRoute = page.waitForResponse(
    (response) =>
      response.url().endsWith("/api/route") &&
      response.request().method() === "POST",
  );
  await page.mouse.move(
    heldBox!.x + heldBox!.width / 2 + drag.x,
    heldBox!.y + heldBox!.height / 2 + drag.y,
    { steps: 4 },
  );
  await expect(map).toHaveAttribute(
    "data-waypoint-drag-pixel-error",
    /^(0|1)(\.\d+)?$/,
  );
  await page.mouse.up();
  await nextRoute;
  await expect(stop).toHaveValue("Lower Macleay Trailhead (moved)");
  expect(routeRequests).toBe(1);
  await expect(map).toHaveAttribute(
    "data-route-fit",
    "preserved-direct-manipulation",
  );
});

test("opens map-hold actions and routes inspected places through the sheet", async ({
  page,
}) => {
  const canvas = page.locator(".maplibregl-canvas");
  const box = await canvas.boundingBox();
  expect(box).not.toBeNull();
  const point = {
    x: Math.min(box!.width > 760 ? 800 : 280, box!.width - 40),
    y: Math.min(170, box!.height - 40),
  };
  await page.mouse.move(box!.x + point.x, box!.y + point.y);
  const inspectRequest = page.waitForRequest("**/api/inspect?**");
  await page.mouse.down();
  await page.waitForTimeout(600);
  await page.mouse.up();

  await expect(
    page.getByRole("button", { name: "Add map point to route" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Inspect map point" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Navigate to map point" }),
  ).toBeVisible();
  await expect(page.locator(".map-canvas")).toHaveAttribute(
    "data-held-point-pixel-error",
    /^(0|1)(\.\d+)?$/,
  );
  await expect(page.locator(".map-canvas")).toHaveAttribute(
    "data-held-focus-error",
    /^(0|1)(\.\d+)?$/,
  );
  const [targetX, targetY] = (
    (await page
      .locator(".map-canvas")
      .getAttribute("data-held-focus-target")) ?? "0,0"
  )
    .split(",")
    .map(Number);
  const selectedPoint = page.getByRole("button", {
    name: "Dismiss selected map point",
  });
  const selectedPointBox = await selectedPoint.boundingBox();
  expect(selectedPointBox).not.toBeNull();
  expect(
    Math.hypot(
      selectedPointBox!.x + selectedPointBox!.width / 2 - targetX!,
      selectedPointBox!.y + selectedPointBox!.height / 2 - targetY!,
    ),
  ).toBeLessThan(2);
  await expect(page.locator(".map-canvas")).toHaveAttribute(
    "data-selected-building",
    "highlighted",
  );
  await expect(page.locator(".map-canvas")).toHaveAttribute(
    "data-selected-building-rendering",
    "extruded",
  );
  await expect(page.locator(".map-canvas")).toHaveAttribute(
    "data-selected-building-parts",
    "1",
  );
  await expect(page.locator(".map-canvas")).toHaveAttribute(
    "data-selected-building-name",
    "Trail House Cafe",
  );
  const inspectedUrl = new URL((await inspectRequest).url());
  const [lookupLon, lookupLat] = (
    (await page
      .locator(".map-canvas")
      .getAttribute("data-selected-building-lookup")) ?? ""
  )
    .split(",")
    .map(Number);
  expect(Number(inspectedUrl.searchParams.get("lat"))).toBeCloseTo(
    lookupLat!,
    7,
  );
  expect(Number(inspectedUrl.searchParams.get("lon"))).toBeCloseTo(
    lookupLon!,
    7,
  );

  const details = page.getByLabel("Selected place details");
  await expect(details.getByText("Trail House Cafe")).toBeVisible();
  await expect(details.getByText("12 Forest Road Portland")).toBeVisible();
  await expect(
    details.getByRole("link", { name: "Call selected place" }),
  ).toBeVisible();
  await details
    .getByRole("button", { name: "Add to route", exact: true })
    .click();
  await expect(page.locator(".stop-row")).toHaveCount(3);

  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Navigate to map point" }).click();
  await expect(page.locator(".stop-row")).toHaveCount(2);
  await expect(page.getByLabel("Stop 2")).toHaveValue("Trail House Cafe");
});

test("keeps the mobile route sheet and move controls usable", async ({
  page,
  isMobile,
}) => {
  test.skip(!isMobile, "mobile interaction contract");
  const handle = page.getByRole("button", { name: "Expand route planner" });
  const handleBox = await handle.boundingBox();
  expect(handleBox).not.toBeNull();
  await page.mouse.move(
    handleBox!.x + handleBox!.width / 2,
    handleBox!.y + handleBox!.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(handleBox!.x + handleBox!.width / 2, 110, { steps: 8 });
  await page.mouse.up();
  await expect(
    page.getByRole("button", { name: "Collapse route planner" }),
  ).toBeVisible();
  await expect(page.getByText("Stops", { exact: true })).toBeVisible();
  await page
    .getByRole("button", { name: /Move Lower Macleay Trailhead on map/ })
    .click();
  await expect(
    page.getByText("Tap the map to place this stop, or drag its marker."),
  ).toBeVisible();
});

test("snaps the mobile action sheet to minimized, half, and expanded modes", async ({
  page,
  isMobile,
}) => {
  test.skip(!isMobile, "mobile sheet contract");
  const panel = page.getByRole("complementary", { name: "Route planner" });
  await expect(panel).toHaveAttribute("data-sheet-mode", "half");
  for (let index = 1; index <= 4; index += 1) {
    await page
      .getByRole("button", { name: /Add stop between/ })
      .first()
      .click();
    const inserted = page.getByRole("textbox", { name: "Stop 2", exact: true });
    await inserted.fill(`Waypoint ${index}`);
    await inserted.press("Escape");
  }
  await expect(page.locator(".stop-row")).toHaveCount(6);
  await expect(page.getByText("Routing", { exact: true })).toBeVisible();
  await expect(page.getByText("Live", { exact: true })).toBeVisible();
  await page.getByRole("slider", { name: "Replay progress" }).fill("0.8");
  const expand = page.getByRole("button", { name: "Expand route planner" });
  await expand.click();
  await expect(panel).toHaveAttribute("data-sheet-mode", "expanded");
  await page.getByRole("button", { name: "Collapse route planner" }).click();
  await expect(panel).toHaveAttribute("data-sheet-mode", "half");
  const viewport = page.viewportSize();
  await expect
    .poll(async () => (await panel.boundingBox())?.height ?? 0)
    .toBeGreaterThan((viewport?.height ?? 800) * 0.46);
  await expect
    .poll(async () => (await panel.boundingBox())?.height ?? 0)
    .toBeLessThan((viewport?.height ?? 800) * 0.54);

  const handle = page.getByRole("button", { name: "Expand route planner" });
  const handleBox = await handle.boundingBox();
  expect(handleBox).not.toBeNull();
  await page.mouse.move(
    handleBox!.x + handleBox!.width / 2,
    handleBox!.y + handleBox!.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(
    handleBox!.x + handleBox!.width / 2,
    (viewport?.height ?? 800) - 10,
    {
      steps: 8,
    },
  );
  await page.mouse.up();
  await expect(panel).toHaveAttribute("data-sheet-mode", "minimized");
  const metrics = page.locator(".minimized-metrics");
  await expect(metrics.getByText("Distance", { exact: true })).toBeVisible();
  await expect(metrics.getByText("Time", { exact: true })).toBeVisible();
  await expect(metrics.getByText("Gain", { exact: true })).toBeVisible();
  await expect(metrics.getByText("Loss", { exact: true })).toBeVisible();
  await expect(metrics.getByText("High", { exact: true })).toBeVisible();
  const rail = page.getByLabel(/Route replay progress/);
  await expect(rail).toBeVisible();
  await expect(rail.locator(".minimized-waypoint")).toHaveCount(6);
  await expect(rail.getByText("Waypoint 4")).toBeVisible();
  expect(
    await rail.evaluate((element) => element.scrollWidth > element.clientWidth),
  ).toBe(true);
  await expect
    .poll(() => rail.evaluate((element) => element.scrollLeft))
    .toBeGreaterThan(0);
  await expect(rail).toHaveCSS("touch-action", "pan-x");
  expect(
    await rail.evaluate((element) => getComputedStyle(element).maskImage),
  ).not.toBe("none");

  const canvas = page.locator(".maplibregl-canvas");
  const canvasBox = await canvas.boundingBox();
  expect(canvasBox).not.toBeNull();
  const heldAt = {
    x: canvasBox!.x + canvasBox!.width * 0.38,
    y: canvasBox!.y + 180,
  };
  await page.mouse.move(heldAt.x, heldAt.y);
  await page.mouse.down();
  await page.waitForTimeout(600);
  await page.mouse.up();
  await expect(panel).toHaveAttribute("data-sheet-mode", "minimized");
  await expect(page.locator(".map-canvas")).toHaveAttribute(
    "data-held-focus-error",
    /^(0|1)(\.\d+)?$/,
  );
  const minimizedTarget = (
    (await page
      .locator(".map-canvas")
      .getAttribute("data-held-focus-target")) ?? "0,0"
  )
    .split(",")
    .map(Number);
  expect(minimizedTarget[1]).toBeGreaterThan(
    (page.viewportSize()?.height ?? 800) / 2 - 50,
  );
  expect(minimizedTarget[1]).toBeLessThan(
    (page.viewportSize()?.height ?? 800) / 2,
  );
});
