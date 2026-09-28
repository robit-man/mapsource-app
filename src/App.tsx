import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  loadPersistedAppState,
  savePersistedAppState,
  type PersistedAppState,
} from "./app-state";
import { MapCanvas } from "./components/MapCanvas";
import { RoutePanel } from "./components/RoutePanel";
import { SearchBar } from "./components/SearchBar";
import { SpatialTools } from "./components/SpatialTools";
import { Icon } from "./components/Icon";
import {
  initialMapLocation,
  type InitialMapLocation,
} from "./initial-map-location";
import {
  coordinateLabel,
  meaningfulPlaceCategories,
  meaningfulPlaceName,
  placeAddress,
  waypointLabelForPlace,
} from "./place-utils";
import {
  haversineMeters,
  nearestRoutePosition,
  routeDistances,
} from "./route-utils";
import { presentDiscoveryPlaces } from "./search-results";
import type {
  ApiError,
  Coordinate,
  DiscoveryPlace,
  InspectionState,
  MapCameraState,
  MapSurface,
  NavigationStatus,
  PresentedSearchResult,
  RouteMode,
  RouteResponse,
  SearchStatus,
  SheetMode,
  SpatialOverlay,
  UserLocationFix,
  ViewBounds,
  Waypoint,
} from "./types";

const LAYER_OPTIONS: Array<{
  id: MapSurface;
  label: string;
  detail: string;
  preview: string;
}> = [
  {
    id: "mapsource",
    label: "Mapsource",
    detail: "Brand vector map",
    preview: "/map/preview/mapsource.png",
  },
  {
    id: "satellite",
    label: "Satellite",
    detail: "Esri World Imagery",
    preview: "/map/satellite/14/2606/5859.jpg",
  },
  {
    id: "elevation",
    label: "Elevation",
    detail: "Terrain + hillshade API",
    preview: "/map/preview/elevation.png",
  },
  {
    id: "dark",
    label: "Dark",
    detail: "Mapsource night map",
    preview: "/map/tiles/raster/dark/13/1303/2929.png",
  },
  {
    id: "light",
    label: "Light",
    detail: "Mapsource daylight map",
    preview: "/map/tiles/raster/light/13/1303/2929.png",
  },
];

function newId() {
  return typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `stop-${Date.now()}`;
}

function placeEndpoint(
  current: Waypoint[],
  role: "origin" | "destination",
  point: Waypoint,
) {
  const withoutRole = current.filter((waypoint) => waypoint.routeRole !== role);
  const endpoint = { ...point, routeRole: role };
  return role === "origin"
    ? [endpoint, ...withoutRole]
    : [...withoutRole, endpoint];
}

function routeCoordinates(route: RouteResponse | null): Coordinate[] {
  return (route?.geometry?.coordinates ?? []).filter(
    (coordinate): coordinate is Coordinate =>
      Array.isArray(coordinate) &&
      coordinate.length >= 2 &&
      Number.isFinite(coordinate[0]) &&
      Number.isFinite(coordinate[1]),
  );
}

function offRouteThreshold(mode: RouteMode, accuracy: number | null) {
  const base =
    mode === "walk" ? 40 : mode === "bike" ? 55 : mode === "car" ? 70 : 80;
  return Math.max(base, Math.min(100, (accuracy ?? 0) * 1.5));
}

