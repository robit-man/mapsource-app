import { describe, expect, it } from "vitest";
import { geometryFromGeoJson, pipelineFeatures } from "./spatial-geometry";

describe("analysis geometry", () => {
  const polygon = {
    type: "Polygon",
    coordinates: [
      [
        [0, 0],
        [1, 0],
        [1, 1],
        [0, 0],
      ],
    ],
  };
  it("unwraps the Feature returned by the live buffer API", () => {
    expect(
      geometryFromGeoJson({
        type: "Feature",
        properties: {},
        geometry: polygon,
      }),
    ).toEqual(polygon);
    expect(geometryFromGeoJson(polygon)).toEqual(polygon);
  });
  it("preserves collections as valid map geometries", () => {
    expect(
      geometryFromGeoJson({
        type: "FeatureCollection",
        features: [{ type: "Feature", geometry: polygon }],
      }),
    ).toEqual({ type: "GeometryCollection", geometries: [polygon] });
  });
  it("rejects malformed or non-finite coordinates before they reach the map", () => {
    for (const value of [
      null,
      {},
      { type: "Feature", geometry: null },
      { type: "Polygon", coordinates: [[0, 1]] },
      { type: "Point", coordinates: [NaN, 1] },
      { type: "GeometryCollection" },
    ]) {
      expect(geometryFromGeoJson(value)).toBeNull();
    }
  });
});

describe("pipeline map features", () => {
  const place = {
    name: "Haven Coffee",
    coordinate: { lat: 45.5352, lon: -122.7082 },
    properties: { amenity: "cafe" },
  };
  it("converts the live compute response's place records into GeoJSON Points", () => {
    expect(
      pipelineFeatures(
        { type: "FeatureCollection", features: [place] },
        "cafe",
      ),
    ).toEqual([
      {
        type: "Feature",
        geometry: { type: "Point", coordinates: [-122.7082, 45.5352] },
        properties: {
          amenity: "cafe",
          mapsourceKind: "pipeline",
          mapsourceLabel: "Haven Coffee",
        },
      },
    ]);
  });
  it("accepts place arrays and places collections as well as geometry features", () => {
    expect(pipelineFeatures([place], "cafe")).toEqual(
      pipelineFeatures({ places: [place] }, "cafe"),
    );
    const geometry = { type: "Point", coordinates: [1, 2] };
    expect(
      pipelineFeatures(
        {
          features: [
            { type: "Feature", geometry, properties: { name: "Point" } },
          ],
        },
        "cafe",
      )[0]?.geometry,
    ).toEqual(geometry);
  });
  it("omits records that cannot be located instead of sending invalid map data", () => {
    expect(
      pipelineFeatures(
        { features: [null, {}, { coordinate: { lon: "invalid", lat: 1 } }] },
        "cafe",
      ),
    ).toEqual([]);
  });
});
