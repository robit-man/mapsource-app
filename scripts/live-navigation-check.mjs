import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { chromium, expect } from "@playwright/test";

const origin = (
  process.env.DEPLOYMENT_ORIGIN || "https://app.mapsource.io"
).replace(/\/$/, "");
const executablePath = [
  process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE,
  `${homedir()}/.cache/ms-playwright/chromium_headless_shell-1234/chrome-headless-shell-linux64/chrome-headless-shell`,
  `${homedir()}/.cache/ms-playwright/chromium_headless_shell-1228/chrome-headless-shell-linux64/chrome-headless-shell`,
  `${homedir()}/.cache/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-linux64/chrome-headless-shell`,
].find((candidate) => candidate && existsSync(candidate));

expect.configure({ timeout: 20_000 });

function cameraZoom(value) {
  return Number((value ?? "0,0,0").split(",")[2]);
}

async function pinchOpen(page, context, duringGesture) {
  const box = await page.locator(".maplibregl-canvas").boundingBox();
  if (!box) throw new Error("Map canvas has no rendered bounds");
  const centerX = box.x + box.width / 2;
  const centerY = box.y + Math.min(220, box.height * 0.32);
  const session = await context.newCDPSession(page);
  const point = (x, id) => ({
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
  for (let distance = 36; distance <= 104; distance += 12) {
    await session.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [point(centerX - distance, 0), point(centerX + distance, 1)],
    });
    if (distance === 60) await duringGesture?.();
    await page.waitForTimeout(28);
  }
  await session.send("Input.dispatchTouchEvent", {
    type: "touchEnd",
    touchPoints: [],
  });
  await page.waitForTimeout(650);
}

