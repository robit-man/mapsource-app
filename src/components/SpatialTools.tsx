import { useEffect, useMemo, useState } from "react";
import { Icon } from "./Icon";
import type {
  ApiError,
  CapabilityCatalog,
  Coordinate,
  MapSurface,
  RouteMode,
  RouteResponse,
  SpatialOverlay,
  SpatialToolId,
  SpatialToolResult,
  Waypoint,
} from "../types";

type ToolGroup = "reach" | "data" | "build" | "all";

type ToolDefinition = {
  id: SpatialToolId;
  group: Exclude<ToolGroup, "all">;
  title: string;
  detail: string;
  action: string;
  endpoint: string;
  minimumStops?: number;
  needsRoute?: boolean;
};

const TOOLS: ToolDefinition[] = [
  {
    id: "isochrone",
    group: "reach",
    title: "Reachability",
    detail:
      "Draw walk, bike, drive, or transit time bands from the map center.",
    action: "Draw reach",
    endpoint: "/api/isochrone",
  },
  {
    id: "matrix",
    group: "reach",
    title: "Travel matrix",
    detail: "Compare time and distance across every stop in the planner.",
    action: "Compare stops",
    endpoint: "/api/matrix",
    minimumStops: 2,
  },
  {
    id: "optimize",
    group: "reach",
    title: "Stop optimizer",
    detail: "Keep A and B fixed while solving the visit order between them.",
    action: "Solve order",
    endpoint: "/api/optimize",
    minimumStops: 3,
  },
  {
    id: "snap",
    group: "reach",
    title: "Network snap",
    detail:
      "Correlate planner stops to real roads and paths, including offsets.",
    action: "Snap stops",
    endpoint: "/api/snap",
    minimumStops: 1,
  },
  {
    id: "match",
    group: "reach",
    title: "Map matching",
    detail: "Treat the current route as a GPS trace and fit it to the network.",
    action: "Match trace",
    endpoint: "/api/map-match",
    needsRoute: true,
  },
  {
    id: "elevation",
    group: "data",
    title: "Point elevation",
    detail: "Read exact terrain height and the underlying raw model sample.",
    action: "Sample height",
    endpoint: "/api/elevation",
  },
  {
    id: "contours",
    group: "data",
    title: "Topo contours",
    detail: "Generate fresh elevation bands and relief metrics for this view.",
    action: "Build contours",
    endpoint: "/api/contours",
  },
  {
    id: "overpass",
    group: "data",
    title: "OpenStreetMap query",
    detail:
      "Query named amenities and visitor features from the local OSM graph.",
    action: "Query OSM",
    endpoint: "/api/interpreter",
  },
  {
    id: "analyze",
    group: "build",
    title: "Spatial analysis",
    detail:
      "Create a geodesic buffer ready for discovery, intersection, or export.",
    action: "Build buffer",
    endpoint: "/api/analyze",
  },
  {
    id: "pipeline",
    group: "build",
    title: "Compute pipeline",
    detail:
      "Find and reduce nearby features in one server-side dependency graph.",
    action: "Run pipeline",
    endpoint: "/api/compute",
  },
];

const GROUPS: Array<{ id: ToolGroup; label: string }> = [
  { id: "reach", label: "Reach" },
  { id: "data", label: "Terrain + OSM" },
  { id: "build", label: "Analyze" },
  { id: "all", label: "All APIs" },
];

function routeCoordinates(route: RouteResponse | null): Coordinate[] {
  return (route?.geometry?.coordinates ?? []).filter(
    (coordinate): coordinate is Coordinate =>
      Array.isArray(coordinate) &&
      coordinate.length >= 2 &&
      Number.isFinite(coordinate[0]) &&
      Number.isFinite(coordinate[1]),
  );
}

function errorMessage(payload: ApiError, status: number) {
  return payload.error?.message ?? `Mapsource returned HTTP ${status}.`;
}

type SpatialToolsProps = {
  center: { lat: number; lon: number };
  mode: RouteMode;
  route: RouteResponse | null;
  surface: MapSurface;
  waypoints: Waypoint[];
  onApplyOptimizedOrder: (order: number[]) => void;
  onClose: () => void;
  onOverlay: (overlay: SpatialOverlay | null, title?: string) => void;
  onSurface: (surface: MapSurface) => void;
};

