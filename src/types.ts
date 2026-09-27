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

export type RouteMode = "hike" | "run" | "bike";

export type ApiError = {
  error?: {
    code?: string;
    message?: string;
    requestId?: string;
    retryable?: boolean;
  };
};