async function panByTouch(page, context) {
  const box = await page.locator(".maplibregl-canvas").boundingBox();
  if (!box) throw new Error("Map canvas has no rendered bounds");
  const startX = box.x + box.width * 0.56;
  const startY = box.y + Math.min(240, box.height * 0.34);
  const session = await context.newCDPSession(page);
  const point = (x, y) => ({
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

const browser = await chromium.launch({
  headless: true,
  ...(executablePath ? { executablePath } : {}),
});

try {
  const context = await browser.newContext({
    baseURL: origin,
    viewport: { width: 412, height: 915 },
    deviceScaleFactor: 2,
    hasTouch: true,
    isMobile: true,
    geolocation: { latitude: 45.53616, longitude: -122.71256, accuracy: 8 },
    permissions: ["geolocation"],
  });
  const page = await context.newPage();
  let routeRequests = 0;
  let latestRoute = null;
  page.on("request", (request) => {
    if (
      request.method() === "POST" &&
      new URL(request.url()).pathname === "/api/route"
    ) {
      routeRequests += 1;
    }
  });
  page.on("response", async (response) => {
    if (response.ok() && new URL(response.url()).pathname === "/api/route") {
      latestRoute = await response.json().catch(() => latestRoute);
    }
  });

  await page.goto("/", { waitUntil: "domcontentloaded" });
  const map = page.locator(".map-canvas");
  await expect(map).toHaveAttribute(
    "data-initial-location",
    /^(cloudflare|db-ip|ip-api)$/,
  );
  const ipSource = await map.getAttribute("data-initial-location");

  const locate = page.getByRole("button", { name: "Find my location" });
  await locate.click();
  await expect(map).toHaveAttribute("data-user-tracking", "active");
  await expect(map).toHaveAttribute("data-camera-following", "active");

  await page.getByRole("button", { name: "Open search" }).click();
  await page
    .getByLabel("Search trailheads, parks, and addresses")
    .fill("Pittock Mansion");
  const destination = page.getByRole("option").first();
  await expect(destination).toBeVisible();
  await destination.click();
  await page.getByRole("button", { name: "Current location" }).click();
  await expect(page.locator(".stop-row")).toHaveCount(2);
  await expect(page.locator(".live-indicator")).toContainText("Live");
  await expect
    .poll(() => routeRequests, { timeout: 20_000 })
    .toBeGreaterThan(0);
  await expect
    .poll(() => latestRoute?.geometry?.coordinates?.length ?? 0)
    .toBeGreaterThan(1);

  const handle = page.getByRole("button", { name: "Expand route planner" });
  const handleBox = await handle.boundingBox();
  if (!handleBox) throw new Error("Route-panel drag handle is not visible");
  await page.mouse.move(
    handleBox.x + handleBox.width / 2,
    handleBox.y + handleBox.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(handleBox.x + handleBox.width / 2, 905, { steps: 8 });
  await page.mouse.up();
  const panel = page.getByRole("complementary", { name: "Route planner" });
  await expect(panel).toHaveAttribute("data-sheet-mode", "minimized");

  await page.getByRole("button", { name: "Start route" }).click();
  await expect(map).toHaveAttribute("data-navigation", "active");
  await expect(panel).toHaveAttribute("data-navigation-status", "navigating");
  await expect(page.locator(".replay-marker")).not.toHaveClass(/is-active/);
  await expect(page.locator(".minimized-next-turn__icon")).toHaveAttribute(
    "data-maneuver-icon",
    /^(straight|turnLeft|turnRight|uTurn|pin)$/,
  );
  const maneuverIcon = await page
    .locator(".minimized-next-turn__icon")
    .getAttribute("data-maneuver-icon");

  const initialCoordinates = latestRoute.geometry.coordinates;
  const progressPoint =
    initialCoordinates[Math.max(1, Math.floor(initialCoordinates.length / 3))];
  await context.setGeolocation({
    latitude: progressPoint[1],
    longitude: progressPoint[0],
    accuracy: 8,
  });
  await expect
    .poll(async () =>
      Number((await panel.getAttribute("data-navigation-progress")) ?? 0),
    )
    .toBeGreaterThan(0.05);
  const observedProgress = Number(
    (await panel.getAttribute("data-navigation-progress")) ?? 0,
  );

  await page.getByRole("button", { name: "Map layers" }).click();
  await page.getByRole("button", { name: /Dark/ }).click();
  await expect(map).toHaveAttribute("data-surface", "dark");
  await expect(map).toHaveAttribute("data-navigation", "active");
  await expect(map).toHaveAttribute("data-camera-following", "active");
  await expect(map).toHaveAttribute("data-style-route-restored", "true");
  await expect(map).not.toHaveClass(/is-switching-surface/);

  const beforePinch = cameraZoom(await map.getAttribute("data-camera"));
  await pinchOpen(page, context, () =>
    context.setGeolocation({
      latitude: 45.5362,
      longitude: -122.71252,
      accuracy: 8,
    }),
  );
  await expect
    .poll(async () => cameraZoom(await map.getAttribute("data-camera")))
    .toBeGreaterThan(beforePinch + 1);
  const afterPinch = cameraZoom(await map.getAttribute("data-camera"));
  await expect(map).toHaveAttribute("data-camera-following", "active");
  const recenter = page.getByRole("button", {
    name: "Recenter on current location",
  });
  await expect(recenter).toBeHidden();
  await context.setGeolocation({
    latitude: progressPoint[1] + 0.00002,
    longitude: progressPoint[0] + 0.00002,
    accuracy: 8,
  });
  await expect
    .poll(async () => cameraZoom(await map.getAttribute("data-camera")))
    .toBeCloseTo(afterPinch, 1);
  await expect(map).toHaveAttribute(
    "data-user-location-smoothed",
    /^-?\d+\.\d{6},-?\d+\.\d{6}$/,
  );
  await expect(page.locator(".smoothed-user-location")).toBeVisible();

  await panByTouch(page, context);
  await expect(map).toHaveAttribute("data-camera-following", "detached");
  await expect(recenter).toBeVisible();

  const requestsBeforeDeviation = routeRequests;
  const departure = initialCoordinates[0];
  await context.setGeolocation({
    latitude: departure[1] + 0.05,
    longitude: departure[0] + 0.05,
    accuracy: 8,
  });
  await expect(panel).toHaveAttribute("data-navigation-status", "off-route");
  await context.setGeolocation({
    latitude: departure[1] + 0.0502,
    longitude: departure[0] + 0.0502,
    accuracy: 8,
  });
  await expect
    .poll(() => routeRequests, { timeout: 20_000 })
    .toBeGreaterThan(requestsBeforeDeviation);
  await expect(map).toHaveAttribute("data-camera-following", "detached");

  await recenter.click();
  await expect(map).toHaveAttribute("data-camera-following", "active");

  process.stdout.write(
    `${JSON.stringify({
      origin,
      ipSource,
      routeRequests,
      observedProgress,
      maneuverIcon,
      surface: await map.getAttribute("data-surface"),
      navigation: await map.getAttribute("data-navigation"),
      cameraFollowing: await map.getAttribute("data-camera-following"),
    })}\n`,
  );
  await context.close();
} finally {
  await browser.close();
}