export function SpatialTools({
  center,
  mode,
  route,
  surface,
  waypoints,
  onApplyOptimizedOrder,
  onClose,
  onOverlay,
  onSurface,
}: SpatialToolsProps) {
  const [group, setGroup] = useState<ToolGroup>("reach");
  const [running, setRunning] = useState<SpatialToolId | "static" | null>(null);
  const [result, setResult] = useState<SpatialToolResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [minutes, setMinutes] = useState(20);
  const [radiusMeters, setRadiusMeters] = useState(750);
  const [pipelineCategory, setPipelineCategory] = useState("cafe");
  const [catalog, setCatalog] = useState<CapabilityCatalog | null>(null);
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [serviceReady, setServiceReady] = useState<boolean | null>(null);
  const [snapshotUrl, setSnapshotUrl] = useState<string | null>(null);
  const routeShape = useMemo(() => routeCoordinates(route), [route]);
  const sampledRoute = useMemo(() => {
    const stride = Math.max(1, Math.ceil(routeShape.length / 180));
    const sampled = routeShape.filter(
      (_coordinate, index) => index % stride === 0,
    );
    const last = routeShape.at(-1);
    if (last && sampled.at(-1) !== last) sampled.push(last);
    return sampled;
  }, [routeShape]);

  useEffect(() => {
    const controller = new AbortController();
    Promise.allSettled([
      fetch("/api/capabilities", { signal: controller.signal }).then(
        async (response) => {
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          setCatalog((await response.json()) as CapabilityCatalog);
        },
      ),
      fetch("/api/spatial/status", { signal: controller.signal }).then(
        async (response) => {
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          await response.json();
          setServiceReady(true);
        },
      ),
    ]).then((outcomes) => {
      if (controller.signal.aborted) return;
      if (outcomes[0]?.status === "rejected") {
        setCatalogError("The live API catalog could not be loaded.");
      }
      if (outcomes[1]?.status === "rejected") setServiceReady(false);
    });
    return () => controller.abort();
  }, []);

  useEffect(
    () => () => {
      if (snapshotUrl) URL.revokeObjectURL(snapshotUrl);
    },
    [snapshotUrl],
  );

  const commonRequest = {
    center,
    mode,
    minutes,
    radiusMeters,
    category: pipelineCategory,
  };
  const waypointRequest = waypoints.map(({ lat, lon, label }) => ({
    lat,
    lon,
    label,
  }));

  const run = async (tool: SpatialToolId) => {
    setRunning(tool);
    setError(null);
    try {
      const requestBody = {
        ...commonRequest,
        ...(["matrix", "optimize", "snap", "match"].includes(tool)
          ? { waypoints: waypointRequest }
          : {}),
        ...(tool === "match" ? { route: sampledRoute } : {}),
      };
      const response = await fetch(`/api/spatial/${tool}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(requestBody),
      });
      const payload = (await response.json()) as SpatialToolResult | ApiError;
      if (!response.ok)
        throw new Error(errorMessage(payload as ApiError, response.status));
      const next = payload as SpatialToolResult;
      setResult(next);
      if (next.overlay) onOverlay(next.overlay, next.title);
      if (tool === "contours") onSurface("elevation");
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "The spatial tool failed.",
      );
    } finally {
      setRunning(null);
    }
  };

  const renderStaticMap = async () => {
    setRunning("static");
    setError(null);
    try {
      const response = await fetch("/api/spatial/static-map", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ...commonRequest,
          waypoints: waypointRequest,
          route: sampledRoute,
          surface,
        }),
      });
      if (!response.ok) {
        const payload = (await response.json()) as ApiError;
        throw new Error(errorMessage(payload, response.status));
      }
      const url = URL.createObjectURL(await response.blob());
      setSnapshotUrl((previous) => {
        if (previous) URL.revokeObjectURL(previous);
        return url;
      });
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "The map render failed.",
      );
    } finally {
      setRunning(null);
    }
  };

  return (
    <section
      aria-label="Mapsource spatial tools"
      className="spatial-popover glass"
    >
      <header className="spatial-popover__header">
        <span>
          <small>Mapsource services</small>
          <strong>Use the whole spatial stack</strong>
        </span>
        <span
          className={`service-health ${serviceReady === false ? "is-down" : ""}`}
        >
          <i />
          {serviceReady === null
            ? "Checking"
            : serviceReady
              ? "Live"
              : "Degraded"}
        </span>
        <button
          aria-label="Close spatial tools"
          onClick={onClose}
          type="button"
        >
          <Icon name="close" size={16} />
        </button>
      </header>

      <nav aria-label="Spatial tool families" className="spatial-tabs">
        {GROUPS.map((item) => (
          <button
            aria-pressed={group === item.id}
            className={group === item.id ? "is-active" : ""}
            key={item.id}
            onClick={() => setGroup(item.id)}
            type="button"
          >
            {item.label}
          </button>
        ))}
      </nav>

      <div className="spatial-popover__scroll">
        {group !== "all" && (
          <div className="spatial-tool-grid">
            {TOOLS.filter((tool) => tool.group === group).map((tool) => {
              const minimumStops = tool.minimumStops ?? 0;
              const unavailable =
                waypoints.length < minimumStops ||
                (tool.needsRoute && routeShape.length < 2);
              const requirement = tool.needsRoute
                ? "Build a route first"
                : minimumStops > 0
                  ? `Add ${minimumStops} ${minimumStops === 1 ? "stop" : "stops"}`
                  : null;
              return (
                <article className="spatial-tool-card" key={tool.id}>
                  <header>
                    <span>{tool.title}</span>
                    <code>{tool.endpoint}</code>
                  </header>
                  <p>{tool.detail}</p>
                  {tool.id === "isochrone" && (
                    <label className="tool-control">
                      <span>Travel time</span>
                      <select
                        value={minutes}
                        onChange={(event) =>
                          setMinutes(Number(event.target.value))
                        }
                      >
                        <option value="10">10 min</option>
                        <option value="20">20 min</option>
                        <option value="30">30 min</option>
                        <option value="45">45 min</option>
                      </select>
                    </label>
                  )}
                  {tool.id === "analyze" && (
                    <label className="tool-control">
                      <span>Buffer</span>
                      <select
                        value={radiusMeters}
                        onChange={(event) =>
                          setRadiusMeters(Number(event.target.value))
                        }
                      >
                        <option value="250">250 m</option>
                        <option value="750">750 m</option>
                        <option value="1500">1.5 km</option>
                        <option value="5000">5 km</option>
                      </select>
                    </label>
                  )}
                  {tool.id === "pipeline" && (
                    <label className="tool-control">
                      <span>Find nearby</span>
                      <select
                        value={pipelineCategory}
                        onChange={(event) =>
                          setPipelineCategory(event.target.value)
                        }
                      >
                        <option value="cafe">Cafes</option>
                        <option value="restaurant">Food</option>
                        <option value="park">Parks</option>
                        <option value="fuel">Fuel</option>
                      </select>
                    </label>
                  )}
                  <button
                    className="spatial-tool-card__run"
                    disabled={unavailable || running !== null}
                    onClick={() => void run(tool.id)}
                    type="button"
                  >
                    {running === tool.id ? (
                      <span className="search-spinner" />
                    ) : (
                      <Icon name="arrow" size={14} />
                    )}
                    {unavailable ? requirement : tool.action}
                  </button>
                </article>
              );
            })}
            {group === "build" && (
              <article className="spatial-tool-card spatial-tool-card--render">
                <header>
                  <span>Static map</span>
                  <code>/api/render/static</code>
                </header>
                <p>Render this view, route, and its stops as a portable PNG.</p>
                {snapshotUrl && (
                  <a
                    className="static-preview"
                    download="mapsource-map.png"
                    href={snapshotUrl}
                  >
                    <img
                      alt="Generated Mapsource static map"
                      src={snapshotUrl}
                    />
                    <span>Download PNG</span>
                  </a>
                )}
                <button
                  className="spatial-tool-card__run"
                  disabled={running !== null}
                  onClick={() => void renderStaticMap()}
                  type="button"
                >
                  {running === "static" ? (
                    <span className="search-spinner" />
                  ) : (
                    <Icon name="arrow" size={14} />
                  )}
                  Render snapshot
                </button>
              </article>
            )}
          </div>
        )}

        {group === "all" && (
          <div className="capability-catalog">
            <p>
              This list comes directly from the installed <code>mapsource</code>{" "}
              package—no second API inventory.
            </p>
            {catalogError && (
              <div className="spatial-error">{catalogError}</div>
            )}
            {!catalog && !catalogError && (
              <div className="catalog-loading">
                <span className="search-spinner" /> Loading contract…
              </div>
            )}
            {catalog && (
              <>
                <div className="catalog-total">
                  <strong>{catalog.total}</strong>
                  <span>
                    published operations across {catalog.groups.length} service
                    families
                  </span>
                </div>
                {catalog.groups.map((category) => (
                  <details key={category.category}>
                    <summary>
                      <span>{category.label}</span>
                      <small>{category.operations.length}</small>
                    </summary>
                    <div>
                      {category.operations.map((operation) => (
                        <a
                          href={`https://mapsource.io/docs/reference#${operation.id}`}
                          key={operation.id}
                          rel="noreferrer"
                          target="_blank"
                        >
                          <span>
                            <strong>{operation.summary}</strong>
                            <small>
                              {operation.description.split("\n")[0]}
                            </small>
                          </span>
                          <code>
                            {operation.method} {operation.path}
                          </code>
                        </a>
                      ))}
                    </div>
                  </details>
                ))}
                <a
                  className="catalog-docs-link"
                  href="https://mapsource.io/docs/reference"
                  rel="noreferrer"
                  target="_blank"
                >
                  Open generated API reference <Icon name="arrow" size={14} />
                </a>
              </>
            )}
          </div>
        )}

        {error && <div className="spatial-error">{error}</div>}
        {result && group !== "all" && (
          <article className="spatial-result" aria-live="polite">
            <header>
              <span>
                <small>Live result</small>
                <strong>{result.title}</strong>
              </span>
              {result.overlay && (
                <button
                  aria-label="Clear map result"
                  onClick={() => onOverlay(null)}
                  type="button"
                >
                  <Icon name="close" size={14} />
                </button>
              )}
            </header>
            <p>{result.summary}</p>
            <dl>
              {result.stats.map((stat) => (
                <div key={stat.label}>
                  <dt>{stat.label}</dt>
                  <dd>{stat.value}</dd>
                </div>
              ))}
            </dl>
            {result.tool === "optimize" &&
              (result.optimizedOrder?.length ?? 0) >= 3 && (
                <button
                  className="apply-result"
                  onClick={() =>
                    onApplyOptimizedOrder(result.optimizedOrder ?? [])
                  }
                  type="button"
                >
                  Apply order to planner <Icon name="arrow" size={14} />
                </button>
              )}
          </article>
        )}
      </div>
    </section>
  );
}
