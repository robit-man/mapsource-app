import type {
  Coordinate,
  MapCameraState,
  MapSurface,
  RouteMode,
  SheetMode,
  Waypoint,
} from "./types";

export const APP_STATE_STORAGE_KEY = "mapsource.app-state.v1";
export const APP_STATE_MAX_BYTES = 64 * 1024;

const ROUTE_MODES = new Set<RouteMode>(["walk", "bike", "car", "bus", "train"]);
const MAP_SURFACES = new Set<MapSurface>([
  "mapsource",
  "dark",
  "light",
  "elevation",
  "satellite",
]);
const SHEET_MODES = new Set<SheetMode>(["minimized", "half", "expanded"]);
const REPLAY_SPEEDS = new Set([1, 2, 4]);

export type PersistedInspection = {
  coordinate: { lat: number; lon: number };
  revealed: boolean;
  fallbackLabel?: string;
};

export type PersistedAppState = {
  version: 1;
  savedAt: number;
  waypoints: Waypoint[];
  mode: RouteMode;
  surface: MapSurface;
  camera: MapCameraState | null;
  sheetMode: SheetMode;
  replayProgress: number;
  replaySpeed: number;
  discoveryCategory: string | null;
  inspection: PersistedInspection | null;
  routeSignature: string;
};

type StateStorage = Pick<Storage, "getItem" | "setItem">;

function finiteInRange(value: unknown, minimum: number, maximum: number) {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    value >= minimum &&
    value <= maximum
  );
}

function validCoordinate(value: unknown): value is Coordinate {
  return (
    Array.isArray(value) &&
    value.length === 2 &&
    finiteInRange(value[0], -180, 180) &&
    finiteInRange(value[1], -90, 90)
  );
}

function validWaypoint(value: unknown): value is Waypoint {
  if (!value || typeof value !== "object") return false;
  const waypoint = value as Record<string, unknown>;
  return (
    typeof waypoint.id === "string" &&
    waypoint.id.length > 0 &&
    waypoint.id.length <= 256 &&
    typeof waypoint.label === "string" &&
    waypoint.label.length <= 512 &&
    finiteInRange(waypoint.lat, -90, 90) &&
    finiteInRange(waypoint.lon, -180, 180) &&
    (waypoint.routeRole === undefined ||
      waypoint.routeRole === "origin" ||
      waypoint.routeRole === "destination")
  );
}

function validCamera(value: unknown): value is MapCameraState {
  if (!value || typeof value !== "object") return false;
  const camera = value as Record<string, unknown>;
  return (
    validCoordinate(camera.center) &&
    finiteInRange(camera.zoom, 0, 24) &&
    finiteInRange(camera.bearing, -360, 360) &&
    finiteInRange(camera.pitch, 0, 85)
  );
}

function validInspection(value: unknown): value is PersistedInspection {
  if (!value || typeof value !== "object") return false;
  const inspection = value as Record<string, unknown>;
  const coordinate = inspection.coordinate as Record<string, unknown> | null;
  return (
    Boolean(coordinate) &&
    finiteInRange(coordinate?.lat, -90, 90) &&
    finiteInRange(coordinate?.lon, -180, 180) &&
    typeof inspection.revealed === "boolean" &&
    (inspection.fallbackLabel === undefined ||
      (typeof inspection.fallbackLabel === "string" &&
        inspection.fallbackLabel.length <= 512))
  );
}

export function parsePersistedAppState(
  raw: string | null,
): PersistedAppState | null {
  if (!raw || new TextEncoder().encode(raw).byteLength > APP_STATE_MAX_BYTES) {
    return null;
  }
  try {
    const value = JSON.parse(raw) as Record<string, unknown>;
    const waypoints = value.waypoints;
    const discoveryCategory = value.discoveryCategory;
    if (
      value.version !== 1 ||
      !finiteInRange(value.savedAt, 0, Number.MAX_SAFE_INTEGER) ||
      !Array.isArray(waypoints) ||
      waypoints.length > 10 ||
      !waypoints.every(validWaypoint) ||
      !ROUTE_MODES.has(value.mode as RouteMode) ||
      !MAP_SURFACES.has(value.surface as MapSurface) ||
      (value.camera !== null && !validCamera(value.camera)) ||
      !SHEET_MODES.has(value.sheetMode as SheetMode) ||
      !finiteInRange(value.replayProgress, 0, 1) ||
      !REPLAY_SPEEDS.has(value.replaySpeed as number) ||
      (discoveryCategory !== null &&
        (typeof discoveryCategory !== "string" ||
          discoveryCategory.length > 64)) ||
      (value.inspection !== null && !validInspection(value.inspection)) ||
      typeof value.routeSignature !== "string" ||
      value.routeSignature.length > 2_048
    ) {
      return null;
    }
    return value as PersistedAppState;
  } catch {
    return null;
  }
}

export function loadPersistedAppState(
  storage: Pick<StateStorage, "getItem"> = window.localStorage,
) {
  try {
    return parsePersistedAppState(storage.getItem(APP_STATE_STORAGE_KEY));
  } catch {
    return null;
  }
}

export function savePersistedAppState(
  state: PersistedAppState,
  storage: Pick<StateStorage, "setItem"> = window.localStorage,
) {
  try {
    const serialized = JSON.stringify(state);
    if (new TextEncoder().encode(serialized).byteLength > APP_STATE_MAX_BYTES) {
      return false;
    }
    storage.setItem(APP_STATE_STORAGE_KEY, serialized);
    return true;
  } catch {
    return false;
  }
}
