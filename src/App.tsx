import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MapCanvas } from "./components/MapCanvas";
import { RoutePanel } from "./components/RoutePanel";
import { SearchBar } from "./components/SearchBar";
import { Icon } from "./components/Icon";
import type {
  ApiError,
  DiscoveryPlace,
  InspectionState,
  MapSurface,
  RouteMode,
  RouteResponse,
  SearchResult,
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
    preview: "/map/preview/dark.png",
  },
  {
    id: "light",
    label: "Light",
    detail: "Mapsource daylight map",
    preview: "/map/preview/light.png",
  },
];

const INITIAL_WAYPOINTS: Waypoint[] = [
  {
    id: "lower-macleay",
    label: "Lower Macleay Trailhead",
    lat: 45.53616,
    lon: -122.71256,
  },
  {
    id: "pittock",
    label: "Pittock Mansion overlook",
    lat: 45.52521,
    lon: -122.71627,
  },
];

function newId() {
  return typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `stop-${Date.now()}`;
}

export default function App() {
  const [waypoints, setWaypoints] = useState(INITIAL_WAYPOINTS);
  const [mode, setMode] = useState<RouteMode>("hike");
  const [route, setRoute] = useState<RouteResponse | null>(null);
  const [routeState, setRouteState] = useState<
    "idle" | "loading" | "ready" | "error"
  >("idle");
  const [routeError, setRouteError] = useState<string | null>(null);
  const [selectedWaypointId, setSelectedWaypointId] = useState<string | null>(
    null,
  );
  const [center, setCenter] = useState({ lat: 45.531, lon: -122.716 });
  const [viewBounds, setViewBounds] = useState<ViewBounds>({
    west: -122.77,
    south: 45.49,
    east: -122.66,
    north: 45.58,
  });
  const [discoveryCategory, setDiscoveryCategory] = useState<string | null>(
    null,
  );
  const [discoveryPlaces, setDiscoveryPlaces] = useState<DiscoveryPlace[]>([]);
  const [inspection, setInspection] = useState<InspectionState | null>(null);
  const [surface, setSurface] = useState<MapSurface>("mapsource");
  const [layersOpen, setLayersOpen] = useState(false);
  const [replayProgress, setReplayProgress] = useState(0);
  const [replaying, setReplaying] = useState(false);
  const [replaySpeed, setReplaySpeed] = useState(1);
  const animationRef = useRef<number | null>(null);

  useEffect(() => {
    const preventGesture = (event: Event) => event.preventDefault();
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
    document.addEventListener("gesturestart", preventGesture, {
      passive: false,
    });
    document.addEventListener("gesturechange", preventGesture, {
      passive: false,
    });
    document.addEventListener("wheel", preventWheelZoom, { passive: false });
    document.addEventListener("keydown", preventKeyboardZoom);
    return () => {
      document.removeEventListener("gesturestart", preventGesture);
      document.removeEventListener("gesturechange", preventGesture);
      document.removeEventListener("wheel", preventWheelZoom);
      document.removeEventListener("keydown", preventKeyboardZoom);
    };
  }, []);

  useEffect(() => {
    if (!discoveryCategory) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      const params = new URLSearchParams({
        category: discoveryCategory,
        lat: String(center.lat),
        lon: String(center.lon),
        west: String(viewBounds.west),
        south: String(viewBounds.south),
        east: String(viewBounds.east),
        north: String(viewBounds.north),
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
        })
        .catch((error: unknown) => {
          if (error instanceof DOMException && error.name === "AbortError")
            return;
          setDiscoveryPlaces([]);
        });
    }, 360);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [center.lat, center.lon, discoveryCategory, viewBounds]);

  const routeSignature = useMemo(
    () =>
      `${mode}:${waypoints.map((point) => `${point.lat.toFixed(6)},${point.lon.toFixed(6)}`).join(";")}`,
    [mode, waypoints],
  );

  useEffect(() => {
    const controller = new AbortController();
    const loadingTimer = window.setTimeout(() => {
      if (controller.signal.aborted) return;
      setRouteState("loading");
      setRouteError(null);
      setReplayProgress(0);
      setReplaying(false);
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
          setReplayProgress(0);
          setReplaying(false);
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

  useEffect(() => {
    if (!replaying) {
      if (animationRef.current !== null)
        cancelAnimationFrame(animationRef.current);
      animationRef.current = null;
      return;
    }
    let previous = performance.now();
    const frame = (now: number) => {
      const delta = now - previous;
      previous = now;
      setReplayProgress((progress) => {
        const next = progress + (delta / 45_000) * replaySpeed;
        if (next >= 1) {
          setReplaying(false);
          return 1;
        }
        return next;
      });
      animationRef.current = requestAnimationFrame(frame);
    };
    animationRef.current = requestAnimationFrame(frame);
    return () => {
      if (animationRef.current !== null)
        cancelAnimationFrame(animationRef.current);
      animationRef.current = null;
    };
  }, [replaySpeed, replaying]);

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
      moveWaypoint(selectedWaypointId, coordinate);
      setSelectedWaypointId(null);
    },
    [moveWaypoint, selectedWaypointId],
  );

  const addSearchResult = useCallback((result: SearchResult) => {
    const lat = result.coordinate?.lat;
    const lon = result.coordinate?.lon;
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;
    setWaypoints((current) => {
      const point: Waypoint = {
        id: result.id ?? newId(),
        label: result.name ?? result.displayName ?? "New stop",
        lat: lat!,
        lon: lon!,
      };
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

  const addIntermediatePoint = useCallback(
    (coordinate: { lat: number; lon: number }) => {
      setWaypoints((current) => {
        if (current.length >= 10) return current;
        const next = [...current];
        next.splice(Math.max(1, current.length - 1), 0, {
          id: newId(),
          label: inspection?.place?.name ?? "Selected map point",
          ...coordinate,
        });
        return next;
      });
    },
    [inspection?.place?.name],
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
      const existingStart = waypoints[0];
      const origin = userLocation
        ? {
            id: "current-location",
            label: "Current location",
            ...userLocation,
          }
        : existingStart;
      if (!origin) return;
      setWaypoints([
        origin,
        {
          id: newId(),
          label: inspection?.place?.name ?? "Selected destination",
          ...coordinate,
        },
      ]);
      setSelectedWaypointId(null);
    },
    [inspection?.place?.name, waypoints],
  );

  return (
    <main className="app-shell">
      <MapCanvas
        activeDiscovery={discoveryCategory}
        discoveryPlaces={discoveryPlaces}
        onBoundsChange={setViewBounds}
        onCenterChange={setCenter}
        onAddIntermediate={addIntermediatePoint}
        onInspectPoint={inspectPoint}
        onMapPick={pickWaypoint}
        onNavigatePoint={navigateToPoint}
        onWaypointMove={moveWaypoint}
        replayProgress={replayProgress}
        replaying={replaying}
        route={route}
        selectedWaypointId={selectedWaypointId}
        surface={surface}
        waypoints={waypoints}
      />

      <SearchBar
        activeCategory={discoveryCategory}
        center={center}
        onCategory={(category) => {
          setDiscoveryCategory(category);
          if (!category) setDiscoveryPlaces([]);
        }}
        onSelect={addSearchResult}
      />

      <div className="map-tools">
        <button
          aria-expanded={layersOpen}
          aria-label="Map layers"
          className={`tool-button glass ${layersOpen ? "is-active" : ""}`}
          onClick={() => setLayersOpen((value) => !value)}
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
      </div>

      <RoutePanel
        inspection={inspection}
        mode={mode}
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
        onModeChange={setMode}
        onMoveSelect={setSelectedWaypointId}
        onNavigateInspection={() => {
          if (inspection) navigateToPoint(inspection.coordinate, null);
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
        onReplayProgress={(progress) => {
          setReplayProgress(progress);
          setReplaying(false);
        }}
        onReplayRestart={() => {
          setReplayProgress(0);
          setReplaying(true);
        }}
        onReplaySpeed={setReplaySpeed}
        onReplayToggle={() => {
          if (replayProgress >= 1) setReplayProgress(0);
          setReplaying((value) => !value);
        }}
        onReorder={reorder}
        replayProgress={replayProgress}
        replaySpeed={replaySpeed}
        replaying={replaying}
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
