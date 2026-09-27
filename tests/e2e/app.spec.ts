import { expect, test, type BrowserContext, type Page } from "@playwright/test";

const routeRequestsByPage = new WeakMap<Page, number>();
const routeBodiesByPage = new WeakMap<Page, Array<Record<string, unknown>>>();

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
      instruction: "Turn left toward the overlook.",
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
  routeRequestsByPage.set(page, 0);
  routeBodiesByPage.set(page, []);
  await page.route("**/api/route", async (route) => {
    routeRequestsByPage.set(page, (routeRequestsByPage.get(page) ?? 0) + 1);
    routeBodiesByPage.get(page)?.push(route.request().postDataJSON());
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify(routeResponse),
    });
  });
  await page.route("**/api/location", async (route) => {
    await route.fulfill({ status: 503, contentType: "application/json" });
  });
  await page.route("**/api/search?**", async (route) => {
    const query = new URL(route.request().url()).searchParams
      .get("q")
      ?.toLowerCase();
    const result = query?.includes("pittock")
      ? {
          id: "pittock",
          kind: "landmark",
          name: "Pittock Mansion overlook",
          displayName: "Pittock Mansion, Portland, Oregon",
          coordinate: { lat: 45.52521, lon: -122.71627 },
        }
      : query?.includes("lower macleay")
        ? {
            id: "lower-macleay",
            kind: "landmark",
            name: "Lower Macleay Trailhead",
            displayName: "Lower Macleay Trailhead, Portland, Oregon",
            coordinate: { lat: 45.53616, lon: -122.71256 },
          }
        : {
            id: "forest-park",
            kind: "landmark",
            name: "Forest Park",
            displayName: "Forest Park, Portland, Oregon",
            coordinate: { lat: 45.5723, lon: -122.741 },
          };
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        schema: "mapsource-lookup.v1",
        results: [result],
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
            minzoom: 15,
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

async function selectEmptyStop(
  page: Page,
  role: "origin" | "destination",
  query: string,
  resultName: string,
) {
  await page
    .locator(`.empty-stop-row[data-route-role="${role}"]`)
    .getByRole("button", { name: "Select on map or search" })
    .click();
  const search = page.getByLabel("Search trailheads, parks, and addresses");
  await search.fill(query);
  const result = page.getByRole("option").filter({ hasText: resultName });
  await expect(result).toBeVisible();
  await result.click();
}

async function seedRoute(page: Page) {
  await selectEmptyStop(
    page,
    "destination",
    "Pittock Mansion",
    "Pittock Mansion overlook",
  );
  await selectEmptyStop(
    page,
    "origin",
    "Lower Macleay",
    "Lower Macleay Trailhead",
  );
  await expect(page.getByLabel("Stop 1")).toHaveValue(
    "Lower Macleay Trailhead",
  );
  await expect(page.getByLabel("Stop 2")).toHaveValue(
    "Pittock Mansion overlook",
  );
  await expect(
    page.locator(".stat-primary").getByText("3.14 km"),
  ).toBeVisible();
}

async function mapZoom(page: Page) {
  return Number(
    (
      (await page.locator(".map-canvas").getAttribute("data-camera")) ?? "0,0,0"
    ).split(",")[2],
  );
}

async function mapPitch(page: Page) {
  return Number(
    (
      (await page.locator(".map-canvas").getAttribute("data-camera")) ??
      "0,0,0,0,0"
    ).split(",")[4],
  );
}

async function pinchMapOpen(
  page: Page,
  context: BrowserContext,
  duringGesture?: (distance: number) => Promise<void>,
) {
  const canvas = page.locator(".maplibregl-canvas");
  const box = await canvas.boundingBox();
  expect(box).not.toBeNull();
  const centerX = box!.x + box!.width / 2;
  const centerY = box!.y + Math.min(220, box!.height * 0.32);
  const session = await context.newCDPSession(page);
  const point = (x: number, id: number) => ({
    x,
    y: centerY,
    radiusX: 1,
    radiusY: 1,
    force: 1,
    id,
  });
  await session.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [point(centerX - 24, 0), point(centerX + 24, 1)],
  });
  await duringGesture?.(0);
  for (let distance = 36; distance <= 104; distance += 12) {
    await session.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [point(centerX - distance, 0), point(centerX + distance, 1)],
    });
    await duringGesture?.(distance);
    await page.waitForTimeout(28);
  }
  await session.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  });
  await page.waitForTimeout(650);
}

