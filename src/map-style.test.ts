import { describe, expect, it } from "vitest";
import { addHouseNumberLayers, type MutableMapStyle } from "./map-style";

describe("house-number map layers", () => {
  it("adds collision-aware and exhaustive close-range labels", () => {
    const style: MutableMapStyle = {
      sources: {
        terrain: { type: "raster-dem" },
        basemap: { type: "vector" },
      },
      layers: [{ id: "labels.poi", type: "symbol" }],
    };

    expect(addHouseNumberLayers(style, "dark")).toBe(true);
    const normal = style.layers?.find(
      (layer) => layer.id === "mapsource.house-numbers",
    );
    const close = style.layers?.find(
      (layer) => layer.id === "mapsource.house-numbers-close",
    );
    expect(normal).toMatchObject({
      source: "basemap",
      "source-layer": "housenumber",
      minzoom: 16,
      maxzoom: 17.5,
      layout: { "text-allow-overlap": false },
    });
    expect(close).toMatchObject({
      source: "basemap",
      "source-layer": "housenumber",
      minzoom: 17.5,
      layout: {
        "text-allow-overlap": true,
        "text-ignore-placement": true,
      },
    });
    expect(style.layers?.at(-1)?.id).toBe("mapsource.house-numbers-close");
  });

  it("is idempotent and fails closed without a vector source", () => {
    const style: MutableMapStyle = {
      sources: { basemap: { type: "vector" } },
      layers: [],
    };
    addHouseNumberLayers(style, "light");
    addHouseNumberLayers(style, "light");
    expect(
      style.layers?.filter((layer) =>
        String(layer.id).startsWith("mapsource.house-numbers"),
      ),
    ).toHaveLength(2);
    expect(
      addHouseNumberLayers(
        { sources: { terrain: { type: "raster-dem" } }, layers: [] },
        "mapsource",
      ),
    ).toBe(false);
  });
});
