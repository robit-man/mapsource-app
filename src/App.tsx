import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MapCanvas } from "./components/MapCanvas";
import { RoutePanel } from "./components/RoutePanel";
import { SearchBar } from "./components/SearchBar";
import { Icon } from "./components/Icon";
import type {
  ApiError,
  RouteMode,
  RouteResponse,
  SearchResult,
  Waypoint,
} from "./types";

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
  const [satellite, setSatellite] = useState(false);
  const [satelliteOpacity, setSatelliteOpacity] = useState(0.82);
  const [terrain, setTerrain] = useState(true);
  const [layersOpen, setLayersOpen] = useState(false);
  const [replayProgress, setReplayProgress] = useState(0);
  const [replaying, setReplaying] = useState(false);
  const [replaySpeed, setReplaySpeed] = useState(1);
  const animationRef = useRef<number | null>(null);

  const routeSignature = useMemo(
    () =>
      `${mode}:${waypoints.map((point) => `${point.lat.toFixed(6)},${point.lon.toFixed(6)}`).join(";")}`,
    [mode, waypoints],
  );

  useEffect(() => {
    const controller = new AbortController();
    setRouteState("loading");
    setRouteError(null);
    setReplayProgress(0);
    setReplaying(false);
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

  return (
    <main className="app-shell">
      <MapCanvas
        onCenterChange={setCenter}
        onMapPick={pickWaypoint}
        onWaypointMove={moveWaypoint}
        replayProgress={replayProgress}
        replaying={replaying}
        route={route}
        satellite={satellite}
        satelliteOpacity={satelliteOpacity}
        selectedWaypointId={selectedWaypointId}
        terrain={terrain}
        waypoints={waypoints}
      />

      <div className="brand-mark glass" aria-label="Mapsource Trail">
        <span className="brand-symbol">
          <Icon name="route" size={20} />
        </span>
        <span>
          <strong>MAPSOURCE</strong>
          <small>TRAIL</small>
        </span>
      </div>

      <SearchBar center={center} onSelect={addSearchResult} />

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
        <button
          aria-label="Toggle terrain relief"
          aria-pressed={terrain}
          className={`tool-button glass ${terrain ? "is-active" : ""}`}
          onClick={() => setTerrain((value) => !value)}
          type="button"
        >
          <Icon name="terrain" size={19} />
        </button>
        {layersOpen && (
          <div className="layers-popover glass">
            <div className="popover-heading">
              <span>Map surface</span>
              <small>Live layers</small>
            </div>
            <button
              className={`layer-option ${!satellite ? "is-active" : ""}`}
              onClick={() => setSatellite(false)}
              type="button"
            >
              <span className="layer-preview map-preview" />
              <span>
                <strong>Mapsource</strong>
                <small>Vector paths + terrain</small>
              </span>
              <i />
            </button>
            <button
              className={`layer-option ${satellite ? "is-active" : ""}`}
              onClick={() => setSatellite(true)}
              type="button"
            >
              <span className="layer-preview satellite-preview" />
              <span>
                <strong>Satellite</strong>
                <small>Esri World Imagery</small>
              </span>
              <i />
            </button>
            {satellite && (
              <label className="opacity-control">
                <span>
                  Imagery opacity{" "}
                  <strong>{Math.round(satelliteOpacity * 100)}%</strong>
                </span>
                <input
                  max="1"
                  min="0.25"
                  onChange={(event) =>
                    setSatelliteOpacity(Number(event.target.value))
                  }
                  step="0.01"
                  type="range"
                  value={satelliteOpacity}
                />
              </label>
            )}
            <p className="imagery-credit">
              <a
                href="https://www.esri.com/en-us/legal/terms/web-site-service"
                rel="noreferrer"
                target="_blank"
              >
                Tiles © Esri
              </a>
              {" — Source: Esri, Maxar, Earthstar Geographics"}
            </p>
          </div>
        )}
      </div>

      <RoutePanel
        mode={mode}
        onModeChange={setMode}
        onMoveSelect={setSelectedWaypointId}
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