async function panMapByTouch(page: Page, context: BrowserContext) {
  const canvas = page.locator(".maplibregl-canvas");
  const box = await canvas.boundingBox();
  expect(box).not.toBeNull();
  const startX = box!.x + box!.width * 0.55;
  const startY = box!.y + Math.min(240, box!.height * 0.34);
  const session = await context.newCDPSession(page);
  const point = (x: number, y: number) => ({
    x,
    y,
    radiusX: 1,
    radiusY: 1,
    force: 1,
    id: 0,
  });
  await session.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [point(startX, startY)],
  });
  for (let offset = 12; offset <= 72; offset += 12) {
    await session.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [point(startX + offset, startY + offset * 0.3)],
    });
    await page.waitForTimeout(24);
  }
  await session.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  });
  await page.waitForTimeout(420);
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
  await expect(page.getByRole("heading", { name: "Walk" })).toBeVisible();
  await expect(page.locator(".stop-row")).toHaveCount(0);
  await expect(page.getByText("Plan", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Select on map or search" }),
  ).toHaveCount(2);
  await expect(
    page.getByRole("button", { name: "Current location" }),
  ).toBeVisible();
  await expect(page.locator(".brand-mark")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Open search" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Map layers" })).toBeVisible();
  await expect(page.locator(".maplibregl-ctrl-attrib")).not.toHaveClass(
    /maplibregl-compact-show/,
  );
  await expect(page.locator(".maplibregl-ctrl-attrib")).toBeVisible();
});

test("starts without a placeholder route or automatic route request", async ({
  page,
}) => {
  await page.waitForTimeout(350);
  expect(routeRequestsByPage.get(page)).toBe(0);
  await expect(page.locator(".map-stop")).toHaveCount(0);
  await expect(page.locator(".stop-row")).toHaveCount(0);
});

test("uses the minimized route-less sheet for search and nearby discovery", async ({
  page,
  isMobile,
}) => {
  test.skip(!isMobile, "mobile empty-sheet contract");
  const panel = page.getByRole("complementary", { name: "Route planner" });
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
    (page.viewportSize()?.height ?? 800) - 10,
    { steps: 8 },
  );
  await page.mouse.up();

  await expect(panel).toHaveAttribute("data-sheet-mode", "minimized");
  const explore = page.getByLabel("Explore this area");
  await expect(explore.getByText("Explore this area")).toBeVisible();
  await expect(
    explore.getByRole("button", { name: "Where to?" }),
  ).toBeVisible();
  await expect(
    page.getByLabel("Nearby categories").getByRole("button"),
  ).toHaveCount(4);
  const outdoorsRequest = page.waitForRequest(
    (request) =>
      request.url().includes("/api/discover?") &&
      request.url().includes("category=park"),
  );
  const outdoors = page.getByRole("button", {
    name: "Explore outdoors nearby",
  });
  await outdoors.click();
  await outdoorsRequest;
  await expect(outdoors).toHaveAttribute("aria-pressed", "true");
  await explore.getByRole("button", { name: "Where to?" }).click();
  await expect(
    page.getByLabel("Search trailheads, parks, and addresses"),
  ).toBeEnabled();
  await expect(
    page.locator('.empty-stop-row[data-route-role="destination"]'),
  ).toHaveClass(/is-selecting/);
});

test("restores route inputs and app presentation after refresh", async ({
  page,
  isMobile,
}) => {
  test.skip(!isMobile, "mobile persistence contract");
  await seedRoute(page);
  await page.getByRole("button", { name: "Bike" }).click();
  await expect(page.getByText("Routing", { exact: true })).toBeVisible();
  await expect(page.getByText("Live", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Map layers" }).click();
  await page.getByRole("button", { name: /Dark/ }).click();
  await page.waitForTimeout(900);
  await page.locator(".maplibregl-ctrl-zoom-in").click();
  await page.waitForTimeout(420);
  const savedZoom = await mapZoom(page);
  await page.getByRole("button", { name: "Expand route planner" }).click();

  await expect
    .poll(() =>
      page.evaluate(() => {
        const raw = localStorage.getItem("mapsource.app-state.v1");
        if (!raw) return null;
        const state = JSON.parse(raw) as {
          waypoints?: unknown[];
          mode?: string;
          surface?: string;
          sheetMode?: string;
          camera?: { zoom?: number };
        };
        return {
          waypoints: state.waypoints?.length,
          mode: state.mode,
          surface: state.surface,
          sheetMode: state.sheetMode,
          zoom: state.camera?.zoom,
        };
      }),
    )
    .toMatchObject({
      waypoints: 2,
      mode: "bike",
      surface: "dark",
      sheetMode: "expanded",
    });
  const requestsBeforeRefresh = routeRequestsByPage.get(page) ?? 0;

  await page.reload();

  await expect(page.getByLabel("Stop 1")).toHaveValue(
    "Lower Macleay Trailhead",
  );
  await expect(page.getByLabel("Stop 2")).toHaveValue(
    "Pittock Mansion overlook",
  );
  await expect(page.getByRole("button", { name: "Bike" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(page.locator(".map-canvas")).toHaveAttribute(
    "data-surface",
    "dark",
  );
  await expect(page.locator(".map-canvas")).toHaveAttribute(
    "data-restored-camera",
    "true",
  );
  await expect(
    page.getByRole("complementary", { name: "Route planner" }),
  ).toHaveAttribute("data-sheet-mode", "expanded");
  await expect(page.getByLabel("Route replay")).toHaveCount(0);
  await expect(
    page.locator(".stat-primary").getByText("3.14 km"),
  ).toBeVisible();
  await expect
    .poll(() => routeRequestsByPage.get(page) ?? 0)
    .toBeGreaterThan(requestsBeforeRefresh);
  await expect.poll(() => mapZoom(page)).toBeCloseTo(savedZoom, 1);
});

test("centers the untouched map from the shared IP location resolver", async ({
  page,
}) => {
  await page.unroute("**/api/location");
  await page.route("**/api/location", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        latitude: 52.52,
        longitude: 13.405,
        label: "Berlin, DE",
        source: "cloudflare",
      }),
    });
  });
  await page.reload();
  await expect(page.locator(".map-canvas")).toHaveAttribute(
    "data-initial-location",
    "cloudflare",
  );
  await expect
    .poll(async () => {
      const camera =
        (await page.locator(".map-canvas").getAttribute("data-camera")) ?? "";
      const [longitude, latitude] = camera.split(",").map(Number);
      return Math.hypot(longitude - 13.405, latitude - 52.52);
    })
    .toBeLessThan(0.01);
});

