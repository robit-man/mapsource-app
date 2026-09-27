import { defineConfig, devices } from "@playwright/test";
import { existsSync } from "node:fs";
import { homedir } from "node:os";

const installedChromium = [
  process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE,
  `${homedir()}/.cache/ms-playwright/chromium_headless_shell-1234/chrome-headless-shell-linux64/chrome-headless-shell`,
  `${homedir()}/.cache/ms-playwright/chromium_headless_shell-1228/chrome-headless-shell-linux64/chrome-headless-shell`,
  `${homedir()}/.cache/ms-playwright/chromium_headless_shell-1223/chrome-headless-shell-linux64/chrome-headless-shell`,
].find((candidate): candidate is string =>
  Boolean(candidate && existsSync(candidate)),
);
const e2ePort = Number(process.env.E2E_PORT ?? 3220);
const e2eOrigin = `http://127.0.0.1:${e2ePort}`;

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: process.env.CI ? 90_000 : 45_000,
  expect: { timeout: process.env.CI ? 15_000 : 8_000 },
  fullyParallel: true,
  // Every project creates a WebGL map. Hosted runners expose two cores but
  // throttle software WebGL enough that concurrent maps miss interaction
  // frames. Keep CI serial and retain the faster local stress-test cap.
  workers: process.env.CI ? 1 : 6,
  forbidOnly: true,
  retries: 0,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: e2eOrigin,
    launchOptions: installedChromium
      ? { executablePath: installedChromium }
      : {},
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: {
    command: `PORT=${e2ePort} npm start`,
    url: `${e2eOrigin}/health/live`,
    reuseExistingServer: true,
    timeout: 30_000,
  },
  projects: [
    {
      name: "desktop-chromium",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1440, height: 900 },
      },
    },
    {
      name: "mobile-chromium",
      use: { ...devices["Pixel 7"] },
    },
  ],
});