export default function App() {
  const [restoredState] = useState(() => loadPersistedAppState());
  const [waypoints, setWaypoints] = useState<Waypoint[]>(
    () => restoredState?.waypoints ?? [],
  );
  const [mode, setMode] = useState<RouteMode>(
    () => restoredState?.mode ?? "walk",
  );
  const [route, setRoute] = useState<RouteResponse | null>(null);
  const [routeState, setRouteState] = useState<
    "idle" | "loading" | "ready" | "error"
  >("idle");
  const [routeError, setRouteError] = useState<string | null>(null);
  const [selectedWaypointId, setSelectedWaypointId] = useState<string | null>(
    null,
  );
  const [center, setCenter] = useState(() => ({
    lat: restoredState?.camera?.center[1] ?? 45.531,
    lon: restoredState?.camera?.center[0] ?? -122.716,
  }));
  const [camera, setCamera] = useState<MapCameraState | null>(
    () => restoredState?.camera ?? null,
  );
  const [viewBounds, setViewBounds] = useState<ViewBounds>({
    west: -122.77,
    south: 45.49,
    east: -122.66,
    north: 45.58,
  });
  const [discoveryCategory, setDiscoveryCategory] = useState<string | null>(
    () => restoredState?.discoveryCategory ?? null,
  );
  const [discoveryPlaces, setDiscoveryPlaces] = useState<DiscoveryPlace[]>([]);
  const [discoveryStatus, setDiscoveryStatus] = useState<SearchStatus>("idle");
  const [textSearchResults, setTextSearchResults] = useState<
    PresentedSearchResult[]
  >([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedSearchResultId, setSelectedSearchResultId] = useState<
    string | null
  >(null);
  const [searchAreaAvailable, setSearchAreaAvailable] = useState(false);
  const [searchAreaRevision, setSearchAreaRevision] = useState(0);
  const [inspection, setInspection] = useState<InspectionState | null>(null);
  const [surface, setSurface] = useState<MapSurface>(
    () => restoredState?.surface ?? "mapsource",
  );
  const [layersOpen, setLayersOpen] = useState(false);
  const [spatialToolsOpen, setSpatialToolsOpen] = useState(false);
  const [spatialLayer, setSpatialLayer] = useState<{
    overlay: SpatialOverlay;
    title?: string;
    revision: number;
  } | null>(null);
  const [sheetMode, setSheetMode] = useState<SheetMode>(
    () => restoredState?.sheetMode ?? "half",
  );
  const [initialLocation, setInitialLocation] =
    useState<InitialMapLocation | null>(null);
  const [navigationProgress, setNavigationProgress] = useState(0);
  const [navigationActive, setNavigationActive] = useState(false);
  const [navigationStatus, setNavigationStatus] =
    useState<NavigationStatus>("idle");
  const [navigationShapeIndex, setNavigationShapeIndex] = useState<
    number | null
  >(null);
  const [navigationNextTurnMeters, setNavigationNextTurnMeters] = useState<
    number | null
  >(null);
  const pendingEndpointRef = useRef<"origin" | "destination" | null>(null);
  const pendingCurrentLocationRef = useRef(false);
  const userLocationRef = useRef<{ lat: number; lon: number } | null>(null);
  const userLocationFixRef = useRef<UserLocationFix | null>(null);
  const userLocationActiveRef = useRef(false);
  const navigationActiveRef = useRef(false);
  const routeRef = useRef<RouteResponse | null>(null);
  const routeStateRef = useRef(routeState);
  const waypointsRef = useRef<Waypoint[]>([]);
  const modeRef = useRef<RouteMode>(mode);
  const offRouteFixesRef = useRef(0);
  const lastRerouteAtRef = useRef(0);
  const needsNavigationOriginRef = useRef(false);
  const restoredInspectionRef = useRef(restoredState?.inspection ?? null);
  const transportDiscoveryCategory =
    mode === "bus"
      ? "transit_stop"
      : mode === "train"
        ? "railway_station"
        : null;
  const mapDiscoveryCategory = discoveryCategory ?? transportDiscoveryCategory;
  const categorySearchResults = useMemo(
    () => presentDiscoveryPlaces(discoveryPlaces),
    [discoveryPlaces],
  );
  const viewStateRef = useRef({ center, viewBounds });
  useEffect(() => {
    viewStateRef.current = { center, viewBounds };
  }, [center, viewBounds]);
  const heldPointDetails = useMemo(() => {
    if (!inspection) return null;
    if (inspection.status === "loading") {
      return { title: "Finding location…" };
    }
    const address = placeAddress(inspection.place);
    const name = meaningfulPlaceName(inspection.place);
    const title =
      name || address || inspection.fallbackLabel || "Selected map point";
    const categories = meaningfulPlaceCategories(inspection.place).join(" · ");
    const coordinates = coordinateLabel(inspection.coordinate);
    const detail = name
      ? [address || categories, !address ? coordinates : null]
          .filter(Boolean)
          .join(" · ")
      : address || categories || coordinates;
    return { title, detail };
  }, [inspection]);

  useEffect(() => {
    routeRef.current = route;
    routeStateRef.current = routeState;
    waypointsRef.current = waypoints;
    modeRef.current = mode;
  }, [mode, route, routeState, waypoints]);

  useEffect(() => {
    const controller = new AbortController();
    initialMapLocation(controller.signal)
      .then((location) => {
        if (location) setInitialLocation(location);
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, []);

  useEffect(() => {
    const preventWheelZoom = (event: WheelEvent) => {
      if (event.ctrlKey) event.preventDefault();
    };
    const preventKeyboardZoom = (event: KeyboardEvent) => {
      if (
        (event.ctrlKey || event.metaKey) &&
        ["+", "-", "=", "0"].includes(event.key)
      ) {
        event.preventDefault();
      }
    };
    document.addEventListener("wheel", preventWheelZoom, { passive: false });
    document.addEventListener("keydown", preventKeyboardZoom);
    return () => {
      document.removeEventListener("wheel", preventWheelZoom);
      document.removeEventListener("keydown", preventKeyboardZoom);
    };
  }, []);

  useEffect(() => {
    if (!mapDiscoveryCategory) return;
    const searchedView = viewStateRef.current;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setDiscoveryStatus("loading");
      const params = new URLSearchParams({
        category: mapDiscoveryCategory,
        lat: String(searchedView.center.lat),
        lon: String(searchedView.center.lon),
        west: String(searchedView.viewBounds.west),
        south: String(searchedView.viewBounds.south),
        east: String(searchedView.viewBounds.east),
        north: String(searchedView.viewBounds.north),
      });
      fetch(`/api/discover?${params}`, { signal: controller.signal })
        .then(async (response) => {
          if (!response.ok)
            throw new Error(`Discovery returned ${response.status}`);
          return response.json() as Promise<{ places?: DiscoveryPlace[] }>;
        })
        .then((body) => {
          const next = body.places ?? [];
          setDiscoveryPlaces((current) =>
            JSON.stringify(current) === JSON.stringify(next) ? current : next,
          );
          setDiscoveryStatus("idle");
          setSearchAreaAvailable(false);
        })
        .catch((error: unknown) => {
          if (error instanceof DOMException && error.name === "AbortError")
            return;
          setDiscoveryStatus("error");
        });
    }, 360);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [mapDiscoveryCategory, searchAreaRevision]);

  const routeSignature = useMemo(
    () =>
      `${mode}:${waypoints.map((point) => `${point.lat.toFixed(6)},${point.lon.toFixed(6)}`).join(";")}`,
    [mode, waypoints],
  );

  const persistedState = useMemo<Omit<PersistedAppState, "savedAt">>(
    () => ({
      version: 1,
      waypoints,
      mode,
      surface,
      camera,
      sheetMode,
      discoveryCategory,
      inspection: inspection
        ? {
            coordinate: inspection.coordinate,
            revealed: inspection.revealed,
            fallbackLabel: inspection.fallbackLabel,
          }
        : null,
    }),
    [
      camera,
      discoveryCategory,
      inspection,
      mode,
      sheetMode,
      surface,
      waypoints,
    ],
  );
  const persistedStateRef = useRef(persistedState);

  useEffect(() => {
    persistedStateRef.current = persistedState;
    const timer = window.setTimeout(() => {
      savePersistedAppState({ ...persistedState, savedAt: Date.now() });
    }, 150);
    return () => window.clearTimeout(timer);
  }, [persistedState]);

  useEffect(() => {
    const flush = () =>
      savePersistedAppState({
        ...persistedStateRef.current,
        savedAt: Date.now(),
      });
    window.addEventListener("pagehide", flush);
    return () => window.removeEventListener("pagehide", flush);
  }, []);

  useEffect(() => {
    if (waypoints.length < 2) {
      const resetTimer = window.setTimeout(() => {
        setRoute(null);
        setRouteState("idle");
        setRouteError(null);
        setNavigationProgress(0);
        navigationActiveRef.current = false;
        setNavigationActive(false);
        setNavigationStatus("idle");
        setNavigationShapeIndex(null);
        setNavigationNextTurnMeters(null);
      }, 0);
      return () => window.clearTimeout(resetTimer);
    }
    const controller = new AbortController();
    const loadingTimer = window.setTimeout(() => {
      if (controller.signal.aborted) return;
      setRouteState("loading");
      setRouteError(null);
      setNavigationProgress(0);
    }, 0);
    const timer = window.setTimeout(() => {
      fetch("/api/route", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ waypoints, mode }),
        signal: controller.signal,
      })
        .then(async (response) => {
          const body = (await response.json()) as RouteResponse & ApiError;
          if (!response.ok)
            throw new Error(
              body.error?.message ?? `Routing returned ${response.status}`,
            );
          return body;
        })
        .then((body) => {
          setRoute(body);
          setRouteState("ready");
          setNavigationProgress(0);
          if (navigationActiveRef.current) {
            offRouteFixesRef.current = 0;
            setNavigationStatus("navigating");
          }
        })
        .catch((error: unknown) => {
          if (error instanceof DOMException && error.name === "AbortError")
            return;
          setRouteState("error");
          setRouteError(
            error instanceof Error
              ? error.message
              : "The route could not be calculated.",
          );
          if (navigationActiveRef.current) setNavigationStatus("off-route");
        });
    }, 220);
    return () => {
      window.clearTimeout(loadingTimer);
      window.clearTimeout(timer);
      controller.abort();
    };
    // routeSignature intentionally isolates coordinate/mode changes from label edits.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeSignature]);

  const moveWaypoint = useCallback(
    (id: string, coordinate: { lat: number; lon: number }) => {
      setWaypoints((current) =>
        current.map((point) =>
          point.id === id
            ? {
                ...point,
                lat: coordinate.lat,
                lon: coordinate.lon,
                label: point.label.replace(/ \(moved\)$/, "") + " (moved)",
              }
            : point,
        ),
      );
    },
    [],
  );

  const pickWaypoint = useCallback(
    (coordinate: { lat: number; lon: number }) => {
      if (!selectedWaypointId) return;
      if (selectedWaypointId.startsWith("pending-")) {
        const role = selectedWaypointId.endsWith("destination")
          ? "destination"
          : "origin";
        setWaypoints((current) =>
          placeEndpoint(current, role, {
            id: newId(),
            label:
              role === "origin" ? "Selected start" : "Selected destination",
            ...coordinate,
          }),
        );
        pendingEndpointRef.current = null;
        setSelectedWaypointId(null);
        return;
      }
      moveWaypoint(selectedWaypointId, coordinate);
      setSelectedWaypointId(null);
    },
    [moveWaypoint, selectedWaypointId],
  );

  const addSearchResult = useCallback((result: PresentedSearchResult) => {
    const { lat, lon } = result.coordinate;
    const pendingEndpoint = pendingEndpointRef.current;
    if (pendingEndpoint) {
      pendingEndpointRef.current = null;
      setSelectedWaypointId(null);
    }
    setWaypoints((current) => {
      const point: Waypoint = {
        id: result.sourceId ?? newId(),
        label: result.name,
        lat,
        lon,
      };
      if (pendingEndpoint) {
        return placeEndpoint(current, pendingEndpoint, point);
      }
      if (current.length === 0) {
        return [{ ...point, routeRole: "destination" }];
      }
      if (current.length === 1) {
        const role =
          current[0]?.routeRole === "destination" ? "origin" : "destination";
        return placeEndpoint(current, role, point);
      }
      if (current.length >= 10) return [...current.slice(0, -1), point];
      return [...current.slice(0, -1), point, current[current.length - 1]!];
    });
  }, []);

  const reorder = useCallback((fromId: string, toId: string) => {
    if (fromId === toId) return;
    setWaypoints((current) => {
      const from = current.findIndex((point) => point.id === fromId);
      const to = current.findIndex((point) => point.id === toId);
      if (from < 0 || to < 0) return current;
      const next = [...current];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved!);
      return next;
    });
  }, []);

  const inspectPoint = useCallback(
    (
      coordinate: { lat: number; lon: number },
      reveal = true,
      fallbackLabel?: string,
    ) => {
      const revealed = (current: InspectionState | null) =>
        reveal ||
        Boolean(
          current?.coordinate.lat === coordinate.lat &&
            current.coordinate.lon === coordinate.lon &&
            current.revealed,
        );
      setInspection((current) => ({
        status: "loading",
        coordinate,
        place: null,
        revealed: revealed(current),
        fallbackLabel,
      }));
      const params = new URLSearchParams({
        lat: String(coordinate.lat),
        lon: String(coordinate.lon),
      });
      fetch(`/api/inspect?${params}`)
        .then(async (response) => {
          if (!response.ok)
            throw new Error(`Inspection returned ${response.status}`);
          return response.json() as Promise<{
            place?: DiscoveryPlace | null;
          }>;
        })
        .then((body) =>
          setInspection((current) => ({
            status: "ready",
            coordinate,
            place: body.place ?? null,
            revealed: revealed(current),
            fallbackLabel,
          })),
        )
        .catch(() =>
          setInspection((current) => ({
            status: "error",
            coordinate,
            place: null,
            revealed: revealed(current),
            fallbackLabel,
            message: "Place details are temporarily unavailable.",
          })),
        );
    },
    [],
  );

  const selectSearchResult = useCallback(
    (result: PresentedSearchResult) => {
      setSelectedSearchResultId(result.id);
      if (pendingEndpointRef.current || waypointsRef.current.length > 0) {
        addSearchResult(result);
        window.dispatchEvent(new Event("mapsource:search-accepted"));
        return;
      }
      inspectPoint(result.coordinate, true, result.name);
    },
    [addSearchResult, inspectPoint],
  );

  const handleQueryResults = useCallback(
    (query: string, results: PresentedSearchResult[]) => {
      setSearchQuery(query);
      setTextSearchResults(results);
      setSelectedSearchResultId((selected) =>
        results.some((result) => result.id === selected) ? selected : null,
      );
      if (!query) setSearchAreaAvailable(false);
    },
    [],
  );

  useEffect(() => {
    const restoredInspection = restoredInspectionRef.current;
    if (!restoredInspection) return;
    restoredInspectionRef.current = null;
    inspectPoint(
      restoredInspection.coordinate,
      restoredInspection.revealed,
      restoredInspection.fallbackLabel,
    );
  }, [inspectPoint]);

  const addIntermediatePoint = useCallback(
    (coordinate: { lat: number; lon: number }) => {
      setWaypoints((current) => {
        if (current.length >= 10) return current;
        const next = [...current];
        next.splice(Math.max(1, current.length - 1), 0, {
          id: newId(),
          label: waypointLabelForPlace(inspection?.place ?? null, coordinate),
          ...coordinate,
        });
        return next;
      });
    },
    [inspection?.place],
  );

  const navigateToPoint = useCallback(
    (
      coordinate: { lat: number; lon: number },
      userLocation: { lat: number; lon: number } | null,
    ) => {
      if (
        waypoints.length >= 2 &&
        !window.confirm("Replace the current destination with this map point?")
      ) {
        return;
      }
      const destination: Waypoint = {
        id: newId(),
        label: waypointLabelForPlace(inspection?.place ?? null, coordinate),
        routeRole: "destination",
        ...coordinate,
      };
      if (userLocation) {
        setWaypoints([
          {
            id: "current-location",
            label: "Current location",
            routeRole: "origin",
            ...userLocation,
          },
          destination,
        ]);
        pendingEndpointRef.current = null;
        setSelectedWaypointId(null);
      } else {
        setWaypoints([destination]);
        pendingEndpointRef.current = "origin";
        setSelectedWaypointId("pending-origin");
      }
      setInspection(null);
    },
    [inspection?.place, waypoints],
  );

  const stopNavigation = useCallback(() => {
    navigationActiveRef.current = false;
    needsNavigationOriginRef.current = false;
    offRouteFixesRef.current = 0;
    setNavigationActive(false);
    setNavigationStatus("idle");
    setNavigationShapeIndex(null);
    setNavigationNextTurnMeters(null);
  }, []);

  const rerouteFromFix = useCallback((fix: UserLocationFix) => {
    lastRerouteAtRef.current = Date.now();
    offRouteFixesRef.current = 0;
    setNavigationStatus("rerouting");
    setWaypoints((current) => {
      if (current.length < 2) return current;
      const origin: Waypoint = {
        ...current[0]!,
        id: "current-location",
        label: "Current location",
        routeRole: "origin",
        lat: fix.lat,
        lon: fix.lon,
      };
      return [origin, ...current.slice(1)];
    });
  }, []);

  const updateNavigationFromFix = useCallback(
    (fix: UserLocationFix, alignOrigin = false) => {
      const coordinates = routeCoordinates(routeRef.current);
      const position = nearestRoutePosition(coordinates, [fix.lon, fix.lat]);
      if (!position) return;

      setNavigationProgress(Math.max(0, Math.min(1, position.progress)));
      setNavigationShapeIndex(position.shapeIndex);
      const distances = routeDistances(coordinates);
      const nextManeuver = routeRef.current?.maneuvers?.find(
        (maneuver) => (maneuver.shapeIndex ?? 0) > position.shapeIndex + 0.001,
      );
      const nextShapeIndex = Math.max(
        0,
        Math.min(
          coordinates.length - 1,
          Math.round(nextManeuver?.shapeIndex ?? coordinates.length - 1),
        ),
      );
      setNavigationNextTurnMeters(
        Math.max(
          0,
          (distances.cumulative[nextShapeIndex] ?? distances.total) -
            position.distanceAlongMeters,
        ),
      );

      const destination = coordinates[coordinates.length - 1]!;
      const arrivalThreshold = Math.max(18, Math.min(35, fix.accuracy ?? 18));
      if (
        haversineMeters([fix.lon, fix.lat], destination) <= arrivalThreshold
      ) {
        setNavigationProgress(1);
        setNavigationStatus("arrived");
        offRouteFixesRef.current = 0;
        return;
      }

      if (alignOrigin) {
        needsNavigationOriginRef.current = false;
        const origin = waypointsRef.current[0];
        if (
          origin &&
          haversineMeters([origin.lon, origin.lat], [fix.lon, fix.lat]) > 20
        ) {
          rerouteFromFix(fix);
          return;
        }
      }

      if (routeStateRef.current !== "ready" || (fix.accuracy ?? 0) > 100) {
        return;
      }
      if (
        position.distanceFromRouteMeters <=
        offRouteThreshold(modeRef.current, fix.accuracy)
      ) {
        offRouteFixesRef.current = 0;
        setNavigationStatus("navigating");
        return;
      }

      offRouteFixesRef.current += 1;
      setNavigationStatus("off-route");
      if (
        offRouteFixesRef.current >= 2 &&
        Date.now() - lastRerouteAtRef.current >= 8_000
      ) {
        rerouteFromFix(fix);
      }
    },
    [rerouteFromFix],
  );

  const handleUserLocation = useCallback(
    (fix: UserLocationFix) => {
      const coordinate = { lat: fix.lat, lon: fix.lon };
      userLocationRef.current = coordinate;
      userLocationFixRef.current = fix;
      if (pendingCurrentLocationRef.current) {
        pendingCurrentLocationRef.current = false;
        setWaypoints((current) =>
          placeEndpoint(current, "origin", {
            id: newId(),
            label: "Current location",
            ...coordinate,
          }),
        );
      }
      if (!navigationActiveRef.current) return;
      updateNavigationFromFix(fix, needsNavigationOriginRef.current);
    },
    [updateNavigationFromFix],
  );

  const startNavigation = useCallback(() => {
    if (routeCoordinates(routeRef.current).length < 2) return;
    navigationActiveRef.current = true;
    needsNavigationOriginRef.current = true;
    offRouteFixesRef.current = 0;
    setNavigationActive(true);
    setNavigationStatus(userLocationFixRef.current ? "navigating" : "locating");
    if (userLocationFixRef.current) {
      updateNavigationFromFix(userLocationFixRef.current, true);
    }
    if (!userLocationActiveRef.current) {
      document
        .querySelector<HTMLButtonElement>(".maplibregl-ctrl-geolocate")
        ?.click();
    } else {
      window.dispatchEvent(new Event("mapsource:recenter"));
    }
  }, [updateNavigationFromFix]);

  const handleDiscoverySelect = useCallback(
    (place: DiscoveryPlace) => {
      const [result] = presentDiscoveryPlaces([place]);
      if (!result) return;
      setSelectedSearchResultId(result.id);
      inspectPoint(result.coordinate, true, result.name);
    },
    [inspectPoint],
  );

  const handleUserViewportChange = useCallback(() => {
    if (searchQuery || discoveryCategory) setSearchAreaAvailable(true);
  }, [discoveryCategory, searchQuery]);
  const routeSelectionActive =
    waypoints.length > 0 || Boolean(selectedWaypointId?.startsWith("pending-"));

  return (
    <main className="app-shell">
      <MapCanvas
        activeDiscovery={mapDiscoveryCategory}
        discoveryPlaces={discoveryPlaces}
        onDiscoverySelect={handleDiscoverySelect}
        heldPointDetails={heldPointDetails}
        initialCamera={restoredState?.camera ?? null}
        initialLocation={initialLocation}
        mode={mode}
        navigationActive={navigationActive}
        onBoundsChange={setViewBounds}
        onCameraChange={setCamera}
        onCenterChange={setCenter}
        onAddIntermediate={addIntermediatePoint}
        onInspectPoint={inspectPoint}
        onMapPick={pickWaypoint}
        onNavigatePoint={navigateToPoint}
        onUserLocation={handleUserLocation}
        onUserTrackingChange={(active) => {
          userLocationActiveRef.current = active;
        }}
        onUserViewportChange={handleUserViewportChange}
        onWaypointMove={moveWaypoint}
        navigationProgress={navigationProgress}
        route={route}
        fitSearchResults={!routeSelectionActive}
        searchResults={discoveryCategory ? [] : textSearchResults}
        selectedSearchResultId={selectedSearchResultId}
        onSearchResultSelect={selectSearchResult}
        selectedWaypointId={selectedWaypointId}
        spatialOverlay={spatialLayer?.overlay ?? null}
        spatialOverlayRevision={spatialLayer?.revision ?? 0}
        surface={surface}
        waypoints={waypoints}
      />

      <SearchBar
        activeCategory={discoveryCategory}
        categoryResults={categorySearchResults}
        categoryStatus={discoveryStatus}
        center={center}
        onCategory={(category) => {
          if (category && category !== discoveryCategory) {
            setDiscoveryPlaces([]);
            setDiscoveryStatus("loading");
          }
          setDiscoveryCategory(category);
          setSelectedSearchResultId(null);
          setSearchAreaAvailable(false);
          if (!category) {
            setDiscoveryPlaces([]);
            setDiscoveryStatus("idle");
          }
        }}
        onQueryResults={handleQueryResults}
        onSearchArea={() => {
          setSearchAreaAvailable(false);
          setSearchAreaRevision((revision) => revision + 1);
        }}
        onSelect={selectSearchResult}
        searchAreaAvailable={searchAreaAvailable}
        routeSelectionActive={routeSelectionActive}
        selectedResultId={selectedSearchResultId}
      />

      <div className="map-tools">
        <button
          aria-expanded={spatialToolsOpen}
          aria-label="Mapsource spatial tools"
          className={`tool-button glass ${spatialToolsOpen ? "is-active" : ""}`}
          onClick={() => {
            setSpatialToolsOpen((value) => !value);
            setLayersOpen(false);
          }}
          type="button"
        >
          <Icon name="tools" size={19} />
        </button>
        <button
          aria-expanded={layersOpen}
          aria-label="Map layers"
          className={`tool-button glass ${layersOpen ? "is-active" : ""}`}
          onClick={() => {
            setLayersOpen((value) => !value);
            setSpatialToolsOpen(false);
          }}
          type="button"
        >
          <Icon name="layers" size={19} />
        </button>
        {layersOpen && (
          <div className="layers-popover glass">
            <div className="popover-heading">
              <span>Map surface</span>
              <small>Live layers</small>
            </div>
            {LAYER_OPTIONS.map((item) => (
              <button
                aria-pressed={surface === item.id}
                className={`layer-option ${surface === item.id ? "is-active" : ""}`}
                key={item.id}
                onClick={() => {
                  setSurface(item.id);
                  setLayersOpen(false);
                }}
                type="button"
              >
                <span
                  aria-hidden="true"
                  className={`layer-preview layer-preview--${item.id}`}
                >
                  <span
                    className="layer-preview__image"
                    style={{ backgroundImage: `url(${item.preview})` }}
                  />
                </span>
                <span>
                  <strong>{item.label}</strong>
                  <small>{item.detail}</small>
                </span>
                <i />
              </button>
            ))}
          </div>
        )}
        {spatialToolsOpen && (
          <SpatialTools
            center={center}
            mode={mode}
            onApplyOptimizedOrder={(order) => {
              setWaypoints((current) => {
                if (
                  order.length !== current.length ||
                  new Set(order).size !== current.length ||
                  order.some(
                    (index) => !Number.isInteger(index) || !current[index],
                  )
                ) {
                  return current;
                }
                return order.map((index) => current[index]!);
              });
            }}
            onClose={() => setSpatialToolsOpen(false)}
            onOverlay={(overlay, title) => {
              if (!overlay) {
                setSpatialLayer(null);
                return;
              }
              setSpatialLayer((current) => ({
                overlay,
                title,
                revision: (current?.revision ?? 0) + 1,
              }));
            }}
            onSurface={(nextSurface) => {
              setSurface(nextSurface);
              setLayersOpen(false);
            }}
            route={route}
            surface={surface}
            waypoints={waypoints}
          />
        )}
      </div>

      <RoutePanel
        activeDiscoveryCategory={discoveryCategory}
        initialSheetMode={restoredState?.sheetMode ?? "half"}
        inspection={inspection}
        focusOriginSelection={selectedWaypointId === "pending-origin"}
        mode={mode}
        navigationActive={navigationActive}
        navigationNextTurnMeters={navigationNextTurnMeters}
        navigationShapeIndex={navigationShapeIndex}
        navigationStatus={navigationStatus}
        onAddInspection={() => {
          if (inspection) addIntermediatePoint(inspection.coordinate);
        }}
        onCloseInspection={() => setInspection(null)}
        onInsert={(index) => {
          if (waypoints.length >= 10) return null;
          const id = newId();
          setWaypoints((current) => {
            if (current.length >= 10) return current;
            const before = current[index];
            const after = current[index + 1];
            if (!before || !after) return current;
            const next = [...current];
            next.splice(index + 1, 0, {
              id,
              label: "",
              lat: (before.lat + after.lat) / 2,
              lon: (before.lon + after.lon) / 2,
            });
            return next;
          });
          return id;
        }}
        onSelectEmptyStop={(role) => {
          pendingEndpointRef.current = role;
          setSelectedWaypointId(`pending-${role}`);
          window.requestAnimationFrame(() => {
            document
              .querySelector<HTMLButtonElement>(".search-toggle")
              ?.click();
          });
        }}
        onUseCurrentLocation={() => {
          const coordinate = userLocationRef.current;
          if (coordinate) {
            setWaypoints((current) =>
              placeEndpoint(current, "origin", {
                id: newId(),
                label: "Current location",
                ...coordinate,
              }),
            );
            return;
          }
          pendingCurrentLocationRef.current = true;
          document
            .querySelector<HTMLButtonElement>(".maplibregl-ctrl-geolocate")
            ?.click();
        }}
        onModeChange={(nextMode) => {
          setMode(nextMode);
          setDiscoveryCategory(null);
          setDiscoveryPlaces([]);
        }}
        onEndRoute={() => {
          stopNavigation();
          setWaypoints([]);
          setRoute(null);
          setRouteState("idle");
          setRouteError(null);
          setSelectedWaypointId(null);
          setNavigationProgress(0);
        }}
        onExploreCategory={(category) => {
          setDiscoveryCategory(category);
        }}
        onMoveSelect={setSelectedWaypointId}
        onNavigateInspection={() => {
          if (inspection) {
            navigateToPoint(
              inspection.coordinate,
              userLocationActiveRef.current ? userLocationRef.current : null,
            );
          }
        }}
        onRemove={(id) =>
          setWaypoints((current) => current.filter((point) => point.id !== id))
        }
        onRename={(id, label) =>
          setWaypoints((current) =>
            current.map((point) =>
              point.id === id ? { ...point, label } : point,
            ),
          )
        }
        onResolve={(id, result) => {
          const lat = result.coordinate?.lat;
          const lon = result.coordinate?.lon;
          if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;
          setWaypoints((current) =>
            current.map((point) =>
              point.id === id
                ? {
                    ...point,
                    label: result.name ?? result.displayName ?? "Selected stop",
                    lat: lat!,
                    lon: lon!,
                  }
                : point,
            ),
          );
        }}
        onSheetModeChange={setSheetMode}
        onStartNavigation={startNavigation}
        onReorder={reorder}
        navigationProgress={navigationProgress}
        route={route}
        routeError={routeError}
        routeState={routeState}
        selectedWaypointId={selectedWaypointId}
        waypoints={waypoints}
      />

      <div className="map-atmosphere" aria-hidden="true" />
    </main>
  );
}
