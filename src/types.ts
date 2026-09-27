export type Coordinate = [number, number];

export type Waypoint = {
  id: string;
  label: string;
  lat: number;
  lon: number;
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

export type DiscoveryPlace = {
  id: string;
  name: string | null;
  categories: string[];
  coordinate: { lat: number; lon: number } | null;
  address: {
    housenumber: string | null;
    street: string | null;
    city: string | null;
    postcode: string | null;
    country: string | null;
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

export type RouteMode =
  | "hike"
  | "walk"
  | "run"
  | "bike"
  | "car"
  | "transit"
  | "train";

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
