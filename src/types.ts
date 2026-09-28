import type { FeatureCollection, Geometry } from "geojson";

export type Coordinate = [number, number];

export type MapCameraState = {
  center: Coordinate;
  zoom: number;
  bearing: number;
  pitch: number;
};

export type SheetMode = "minimized" | "half" | "expanded";

export type Waypoint = {
  id: string;
  label: string;
  lat: number;
  lon: number;
  routeRole?: "origin" | "destination";
};

export type SearchResult = {
  id?: string;
  kind?: "address" | "business" | "landmark" | "street" | "place";
  name?: string;
  displayName?: string;
  coordinate?: { lat?: number; lon?: number };
  category?: string;
  distanceMeters?: number;
};

export type SearchStatus = "idle" | "loading" | "error";

/** A bounded, map-ready UI projection of either lookup or discovery data. */
export type PresentedSearchResult = {
  id: string;
  sourceId: string | null;
  source: "text" | "discovery";
  name: string;
  detail: string;
  coordinate: { lat: number; lon: number };
  kind: SearchResult["kind"];
  category: string | null;
  distanceMeters: number | null;
};

export type DiscoveryPlace = {
  id: string;
  name: string | null;
  categories: string[];
  coordinate: { lat: number; lon: number } | null;
  address: {
    housenumber: string | null;
    street: string | null;
    district?: string | null;
    city: string | null;
    state?: string | null;
    postcode: string | null;
    country: string | null;
    countryCode?: string | null;
  };
  distanceMeters: number | null;
  properties: Record<string, string>;
  sources: Array<{ dataset: string; id: string; url: string }>;
};

export type ViewBounds = {
  west: number;
  south: number;
  east: number;
  north: number;
};

export type InspectionState = {
  status: "loading" | "ready" | "error";
  coordinate: { lat: number; lon: number };
  place: DiscoveryPlace | null;
  revealed: boolean;
  fallbackLabel?: string;
  message?: string;
};

export type RouteManeuver = {
  instruction?: string;
  distanceKm?: number;
  durationSeconds?: number;
  shapeIndex?: number;
};

export type RouteElevation = {
  samples?: number[];
  gainMeters?: number;
  lossMeters?: number;
  minMeters?: number;
  maxMeters?: number;
};

export type RouteResponse = {
  schema?: string;
  profile?: string;
  summary?: { distanceKm?: number; durationSeconds?: number };
  geometry?: { type?: string; coordinates?: Coordinate[] };
  maneuvers?: RouteManeuver[];
  elevation?: RouteElevation;
  meta?: {
    requestId?: string;
    computeMs?: number;
    attribution?: string[];
    graph?: string;
    routingEngine?: string;
  };
};

export type RouteMode = "walk" | "bike" | "car" | "bus" | "train";

export type NavigationStatus =
  | "idle"
  | "locating"
  | "navigating"
  | "off-route"
  | "rerouting"
  | "arrived";

export type UserLocationFix = {
  lat: number;
  lon: number;
  accuracy: number | null;
};

export type MapSurface =
  | "mapsource"
  | "dark"
  | "light"
  | "elevation"
  | "satellite";

export type ApiError = {
  error?: {
    code?: string;
    message?: string;
    requestId?: string;
    retryable?: boolean;
  };
};

export type SpatialToolId =
  | "isochrone"
  | "matrix"
  | "optimize"
  | "snap"
  | "match"
  | "analyze"
  | "pipeline"
  | "overpass"
  | "elevation"
  | "contours";

export type SpatialOverlay = FeatureCollection<
  Geometry,
  { [name: string]: unknown }
>;

export type SpatialToolResult = {
  tool: SpatialToolId;
  title: string;
  summary: string;
  stats: Array<{ label: string; value: string }>;
  overlay?: SpatialOverlay;
  optimizedOrder?: number[];
  generatedAt: string;
};

export type CapabilityOperation = {
  id: string;
  category: string;
  method: string;
  path: string;
  summary: string;
  description: string;
  access: string;
};

export type CapabilityCatalog = {
  total: number;
  groups: Array<{
    category: string;
    label: string;
    operations: CapabilityOperation[];
  }>;
};
