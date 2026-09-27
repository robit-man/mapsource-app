import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.{ts,tsx}"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json-summary"],
      include: ["src/route-utils.ts"],
      thresholds: {
        statements: 85,
        functions: 100,
        lines: 100,
      },
    },
  },
});
