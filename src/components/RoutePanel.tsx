import { useMemo, useState } from "react";
import { elevationPath, formatDistance, formatDuration } from "../route-utils";
import type { RouteMode, RouteResponse, Waypoint } from "../types";
import { Icon } from "./Icon";

type RoutePanelProps = {
  mode: RouteMode;
  onModeChange: (mode: RouteMode) => void;
  waypoints: Waypoint[];
  onReorder: (fromId: string, toId: string) => void;
  onRemove: (id: string) => void;
  onRename: (id: string, label: string) => void;
  onMoveSelect: (id: string | null) => void;
  selectedWaypointId: string | null;
  route: RouteResponse | null;
  routeState: "idle" | "loading" | "ready" | "error";
  routeError: string | null;
  replayProgress: number;
  replaying: boolean;
  replaySpeed: number;
  onReplayProgress: (progress: number) => void;
  onReplayToggle: () => void;
  onReplayRestart: () => void;
  onReplaySpeed: (speed: number) => void;
};

const MODES: Array<{
  id: RouteMode;
  label: string;
  icon: "walk" | "run" | "bike";
}> = [
  { id: "hike", label: "Hike", icon: "walk" },
  { id: "run", label: "Run", icon: "run" },
  { id: "bike", label: "Bike", icon: "bike" },
];