test("keeps the search spinner circular and evenly inset", async ({ page }) => {
  await page.route("**/api/search?**", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 700));
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ results: [] }),
    });
  });
  await page.getByRole("button", { name: "Open search" }).click();
  await page
    .getByLabel("Search trailheads, parks, and addresses")
    .fill("coffee");
  const spinner = page.getByLabel("Searching");
  await expect(spinner).toBeVisible();
  await expect
    .poll(
      async () =>
        (await page.locator(".search-shell").boundingBox())?.width ?? 0,
    )
    .toBeGreaterThan(300);
  const geometry = await page.evaluate(() => {
    const spinner = document.querySelector(".search-spinner--bar");
    const bar = document.querySelector(".search-bar");
    if (!(spinner instanceof HTMLElement) || !(bar instanceof HTMLElement)) {
      return null;
    }
    const spinnerBox = spinner.getBoundingClientRect();
    const barBox = bar.getBoundingClientRect();
    return {
      width: spinnerBox.width,
      height: spinnerBox.height,
      top: spinnerBox.top - barBox.top,
      bottom: barBox.bottom - spinnerBox.bottom,
      right: barBox.right - spinnerBox.right,
    };
  });
  expect(geometry).not.toBeNull();
  expect(Math.abs(geometry!.width - geometry!.height)).toBeLessThan(0.5);
  const { top, bottom, right } = geometry!;
  expect(Math.abs(top - bottom)).toBeLessThan(0.5);
  expect(Math.abs(top - right)).toBeLessThan(1);
});

