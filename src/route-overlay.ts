import type { Feature, FeatureCollection, LineString } from "geojson";
import type { GeoJSONSource, LayerSpecification, Map } from "maplibre-gl";
import type { Coordinate } from "./types";

export function routeLine(
  coordinates: Coordinate[],
): Feature<LineString> | FeatureCollection {
  return coordinates.length > 1
    ? {
        type: "Feature",
        properties: {},
        geometry: { type: "LineString", coordinates },
      }
    : { type: "FeatureCollection", features: [] };
}

const layout = { "line-cap": "round", "line-join": "round" } as const;
const routeLayers: LayerSpecification[] = [
  {
    id: "route-connectors-casing",
    type: "line",
    source: "route-connectors",
    layout,
    paint: {
      "line-color": "#101310",
      "line-width": ["interpolate", ["linear"], ["zoom"], 10, 5, 16, 9],
      "line-opacity": 0.9,
    },
  },
  {
    id: "route-connectors-line",
    type: "line",
    source: "route-connectors",
    layout,
    paint: {
      "line-color": "#d8f88b",
      "line-width": ["interpolate", ["linear"], ["zoom"], 10, 2.5, 16, 5],
      "line-dasharray": [1, 1.4],
      "line-opacity": 0.94,
    },
  },
  {
    id: "route-casing",
    type: "line",
    source: "route",
    layout,
    paint: {
      "line-color": "#101310",
      "line-width": ["interpolate", ["linear"], ["zoom"], 10, 6, 16, 12],
      "line-opacity": 0.92,
    },
  },
  {
    id: "route-line",
    type: "line",
    source: "route",
    layout,
    paint: {
      "line-color": "#d8f88b",
      "line-width": ["interpolate", ["linear"], ["zoom"], 10, 3.2, 16, 6.8],
      "line-opacity": 0.96,
    },
  },
  {
    id: "route-traveled-line",
    type: "line",
    source: "route-traveled",
    layout,
    paint: {
      "line-color": "#e9ffc2",
      "line-width": ["interpolate", ["linear"], ["zoom"], 10, 3.2, 16, 7],
      "line-blur": 0.35,
    },
  },
];

/** Reconcile against the current style, including after an asynchronous swap.
 * Routes sit above basemap paint regardless of where that style puts labels. */
export function syncRouteOverlay(
  map: Map,
  coordinates: Coordinate[],
  connectors: FeatureCollection,
  traveled: Coordinate[],
) {
  const sources = {
    route: routeLine(coordinates),
    "route-connectors": connectors,
    "route-traveled": routeLine(traveled),
  };
  for (const [id, data] of Object.entries(sources)) {
    const source = map.getSource(id) as GeoJSONSource | undefined;
    if (source) source.setData(data);
    else map.addSource(id, { type: "geojson", data });
  }
  for (const layer of routeLayers) {
    if (!map.getLayer(layer.id)) map.addLayer(layer);
    map.moveLayer(layer.id);
  }
}
