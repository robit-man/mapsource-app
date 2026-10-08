import type { Geometry } from "geojson";
import type { SpatialOverlay } from "./types.js";

/** Analysis results may contain a Feature rather than a bare geometry. */
export function geometryFromGeoJson(value: unknown): Geometry | null {
  if (!value || typeof value !== "object") return null;
  const data = value as Record<string, unknown>;
  if (data.type === "Feature") return geometryFromGeoJson(data.geometry);
  if (data.type === "FeatureCollection" || data.type === "GeometryCollection") {
    const entries =
      data.type === "FeatureCollection" ? data.features : data.geometries;
    if (!Array.isArray(entries)) return null;
    const geometries = entries.map(geometryFromGeoJson);
    if (geometries.some((geometry) => !geometry)) return null;
    return { type: "GeometryCollection", geometries: geometries as Geometry[] };
  }
  const depth = {
    Point: 0,
    MultiPoint: 1,
    LineString: 1,
    MultiLineString: 2,
    Polygon: 2,
    MultiPolygon: 3,
  }[String(data.type)];
  if (depth === undefined) return null;
  const validPositions = (coordinates: unknown, level: number): boolean =>
    Array.isArray(coordinates) &&
    (level === 0
      ? coordinates.length >= 2 &&
        coordinates.every(
          (number) => typeof number === "number" && Number.isFinite(number),
        )
      : coordinates.every((entry) => validPositions(entry, level - 1)));
  return validPositions(data.coordinates, depth)
    ? (data as unknown as Geometry)
    : null;
}

/** Compute collections can contain place records as well as GeoJSON Features. */
export function pipelineFeatures(
  value: unknown,
  category: string,
): SpatialOverlay["features"] {
  const collection =
    value && typeof value === "object"
      ? (value as Record<string, unknown>)
      : {};
  const entries = Array.isArray(value)
    ? value
    : (collection.places ?? collection.features);
  if (!Array.isArray(entries)) return [];
  return entries.flatMap((entry, index) => {
    if (!entry || typeof entry !== "object") return [];
    const item = entry as Record<string, unknown>;
    const coordinate = item.coordinate as
      | { lon?: unknown; lat?: unknown }
      | undefined;
    const geometry =
      geometryFromGeoJson(item.geometry) ??
      geometryFromGeoJson({
        type: "Point",
        coordinates: [coordinate?.lon, coordinate?.lat],
      });
    if (!geometry) return [];
    return [
      {
        type: "Feature" as const,
        geometry,
        properties: {
          ...(item.properties && typeof item.properties === "object"
            ? item.properties
            : {}),
          mapsourceKind: "pipeline",
          mapsourceLabel:
            typeof item.name === "string"
              ? item.name
              : `${category} ${index + 1}`,
        },
      },
    ];
  });
}