test("requests orientation with location and follows an absolute heading", async ({
  page,
  context,
  isMobile,
}) => {
  // Mobile software WebGL plus the full sensor-fusion sequence regularly takes
  // longer than the ordinary CI case; keep every assertion and widen only this
  // end-to-end journey's timeout.
  test.slow();
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
  if (isMobile) {
    await expect(page.locator(".map-canvas")).toHaveAttribute(
      "data-user-focus-error",
      /^(0|1)(\.\d+)?$/,
    );
    const targetY = Number(
      (
        (await page
          .locator(".map-canvas")
          .getAttribute("data-user-focus-target")) ?? "0,0"
      ).split(",")[1],
    );
    const panelBox = await page
      .getByRole("complementary", { name: "Route planner" })
      .boundingBox();
    expect(panelBox).not.toBeNull();
    expect(targetY).toBeCloseTo(
      ((page.viewportSize()?.height ?? 800) - panelBox!.height) / 2,
      0,
    );

    const zoomBefore = await mapZoom(page);
    const zoomOut = page.locator(".maplibregl-ctrl-zoom-out");
    for (let index = 0; index < 3; index += 1) {
      await zoomOut.click();
      await page.waitForTimeout(340);
    }
    await expect.poll(() => mapZoom(page)).toBeLessThan(zoomBefore - 2.5);
    await expect(page.locator(".map-canvas")).toHaveAttribute(
      "data-user-tracking",
      "active",
    );
    await expect(page.locator(".map-canvas")).toHaveAttribute(
      "data-camera-following",
      "active",
    );
    await expect(page.locator(".map-canvas")).toHaveAttribute(
      "data-camera-bearing-source",
      "device",
    );
    await expect(
      page.getByRole("button", { name: "Recenter on current location" }),
    ).toBeHidden();

    const beforePinch = await mapZoom(page);
    await pinchMapOpen(page, context, async (distance) => {
      await page.evaluate(() => {
        const orientation = new Event("deviceorientationabsolute");
        Object.defineProperties(orientation, {
          absolute: { value: true },
          alpha: { value: 270 },
        });
        window.dispatchEvent(orientation);
      });
      if (distance === 60) {
        await context.setGeolocation({
          latitude: 45.53104,
          longitude: -122.71596,
          accuracy: 8,
        });
      }
    });
    await expect.poll(() => mapZoom(page)).toBeGreaterThan(beforePinch + 1);
    await expect(page.locator(".map-canvas")).toHaveAttribute(
      "data-follow-return-duration",
      "520",
    );
    await expect(page.locator(".map-canvas")).toHaveAttribute(
      "data-follow-camera-transition",
      "idle",
    );
    const afterPinch = await mapZoom(page);
    await page.evaluate(() => {
      const orientation = new Event("deviceorientationabsolute");
      Object.defineProperties(orientation, {
        absolute: { value: true },
        alpha: { value: 270 },
      });
      window.dispatchEvent(orientation);
    });
    await page.waitForTimeout(260);
    await expect.poll(() => mapZoom(page)).toBeCloseTo(afterPinch, 1);
    const compass = page.locator(".maplibregl-ctrl-compass");
    await compass.click();
    await expect(page.locator(".map-canvas")).toHaveAttribute(
      "data-follow-perspective",
      "top-down",
    );
    await expect.poll(() => mapPitch(page)).toBeLessThan(1);
    await page.evaluate(() => {
      const orientation = new Event("deviceorientationabsolute");
      Object.defineProperties(orientation, {
        absolute: { value: true },
        alpha: { value: 270 },
      });
      window.dispatchEvent(orientation);
    });
    await page.waitForTimeout(160);
    expect(await mapPitch(page)).toBeLessThan(1);
    await compass.click();
    await expect(page.locator(".map-canvas")).toHaveAttribute(
      "data-follow-perspective",
      "angled",
    );
    await expect.poll(() => mapPitch(page)).toBeGreaterThan(40);
    await compass.dispatchEvent("pointerdown", {
      pointerId: 71,
      clientX: 20,
      clientY: 20,
    });
    await page.waitForTimeout(560);
    await page.evaluate(() => {
      window.dispatchEvent(
        new PointerEvent("pointerup", { pointerId: 71, bubbles: true }),
      );
    });
    await compass.dispatchEvent("click");
    await expect(page.locator(".map-canvas")).toHaveAttribute(
      "data-compass-raw-visible",
      "true",
    );
    await expect(compass.locator(".map-compass-raw")).toHaveText("270°");
    await expect(page.locator(".map-canvas")).toHaveAttribute(
      "data-follow-perspective",
      "angled",
    );
    await compass.dispatchEvent("pointerdown", {
      pointerId: 72,
      clientX: 20,
      clientY: 20,
    });
    await page.waitForTimeout(560);
    await page.evaluate(() => {
      window.dispatchEvent(
        new PointerEvent("pointerup", { pointerId: 72, bubbles: true }),
      );
    });
    await compass.dispatchEvent("click");
    await expect(page.locator(".map-canvas")).toHaveAttribute(
      "data-compass-raw-visible",
      "false",
    );
    await context.setGeolocation({
      latitude: 45.5362,
      longitude: -122.7125,
      accuracy: 8,
    });
    await page.waitForTimeout(420);
    await context.setGeolocation({
      latitude: 45.53624,
      longitude: -122.71246,
      accuracy: 10,
    });
    await expect(page.locator(".map-canvas")).toHaveAttribute(
      "data-user-location-samples",
      "2",
    );
    const rawLocation = await page
      .locator(".map-canvas")
      .getAttribute("data-user-location-raw");
    const smoothedLocation = await page
      .locator(".map-canvas")
      .getAttribute("data-user-location-smoothed");
    expect(smoothedLocation).not.toBe(rawLocation);
    await expect(page.locator(".smoothed-user-location")).toBeVisible();
    await expect.poll(() => mapZoom(page)).toBeCloseTo(afterPinch, 1);
    await expect(page.locator(".map-canvas")).toHaveAttribute(
      "data-camera-following",
      "active",
    );
    await panMapByTouch(page, context);
    await expect(page.locator(".map-canvas")).toHaveAttribute(
      "data-camera-following",
      "detached",
    );
    await page
      .getByRole("button", { name: "Recenter on current location" })
      .click();
    await expect(page.locator(".map-canvas")).toHaveAttribute(
      "data-camera-following",
      "active",
    );
    await expect(page.locator(".map-canvas")).toHaveAttribute(
      "data-user-focus-error",
      /^(0|1)(\.\d+)?$/,
    );
    await page.getByRole("button", { name: "Map layers" }).click();
    await page.getByRole("button", { name: /Dark/ }).click();
    await expect(page.locator(".map-canvas")).toHaveAttribute(
      "data-surface",
      "dark",
    );
    await expect(page.locator(".map-canvas")).toHaveAttribute(
      "data-camera-following",
      "active",
    );
    await expect(
      page.getByRole("button", { name: "Recenter on current location" }),
    ).toBeHidden();
    await expect(page.locator(".map-canvas")).not.toHaveClass(
      /is-switching-surface/,
    );
    await expect(page.locator(".smoothed-user-location")).toBeVisible();
  }
  const headingBeforeLowConfidence = Number(
    await locate.getAttribute("data-heading"),
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
  await expect(locate).toHaveAttribute("data-orientation", "low-confidence");
  await expect(
    page.getByRole("status").filter({ hasText: "rotate and tilt your phone" }),
  ).toBeVisible();
  const lowConfidenceHeading = Number(
    await locate.getAttribute("data-heading"),
  );
  expect(lowConfidenceHeading).toBeGreaterThan(headingBeforeLowConfidence + 5);
  expect(
    Number(await locate.getAttribute("data-compass-confidence")),
  ).toBeLessThan(0.2);
  await page.evaluate(async () => {
    for (let sample = 0; sample < 24; sample += 1) {
      const accurate = new Event("deviceorientationabsolute");
      Object.defineProperties(accurate, {
        absolute: { value: true },
        webkitCompassAccuracy: { value: 5 },
        webkitCompassHeading: { value: 100 },
      });
      window.dispatchEvent(accurate);
      await new Promise<void>((resolve) =>
        window.requestAnimationFrame(() => resolve()),
      );
    }
  });
  await expect(locate).toHaveAttribute("data-orientation", "granted");
  await expect(
    page.getByRole("status").filter({ hasText: "rotate and tilt your phone" }),
  ).toBeHidden();
  const declination = Number(
    await locate.getAttribute("data-compass-declination"),
  );
  expect(declination).toBeGreaterThan(10);
  expect(declination).toBeLessThan(20);
  const trueHeading = (100 + declination) % 360;
  await expect
    .poll(async () => Number(await locate.getAttribute("data-heading")))
    .toBeCloseTo(trueHeading, 1);
  await expect
    .poll(async () =>
      Number(
        await page
          .locator(".map-canvas")
          .getAttribute("data-camera-bearing-actual"),
      ),
    )
    .toBeCloseTo(trueHeading, 0);
  await expect(page.locator(".map-canvas")).toHaveAttribute(
    "data-camera-bearing-source",
    "device",
  );
  expect(
    Math.abs(
      Number(
        await page
          .locator(".map-canvas")
          .getAttribute("data-compass-projection-correction"),
      ),
    ),
  ).toBeLessThan(0.01);
  await page.evaluate(() => {
    const competingAlpha = new Event("deviceorientationabsolute");
    Object.defineProperties(competingAlpha, {
      absolute: { value: true },
      alpha: { value: 180 },
      beta: { value: 35 },
      gamma: { value: 12 },
    });
    window.dispatchEvent(competingAlpha);
  });
  await expect(locate).toHaveAttribute(
    "data-compass-sensor-kind",
    "webkit-compass",
  );
  await expect
    .poll(async () => Number(await locate.getAttribute("data-heading")))
    .toBeCloseTo(trueHeading, 1);
  const [movementLongitude, movementLatitude] = (
    (await page
      .locator(".map-canvas")
      .getAttribute("data-user-location-raw")) ?? "-122.716,45.531"
  )
    .split(",")
    .map(Number);
  for (let sample = 1; sample <= 8; sample += 1) {
    await context.setGeolocation({
      latitude: movementLatitude!,
      longitude: movementLongitude! + sample * 0.00012,
      accuracy: 8,
    });
    await page.waitForTimeout(120);
  }
  await expect
    .poll(async () =>
      Number(await locate.getAttribute("data-compass-movement-correction")),
    )
    .toBeLessThan(-10);
  await expect(page.locator(".map-canvas")).toHaveAttribute(
    "data-camera-bearing-source",
    "fused",
  );
  await expect
    .poll(async () =>
      Number(
        await page
          .locator(".map-canvas")
          .getAttribute("data-camera-course-weight"),
      ),
    )
    .toBeGreaterThan(0.6);
  await page.getByRole("button", { name: "Current location" }).click();
  await expect(page.getByLabel("Stop 1")).toHaveValue("Current location");
  await expect(
    page.getByRole("button", { name: "Select on map or search" }),
  ).toHaveCount(1);
  expect(routeRequestsByPage.get(page)).toBe(0);
});

test("plans, searches, and switches map layers for a walk", async ({
  page,
  isMobile,
}) => {
  await seedRoute(page);
  await page.getByRole("button", { name: "Map layers" }).click();
  await expect(page.getByRole("button", { name: /Elevation/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /Dark/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /Light/ })).toBeVisible();
  await expect(
    page.getByRole("button", { name: /Dark/ }).locator(".layer-preview__image"),
  ).toHaveAttribute("style", /\/map\/tiles\/raster\/dark\/13\/1303\/2929\.png/);
  await expect(
    page
      .getByRole("button", { name: /Light/ })
      .locator(".layer-preview__image"),
  ).toHaveAttribute(
    "style",
    /\/map\/tiles\/raster\/light\/13\/1303\/2929\.png/,
  );
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
  await expect(page.locator(".map-canvas")).toHaveAttribute(
    "data-route-coordinate-count",
    "3",
  );
  await expect(page.locator(".map-canvas")).toHaveAttribute(
    "data-style-route-restored",
    "true",
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
  await expect(page.getByLabel("Route replay")).toHaveCount(0);
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

test("uses an actively tracked location when navigating to a selected place", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["geolocation"], {
    origin: new URL(page.url()).origin,
  });
  await context.setGeolocation({
    latitude: 45.53616,
    longitude: -122.71256,
    accuracy: 8,
  });
  await page.getByRole("button", { name: "Find my location" }).click();
  await expect(page.locator(".map-canvas")).toHaveAttribute(
    "data-user-tracking",
    "active",
  );

  const canvas = page.locator(".maplibregl-canvas");
  const box = await canvas.boundingBox();
  expect(box).not.toBeNull();
  await page.mouse.move(box!.x + box!.width * 0.48, box!.y + 150);
  await page.mouse.down();
  await page.waitForTimeout(600);
  await page.mouse.up();
  const details = page.getByLabel("Selected place details");
  await expect(details).toBeVisible();
  await details.getByRole("button", { name: "Navigate", exact: true }).click();
  await expect(page.locator(".stop-row")).toHaveCount(2);
  await expect(page.getByLabel("Stop 1")).toHaveValue("Current location");
  await expect(page.getByLabel("Stop 2")).toHaveValue("Trail House Cafe");
  await expect(
    page.locator('.empty-stop-row[data-route-role="origin"]'),
  ).toHaveCount(0);
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
  await seedRoute(page);
  const modeSwitchBox = await page.locator(".mode-switch").boundingBox();
  expect(modeSwitchBox).not.toBeNull();
  for (const label of ["Walk", "Bike", "Car", "Bus", "Train"]) {
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
  await expect(page.getByRole("heading", { name: "Car" })).toBeVisible();
  await expect(page.getByText("Road overview")).toBeVisible();

  const busStops = page.waitForRequest((request) =>
    request.url().includes("category=transit_stop"),
  );
  await page.getByRole("button", { name: "Bus" }).click();
  await busStops;
  await expect(page.getByRole("heading", { name: "Bus" })).toBeVisible();
  await expect(page.getByText("Bus-stop network route")).toBeVisible();
  await expect(page.getByText(/mapped OpenStreetMap bus stops/)).toBeVisible();

  const railStations = page.waitForRequest((request) =>
    request.url().includes("category=railway_station"),
  );
  await page.getByRole("button", { name: "Train" }).click();
  await railStations;
  await expect(page.getByRole("heading", { name: "Train" })).toBeVisible();
  await expect(page.getByText("Rail and light-rail connection")).toBeVisible();
  await expect(
    page.getByText(/railway tracks, stations, and light-rail stations/),
  ).toBeVisible();

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
  await seedRoute(page);
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
    ["Walk", "Walk"],
    ["Bike", "Bike"],
    ["Car", "Car"],
    ["Bus", "Bus"],
    ["Train", "Train"],
  ] as const) {
    const button = page.getByRole("button", { name: label });
    await expect(button).toBeVisible();
    const transportRequest =
      label === "Bus" || label === "Train"
        ? page.waitForRequest((request) =>
            request
              .url()
              .includes(
                `category=${label === "Bus" ? "transit_stop" : "railway_station"}`,
              ),
          )
        : null;
    await button.click();
    await transportRequest;
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
    await seedRoute(page);
    await page.getByRole("button", { name: "Expand route planner" }).click();
    await page.getByRole("button", { name: /Add stop between/ }).click();
    await expect(page.getByLabel("Stop 2")).toHaveCSS("font-size", "16px");
  }
  await expect(page.locator(".maplibregl-canvas")).toBeVisible();
});

test("keeps the camera under a directly placed map waypoint", async ({
  page,
}) => {
  await seedRoute(page);
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

test("keeps a selected waypoint pinned at its map tip", async ({ page }) => {
  await seedRoute(page);
  const marker = page.locator(".map-stop").first();
  const markerVisual = marker.locator(".map-stop__visual");
  await page.waitForTimeout(900);
  const before = await markerVisual.boundingBox();
  expect(before).not.toBeNull();

  await page
    .getByRole("button", { name: /Move Lower Macleay Trailhead on map/ })
    .click();
  await expect(marker).toHaveClass(/is-selected/);
  await expect
    .poll(async () => (await markerVisual.boundingBox())?.width ?? 0)
    .toBeGreaterThan(before!.width + 4);

  const selected = await markerVisual.boundingBox();
  expect(selected).not.toBeNull();
  expect(
    Math.hypot(
      selected!.x + selected!.width / 2 - (before!.x + before!.width / 2),
      selected!.y + selected!.height - (before!.y + before!.height),
    ),
  ).toBeLessThan(1);
});

test("pans from a waypoint drag and moves it only after a long press", async ({
  page,
}) => {
  await seedRoute(page);
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
  await seedRoute(page);
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
  await expect(
    details.getByText("12 Forest Road, Portland 97210"),
  ).toBeVisible();
  await expect(details.getByText(/^-?\d+\.\d{5}, -?\d+\.\d{5}$/)).toBeVisible();
  await expect(
    details.getByText("Trail House Cafe", { exact: true }),
  ).toHaveCount(0);
  const pointLabel = page.locator(".intermediate-point__label");
  await expect(pointLabel.getByText("Trail House Cafe")).toBeVisible();
  await expect(
    pointLabel.getByText("12 Forest Road, Portland 97210"),
  ).toBeVisible();
  await expect(
    details.getByRole("link", { name: "Call selected place" }),
  ).toBeVisible();
  await details
    .getByRole("button", { name: "Add to route", exact: true })
    .click();
  await expect(page.locator(".stop-row")).toHaveCount(3);

  page.once("dialog", (dialog) => dialog.accept());
  await details.getByRole("button", { name: "Navigate", exact: true }).click();
  await expect(
    page.getByRole("complementary", { name: "Route planner" }),
  ).toHaveAttribute("data-sheet-mode", "half");
  await expect(page.locator(".stop-row")).toHaveCount(1);
  await expect(page.getByLabel("Stop 1")).toHaveValue("Trail House Cafe");
  await expect(
    page.locator('.empty-stop-row[data-route-role="origin"]'),
  ).toHaveClass(/is-selecting/);
});

test("keeps the mobile route sheet and move controls usable", async ({
  page,
  isMobile,
}) => {
  test.skip(!isMobile, "mobile interaction contract");
  await seedRoute(page);
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
  context,
  isMobile,
}) => {
  // This is intentionally a full mobile journey: sheet snapping, long-route
  // overflow, map hold, GPS navigation, locked pinch zoom, pan detach, and
  // rerouting. A
  // single-worker software-WebGL runner takes longer than the ordinary case.
  test.slow();
  test.skip(!isMobile, "mobile sheet contract");
  await seedRoute(page);
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
  const nextTurn = page.locator(".minimized-next-turn");
  await expect(nextTurn.getByText("Next turn", { exact: true })).toBeVisible();
  await expect(nextTurn).toContainText("Follow Lower Macleay Trail.");
  const rail = page.getByLabel(/Route navigation progress/);
  await expect(rail).toBeVisible();
  await expect(rail.locator(".minimized-waypoint")).toHaveCount(6);
  await expect(rail.getByText("Waypoint 4")).toHaveCount(1);
  expect(
    await rail.evaluate((element) => element.scrollWidth > element.clientWidth),
  ).toBe(true);
  await expect(rail).toHaveCSS("touch-action", "pan-x");
  expect(
    await rail.evaluate((element) => getComputedStyle(element).maskImage),
  ).not.toBe("none");
  const routeActions = page.locator(".minimized-route-actions");
  await expect(
    routeActions.getByRole("button", { name: "Start route" }),
  ).toBeVisible();
  await expect(
    routeActions.getByRole("button", { name: "End route" }),
  ).toBeVisible();
  const nextTurnBox = await nextTurn.boundingBox();
  const railBox = await rail.boundingBox();
  const actionsBox = await routeActions.boundingBox();
  const panelBox = await panel.boundingBox();
  expect(nextTurnBox).not.toBeNull();
  expect(railBox).not.toBeNull();
  expect(actionsBox).not.toBeNull();
  expect(panelBox).not.toBeNull();
  expect(nextTurnBox!.y + nextTurnBox!.height).toBeLessThanOrEqual(railBox!.y);
  expect(railBox!.y + railBox!.height).toBeLessThanOrEqual(actionsBox!.y);
  expect(
    panelBox!.y + panelBox!.height - (actionsBox!.y + actionsBox!.height),
  ).toBeLessThan(20);

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
  await page.getByRole("button", { name: "Inspect map point" }).click();
  await expect(panel).toHaveAttribute("data-sheet-mode", "half");
  await expect(page.getByLabel("Selected place details")).toBeVisible();
  await expect
    .poll(async () => (await panel.boundingBox())?.height ?? 0)
    .toBeGreaterThan(400);
  const revealedHandle = page.getByRole("button", {
    name: "Expand route planner",
  });
  const revealedHandleBox = await revealedHandle.boundingBox();
  expect(revealedHandleBox).not.toBeNull();
  await page.mouse.move(
    revealedHandleBox!.x + revealedHandleBox!.width / 2,
    revealedHandleBox!.y + revealedHandleBox!.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(
    revealedHandleBox!.x + revealedHandleBox!.width / 2,
    (viewport?.height ?? 800) - 10,
    { steps: 8 },
  );
  await page.mouse.up();
  await expect(panel).toHaveAttribute("data-sheet-mode", "minimized");
  await expect
    .poll(async () => (await panel.boundingBox())?.height ?? Infinity)
    .toBeLessThanOrEqual(210);
  await expect(page.getByLabel("Selected place details")).toBeHidden();
  await context.grantPermissions(["geolocation"], {
    origin: new URL(page.url()).origin,
  });
  await context.setGeolocation({
    latitude: 45.53616,
    longitude: -122.71256,
    accuracy: 8,
  });
  const requestsBeforeNavigation = routeRequestsByPage.get(page) ?? 0;
  await routeActions.getByRole("button", { name: "Start route" }).click();
  await expect(page.locator(".map-canvas")).toHaveAttribute(
    "data-navigation",
    "active",
  );
  await expect(page.locator(".map-canvas")).toHaveAttribute(
    "data-user-tracking",
    "active",
  );
  await expect(panel).toHaveAttribute("data-navigation-status", "navigating");
  await expect(
    routeActions.getByRole("button", { name: "Navigating" }),
  ).toBeDisabled();
  await expect(nextTurn.locator(".minimized-next-turn__icon")).toHaveAttribute(
    "data-maneuver-icon",
    "turnLeft",
  );

  const beforePinch = await mapZoom(page);
  await pinchMapOpen(page, context, async (distance) => {
    await page.evaluate(() => {
      const orientation = new Event("deviceorientationabsolute");
      Object.defineProperties(orientation, {
        absolute: { value: true },
        alpha: { value: 270 },
      });
      window.dispatchEvent(orientation);
    });
    if (distance === 60) {
      await context.setGeolocation({
        latitude: 45.5362,
        longitude: -122.71252,
        accuracy: 8,
      });
    }
  });
  await expect.poll(() => mapZoom(page)).toBeGreaterThan(beforePinch + 1);
  await expect(page.locator(".map-canvas")).toHaveAttribute(
    "data-camera-following",
    "active",
  );
  await expect(
    page.getByRole("button", { name: "Recenter on current location" }),
  ).toBeHidden();
  const afterPinch = await mapZoom(page);

  await context.setGeolocation({
    latitude: 45.55,
    longitude: -122.68,
    accuracy: 8,
  });
  await expect(panel).toHaveAttribute("data-navigation-status", "off-route");
  await context.setGeolocation({
    latitude: 45.5502,
    longitude: -122.6802,
    accuracy: 8,
  });
  await expect
    .poll(() => routeRequestsByPage.get(page) ?? 0)
    .toBeGreaterThan(requestsBeforeNavigation);
  await expect.poll(() => mapZoom(page)).toBeCloseTo(afterPinch, 1);
  const reroute = routeBodiesByPage.get(page)?.at(-1) as
    | { waypoints?: Array<{ lat?: number; lon?: number }> }
    | undefined;
  expect(reroute?.waypoints?.[0]?.lat).toBeCloseTo(45.5502, 4);
  await panMapByTouch(page, context);
  await expect(page.locator(".map-canvas")).toHaveAttribute(
    "data-camera-following",
    "detached",
  );
  expect(reroute?.waypoints?.[0]?.lon).toBeCloseTo(-122.6802, 4);
  await expect(page.locator(".map-canvas")).toHaveAttribute(
    "data-camera-following",
    "detached",
  );
  await page
    .getByRole("button", { name: "Recenter on current location" })
    .click();
  await expect(page.locator(".map-canvas")).toHaveAttribute(
    "data-camera-following",
    "active",
  );
  await page.waitForTimeout(700);
  await panMapByTouch(page, context);
  await expect(page.locator(".map-canvas")).toHaveAttribute(
    "data-camera-following",
    "detached",
  );
  await page.getByRole("button", { name: "Find my location" }).click();
  await expect(page.locator(".map-canvas")).toHaveAttribute(
    "data-camera-following",
    "active",
  );
  await routeActions.getByRole("button", { name: "End route" }).click();
  await expect(page.locator(".stop-row")).toHaveCount(0);
  await expect(page.locator(".map-canvas")).toHaveAttribute(
    "data-route-coordinate-count",
    "0",
  );
});