export function RoutePanel({
  mode,
  onModeChange,
  waypoints,
  onReorder,
  onRemove,
  onRename,
  onMoveSelect,
  selectedWaypointId,
  route,
  routeState,
  routeError,
  replayProgress,
  replaying,
  replaySpeed,
  onReplayProgress,
  onReplayToggle,
  onReplayRestart,
  onReplaySpeed,
}: RoutePanelProps) {
  const [mobileExpanded, setMobileExpanded] = useState(false);
  const elevation = route?.elevation;
  const samples = useMemo(() => elevation?.samples ?? [], [elevation?.samples]);
  const chartPath = useMemo(() => elevationPath(samples), [samples]);

  return (
    <aside
      className={`route-panel glass ${mobileExpanded ? "is-expanded" : ""}`}
      aria-label="Route planner"
    >
      <button
        aria-expanded={mobileExpanded}
        aria-label={
          mobileExpanded ? "Collapse route planner" : "Expand route planner"
        }
        className="mobile-sheet-handle"
        onClick={() => setMobileExpanded((value) => !value)}
        type="button"
      >
        <span />
      </button>

      <header className="route-panel__header">
        <div>
          <span className="kicker">Mapsourced route</span>
          <h1>Trail plan</h1>
        </div>
        <div
          className={`live-indicator ${routeState === "error" ? "is-error" : ""}`}
        >
          <span />{" "}
          {routeState === "loading"
            ? "Routing"
            : routeState === "error"
              ? "Retry"
              : "Live"}
        </div>
      </header>

      <div className="mode-switch" aria-label="Travel mode">
        {MODES.map((item) => (
          <button
            aria-pressed={mode === item.id}
            className={mode === item.id ? "is-active" : ""}
            key={item.id}
            onClick={() => onModeChange(item.id)}
            type="button"
          >
            <Icon name={item.icon} size={17} />
            {item.label}
          </button>
        ))}
      </div>

      <section className="stops" aria-label="Route stops">
        <div className="section-heading">
          <span>Stops</span>
          <small>drag pins or tap move</small>
        </div>
        <div className="stop-list">
          {waypoints.map((waypoint, index) => (
            <div
              className={`stop-row ${selectedWaypointId === waypoint.id ? "is-moving" : ""}`}
              draggable
              key={waypoint.id}
              onDragOver={(event) => event.preventDefault()}
              onDragStart={(event) =>
                event.dataTransfer.setData("text/plain", waypoint.id)
              }
              onDrop={(event) => {
                event.preventDefault();
                const fromId = event.dataTransfer.getData("text/plain");
                if (fromId) onReorder(fromId, waypoint.id);
              }}
            >
              <span className={`stop-index stop-index--${index}`}>
                {index === 0
                  ? "A"
                  : index === waypoints.length - 1
                    ? "B"
                    : index + 1}
              </span>
              <Icon name="grip" size={16} />
              <input
                aria-label={`Stop ${index + 1}`}
                onChange={(event) => onRename(waypoint.id, event.target.value)}
                value={waypoint.label}
              />
              <div className="stop-actions">
                <button
                  aria-label={`Move ${waypoint.label} on map`}
                  className={
                    selectedWaypointId === waypoint.id ? "is-active" : ""
                  }
                  onClick={() =>
                    onMoveSelect(
                      selectedWaypointId === waypoint.id ? null : waypoint.id,
                    )
                  }
                  title="Move on map"
                  type="button"
                >
                  <Icon name="pin" size={15} />
                </button>
                {waypoints.length > 2 && (
                  <button
                    aria-label={`Remove ${waypoint.label}`}
                    onClick={() => onRemove(waypoint.id)}
                    type="button"
                  >
                    <Icon name="close" size={15} />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
        {selectedWaypointId && (
          <p className="move-hint">
            Tap the map to place this stop, or drag its marker.
          </p>
        )}
      </section>

      {routeError && (
        <div className="route-error">
          <strong>Route unavailable</strong>
          <span>{routeError}</span>
        </div>
      )}

      <section className="route-summary" aria-label="Route summary">
        <div className="stat-primary">
          <strong>{formatDistance(route?.summary?.distanceKm)}</strong>
          <span>{formatDuration(route?.summary?.durationSeconds)}</span>
        </div>
        <div className="stat-grid">
          <div>
            <small>Gain</small>
            <strong>{Math.round(elevation?.gainMeters ?? 0)} m</strong>
          </div>
          <div>
            <small>Loss</small>
            <strong>{Math.round(elevation?.lossMeters ?? 0)} m</strong>
          </div>
          <div>
            <small>High</small>
            <strong>{Math.round(elevation?.maxMeters ?? 0)} m</strong>
          </div>
        </div>
      </section>

      {chartPath && (
        <section className="elevation-card" aria-label="Elevation profile">
          <div className="section-heading">
            <span>Elevation</span>
            <small>
              {Math.round(elevation?.minMeters ?? 0)}–
              {Math.round(elevation?.maxMeters ?? 0)} m
            </small>
          </div>
          <svg
            aria-hidden="true"
            preserveAspectRatio="none"
            viewBox="0 0 320 78"
          >
            <defs>
              <linearGradient id="elevation-fill" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0" stopColor="#d8ed9d" stopOpacity=".48" />
                <stop offset="1" stopColor="#d8ed9d" stopOpacity="0" />
              </linearGradient>
            </defs>
            <path
              d={`${chartPath} L320,78 L0,78 Z`}
              fill="url(#elevation-fill)"
            />
            <path
              d={chartPath}
              fill="none"
              stroke="#d8ed9d"
              strokeWidth="2"
              vectorEffect="non-scaling-stroke"
            />
          </svg>
        </section>
      )}

      <section className="replay-card" aria-label="Route replay">
        <div className="section-heading">
          <span>Route replay</span>
          <small>{Math.round(replayProgress * 100)}%</small>
        </div>
        <input
          aria-label="Replay progress"
          max="1"
          min="0"
          onChange={(event) => onReplayProgress(Number(event.target.value))}
          step="0.001"
          type="range"
          value={replayProgress}
        />
        <div className="replay-controls">
          <button
            aria-label="Restart replay"
            className="round-control"
            onClick={onReplayRestart}
            type="button"
          >
            <Icon name="restart" size={17} />
          </button>
          <button
            aria-label={replaying ? "Pause replay" : "Play replay"}
            className="play-control"
            onClick={onReplayToggle}
            type="button"
          >
            <Icon name={replaying ? "pause" : "play"} size={18} />
          </button>
          <div className="speed-control" aria-label="Replay speed">
            {[1, 2, 4].map((speed) => (
              <button
                className={replaySpeed === speed ? "is-active" : ""}
                key={speed}
                onClick={() => onReplaySpeed(speed)}
                type="button"
              >
                {speed}×
              </button>
            ))}
          </div>
        </div>
      </section>

      {route?.maneuvers && route.maneuvers.length > 0 && (
        <details className="directions">
          <summary>
            Turn-by-turn <span>{route.maneuvers.length} steps</span>
          </summary>
          <ol>
            {route.maneuvers.map((maneuver, index) => (
              <li key={`${maneuver.shapeIndex}-${index}`}>
                <span>{index + 1}</span>
                <p>
                  {maneuver.instruction}
                  <small>{formatDistance(maneuver.distanceKm)}</small>
                </p>
              </li>
            ))}
          </ol>
        </details>
      )}

      <footer className="route-provenance">
        <span>
          Powered by{" "}
          <a href="https://mapsource.io" rel="noreferrer" target="_blank">
            Mapsource
          </a>
        </span>
        <span>© OpenStreetMap contributors</span>
      </footer>
    </aside>
  );
}
