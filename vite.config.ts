import { defineConfig } from "vite";
import type { Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const maplibreWorkerAssets: Plugin = {
  name: "maplibre-worker-assets",
  async buildStart() {
    for (const file of ["maplibre-gl-worker.mjs", "maplibre-gl-shared.mjs"]) {
      this.emitFile({
        type: "asset",
        fileName: `assets/${file}`,
        source: await readFile(
          resolve("node_modules/maplibre-gl/dist", file),
          "utf8",
        ),
      });
    }
  },
};

export default defineConfig({
  plugins: [react(), maplibreWorkerAssets],
  server: {
    port: 3210,
    strictPort: true,
    proxy: {
      "/api": "http://127.0.0.1:3220",
      "/map": "http://127.0.0.1:3220",
      "/health": "http://127.0.0.1:3220",
    },
  },
  build: {
    sourcemap: true,
    target: "es2022",
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      output: {
        manualChunks: {
          maplibre: ["maplibre-gl"],
          react: ["react", "react-dom"],
        },
      },
    },
  },
});
