type StyleSource = {
  type?: string;
  [key: string]: unknown;
};

export type MutableMapStyle = {
  sources?: Record<string, StyleSource>;
  layers?: Array<Record<string, unknown>>;
};

const HOUSE_NUMBER_LAYER_IDS = [
  "mapsource.house-numbers",
  "mapsource.house-numbers-close",
] as const;

function labelPaint(surface: string) {
  if (surface === "light") {
    return {
      "text-color": "#334039",
      "text-halo-color": "#f4f5ee",
      "text-halo-width": 1.15,
      "text-halo-blur": 0.25,
    };
  }
  if (surface === "satellite") {
    return {
      "text-color": "#efffbf",
      "text-halo-color": "#111711",
      "text-halo-width": 1.35,
      "text-halo-blur": 0.3,
    };
  }
  return {
    "text-color": "#d8ed9d",
    "text-halo-color": "#101310",
    "text-halo-width": 1.15,
    "text-halo-blur": 0.25,
  };
}

function houseNumberLayout(allowOverlap: boolean) {
  return {
    "symbol-placement": "point",
    "text-field": [
      "to-string",
      ["coalesce", ["get", "housenumber"], ["get", "addr:housenumber"]],
    ],
    "text-font": ["Noto Sans Regular"],
    "text-size": ["interpolate", ["linear"], ["zoom"], 16, 9, 18, 11, 20, 13],
    "text-anchor": "center",
    "text-justify": "center",
    "text-letter-spacing": 0.015,
    "text-max-width": 5,
    "text-padding": allowOverlap ? 0 : 1.5,
    "text-pitch-alignment": "viewport",
    "text-rotation-alignment": "viewport",
    "text-allow-overlap": allowOverlap,
    "text-ignore-placement": allowOverlap,
  };
}

/** Add close-range address labels from the canonical OpenMapTiles
 * `housenumber` source layer. The first pass participates in collision
 * placement at z16; once the map is close enough for individual buildings to
 * be distinct, the second pass renders every available number. */
export function addHouseNumberLayers(style: MutableMapStyle, surface: string) {
  const layers = style.layers;
  if (!layers) return false;
  const vectorSource = Object.entries(style.sources ?? {}).find(
    ([, source]) => source.type === "vector",
  )?.[0];
  if (!vectorSource) return false;

  for (const id of HOUSE_NUMBER_LAYER_IDS) {
    const existing = layers.findIndex((layer) => layer.id === id);
    if (existing >= 0) layers.splice(existing, 1);
  }

  const common = {
    type: "symbol",
    source: vectorSource,
    "source-layer": "housenumber",
    filter: ["any", ["has", "housenumber"], ["has", "addr:housenumber"]],
    paint: labelPaint(surface),
  };
  layers.push(
    {
      ...common,
      id: HOUSE_NUMBER_LAYER_IDS[0],
      minzoom: 16,
      maxzoom: 17.5,
      layout: houseNumberLayout(false),
    },
    {
      ...common,
      id: HOUSE_NUMBER_LAYER_IDS[1],
      minzoom: 17.5,
      layout: houseNumberLayout(true),
    },
  );
  return true;
}
