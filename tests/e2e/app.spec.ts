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
  await page.route("**/map/style.json", async (route) => {
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
        },
        layers: [
          {
            id: "background",
            type: "background",
            paint: { "background-color": "#263027" },
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
}

test.beforeEach(async ({ page }) => {
  await stubApplicationApis(page);
  await page.goto("/");
  await expect(
    await page.request.get("/assets/maplibre-gl-worker.mjs"),
  ).toBeOK();
  await expect(
    await page.request.get("/assets/maplibre-gl-shared.mjs"),
  ).toBeOK();
  await expect(page.getByRole("heading", { name: "Trail plan" })).toBeVisible();
  await expect(page.getByText("3.14 km")).toBeVisible();
});

test("plans, searches, layers, and replays a hike", async ({ page }) => {
  await page.getByRole("button", { name: "Map layers" }).click();
  await page.getByRole("button", { name: /Satellite/ }).click();
  await expect(page.getByText(/Esri World Imagery/)).toBeVisible();

  const search = page.getByLabel("Search trailheads, parks, and addresses");
  await search.fill("Forest Park");
  await expect(page.getByRole("option")).toContainText("Forest Park");
  await page.getByRole("option").click();
  await expect(page.getByLabel("Stop 2")).toHaveValue("Forest Park");
  await expect(page.getByText("Routing", { exact: true })).toBeVisible();
  await expect(page.getByText("Live", { exact: true })).toBeVisible();

  const progress = page.getByLabel("Replay progress");
  await page.getByRole("button", { name: "Play replay" }).click();
  await expect
    .poll(async () => Number(await progress.inputValue()))
    .toBeGreaterThan(0);
});

test("keeps the mobile route sheet and move controls usable", async ({
  page,
  isMobile,
}) => {
  test.skip(!isMobile, "mobile interaction contract");
  await page.getByRole("button", { name: "Expand route planner" }).click();
  await expect(page.getByText("Stops", { exact: true })).toBeVisible();
  await page
    .getByRole("button", { name: /Move Lower Macleay Trailhead on map/ })
    .click();
  await expect(
    page.getByText("Tap the map to place this stop, or drag its marker."),
  ).toBeVisible();
});
