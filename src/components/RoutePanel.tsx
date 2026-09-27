import {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { createPortal, flushSync } from "react-dom";
import { MINIMIZED_DISCOVERY_FILTERS } from "../discovery-categories";
import {
  coordinateLabel,
  meaningfulPlaceCategories,
  meaningfulPlaceName,
  placeAddress,
} from "../place-utils";
import { elevationPath, formatDistance, formatDuration } from "../route-utils";
import type {
  InspectionState,
  NavigationStatus,
  RouteMode,
  RouteResponse,
  SearchResult,
  SheetMode,
  Waypoint,
} from "../types";
import { usePlaceSearch } from "../use-place-search";
import { Icon } from "./Icon";

type RoutePanelProps = {
  activeDiscoveryCategory: string | null;
  focusOriginSelection: boolean;
  initialSheetMode: SheetMode;
  inspection: InspectionState | null;
  mode: RouteMode;
  navigationActive: boolean;
  navigationStatus: NavigationStatus;
  navigationShapeIndex: number | null;
  navigationNextTurnMeters: number | null;
  onAddInspection: () => void;
  onCloseInspection: () => void;
  onEndRoute: () => void;
  onExploreCategory: (category: string) => void;
  onModeChange: (mode: RouteMode) => void;
  waypoints: Waypoint[];
  onInsert: (afterIndex: number) => string | null;
  onSelectEmptyStop: (role: "origin" | "destination") => void;
  onUseCurrentLocation: () => void;
  onResolve: (id: string, result: SearchResult) => void;
  onReorder: (fromId: string, toId: string) => void;
  onRemove: (id: string) => void;
  onRename: (id: string, label: string) => void;
  onMoveSelect: (id: string | null) => void;
  onNavigateInspection: () => void;
  onSheetModeChange: (mode: SheetMode) => void;
  selectedWaypointId: string | null;
  route: RouteResponse | null;
  routeState: "idle" | "loading" | "ready" | "error";
  routeError: string | null;
  navigationProgress: number;
  onStartNavigation: () => void;
};

type ModeIcon = "walk" | "bike" | "car" | "bus" | "train";

const MODES: Array<{
  id: RouteMode;
  label: string;
  icon: ModeIcon;
  title: string;
  kicker: string;
}> = [
  {
    id: "walk",
    label: "Walk",
    icon: "walk",
    title: "Walk",
    kicker: "Pedestrian route",
  },
  {
    id: "bike",
    label: "Bike",
    icon: "bike",
    title: "Bike",
    kicker: "Bicycle route",
  },
  {
    id: "car",
    label: "Car",
    icon: "car",
    title: "Car",
    kicker: "Road route",
  },
  {
    id: "bus",
    label: "Bus",
    icon: "bus",
    title: "Bus",
    kicker: "Bus stops + road network",
  },
  {
    id: "train",
    label: "Train",
    icon: "train",
    title: "Train",
    kicker: "Rail connection",
  },
];

type StopDrag = {
  id: string;
  pointerId: number;
  left: number;
  top: number;
  width: number;
  offsetY: number;
};

type SheetDrag = {
  pointerId: number;
  startY: number;
  startHeight: number;
};

function stopLabel(
  index: number,
  length: number,
  routeRole?: Waypoint["routeRole"],
) {
  if (length === 1 && routeRole === "destination") return "B";
  if (index === 0) return "A";
  if (index === length - 1) return "B";
  return String(index);
}

function speed(distanceKm = 0, durationSeconds = 0) {
  if (distanceKm <= 0 || durationSeconds <= 0) return "—";
  return `${(distanceKm / (durationSeconds / 3_600)).toFixed(1)} km/h`;
}

function safeExternalWebsite(value: string | undefined) {
  if (!value) return null;
  try {
    const parsed = new URL(
      /^https?:\/\//i.test(value) ? value : `https://${value}`,
    );
    return ["http:", "https:"].includes(parsed.protocol) ? parsed.href : null;
  } catch {
    return null;
  }
}

function navigationLabel(status: NavigationStatus) {
  if (status === "locating") return "Locating";
  if (status === "off-route") return "Off route";
  if (status === "rerouting") return "Rerouting";
  if (status === "arrived") return "Arrived";
  return "Navigating";
}

function maneuverIcon(instruction: string | undefined) {
  const value = instruction?.toLowerCase() ?? "";
  if (value.includes("u-turn") || value.includes("uturn")) return "uTurn";
  if (value.includes("left")) return "turnLeft";
  if (value.includes("right")) return "turnRight";
  if (value.includes("arrive") || value.includes("destination")) return "pin";
  return "straight";
}

function mobileSheetBounds() {
  const expanded = Math.max(320, window.innerHeight - 86);
  return {
    minimized: Math.min(202, expanded),
    half: Math.min(expanded, Math.max(320, window.innerHeight * 0.5)),
    expanded,
  };
}

export function RoutePanel({
  activeDiscoveryCategory,
  focusOriginSelection,
  initialSheetMode,
  inspection,
  mode,
  navigationActive,
  navigationStatus,
  navigationShapeIndex,
  navigationNextTurnMeters,
  onAddInspection,
  onCloseInspection,
  onEndRoute,
  onExploreCategory,
  onModeChange,
  waypoints,
  onInsert,
  onSelectEmptyStop,
  onUseCurrentLocation,
  onResolve,
  onReorder,
  onRemove,
  onRename,
  onMoveSelect,
  onNavigateInspection,
  onSheetModeChange,
  selectedWaypointId,
  route,
  routeState,
  routeError,
  navigationProgress,
  onStartNavigation,
}: RoutePanelProps) {
  const [sheetMode, setSheetMode] = useState<SheetMode>(initialSheetMode);
  const [sheetHeight, setSheetHeight] = useState<number>();
  const [sheetDragging, setSheetDragging] = useState(false);
  const sheetDragRef = useRef<SheetDrag | null>(null);
  const sheetDragCleanupRef = useRef<(() => void) | null>(null);
  const sheetHeightRef = useRef<number | undefined>(undefined);
  const sheetMovedRef = useRef(false);
  const inspectionRevealedRef = useRef(Boolean(inspection?.revealed));
  const progressRailRef = useRef<HTMLDivElement>(null);
  const [stopDrag, setStopDrag] = useState<StopDrag | null>(null);
  const [inlineSearchId, setInlineSearchId] = useState<string | null>(null);
  const [inlineQuery, setInlineQuery] = useState("");
  const stopDragRef = useRef<StopDrag | null>(null);
  const inlineInputRef = useRef<HTMLInputElement>(null);
  const elevation = route?.elevation;
  const samples = useMemo(() => elevation?.samples ?? [], [elevation?.samples]);
  const chartPath = useMemo(() => elevationPath(samples), [samples]);
  const modeInfo = MODES.find((item) => item.id === mode) ?? MODES[0]!;
  const activeStopIndex = stopDrag
    ? waypoints.findIndex((point) => point.id === stopDrag.id)
    : -1;
  const activeStop = activeStopIndex >= 0 ? waypoints[activeStopIndex] : null;
  const isOutdoor = mode === "walk" || mode === "bike";
  const inlineWaypoint = waypoints.find(
    (waypoint) => waypoint.id === inlineSearchId,
  );
  const inlineSearch = usePlaceSearch(inlineQuery, {
    lat: inlineWaypoint?.lat ?? 0,
    lon: inlineWaypoint?.lon ?? 0,
  });

  useEffect(() => {
    if (!inlineWaypoint) return;
    inlineInputRef.current?.focus();
  }, [inlineWaypoint]);

  useEffect(() => {
    onSheetModeChange(sheetMode);
  }, [onSheetModeChange, sheetMode]);

  useEffect(() => {
    if (sheetMode !== "minimized") return;
    const panToProgress = () => {
      const rail = progressRailRef.current;
      if (!rail) return;
      const maxScroll = Math.max(0, rail.scrollWidth - rail.clientWidth);
      const travelPosition = navigationProgress * rail.scrollWidth;
      const target = Math.max(
        0,
        Math.min(maxScroll, travelPosition - rail.clientWidth * 0.42),
      );
      rail.scrollLeft = target;
    };
    const frame = window.requestAnimationFrame(() => {
      panToProgress();
      window.requestAnimationFrame(panToProgress);
    });
    const settledLayout = window.setTimeout(panToProgress, 180);
    return () => {
      window.cancelAnimationFrame(frame);
      window.clearTimeout(settledLayout);
    };
  }, [navigationProgress, sheetMode, waypoints.length]);

  const sheetHeightFor = (mode: SheetMode) => mobileSheetBounds()[mode];

  const nearestSheetMode = (height: number): SheetMode => {
    const bounds = mobileSheetBounds();
    return (Object.keys(bounds) as SheetMode[]).reduce((closest, mode) =>
      Math.abs(bounds[mode] - height) < Math.abs(bounds[closest] - height)
        ? mode
        : closest,
    );
  };

  const setLiveSheetHeight = (height: number) => {
    sheetHeightRef.current = height;
    document.documentElement.style.setProperty(
      "--active-sheet-height",
      `${height}px`,
    );
    setSheetHeight(height);
  };

  const snapSheet = (mode: SheetMode) => {
    setSheetMode(mode);
    setLiveSheetHeight(sheetHeightFor(mode));
  };

  useEffect(() => {
    const wasRevealed = inspectionRevealedRef.current;
    const isRevealed = Boolean(inspection?.revealed);
    inspectionRevealedRef.current = isRevealed;
    if (!wasRevealed && isRevealed && sheetMode === "minimized") {
      const height = mobileSheetBounds().half;
      setSheetMode("half");
      sheetHeightRef.current = height;
      document.documentElement.style.setProperty(
        "--active-sheet-height",
        `${height}px`,
      );
      setSheetHeight(height);
    }
  }, [inspection?.revealed, sheetMode]);

  useEffect(() => {
    if (!focusOriginSelection || window.innerWidth > 760) return;
    const frame = window.requestAnimationFrame(() => {
      const expanded = Math.max(320, window.innerHeight - 86);
      const height = Math.min(
        expanded,
        Math.max(320, window.innerHeight * 0.5),
      );
      setSheetMode("half");
      sheetHeightRef.current = height;
      document.documentElement.style.setProperty(
        "--active-sheet-height",
        `${height}px`,
      );
      setSheetHeight(height);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [focusOriginSelection]);

  const startSheetDrag = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (window.innerWidth > 760) return;
    const panel = event.currentTarget.closest<HTMLElement>(".route-panel");
    if (!panel) return;
    event.preventDefault();
    sheetMovedRef.current = false;
    const height = panel.getBoundingClientRect().height;
    const drag: SheetDrag = {
      pointerId: event.pointerId,
      startY: event.clientY,
      startHeight: height,
    };
    sheetDragRef.current = drag;
    sheetHeightRef.current = height;
    setSheetDragging(true);
    let cleanup = () => {};
    const move = (pointerEvent: PointerEvent) => {
      if (pointerEvent.pointerId !== drag.pointerId) return;
      pointerEvent.preventDefault();
      const bounds = mobileSheetBounds();
      const delta = drag.startY - pointerEvent.clientY;
      if (Math.abs(delta) > 3) sheetMovedRef.current = true;
      setLiveSheetHeight(
        Math.max(
          bounds.minimized,
          Math.min(bounds.expanded, drag.startHeight + delta),
        ),
      );
    };
    const finish = (pointerEvent: PointerEvent) => {
      if (pointerEvent.pointerId !== drag.pointerId) return;
      const current = sheetHeightRef.current ?? drag.startHeight;
      const order: SheetMode[] = ["minimized", "half", "expanded"];
      const startMode = nearestSheetMode(drag.startHeight);
      let destination = nearestSheetMode(current);
      const gestureDelta = pointerEvent.clientY - drag.startY;
      if (Math.abs(gestureDelta) > 36 && destination === startMode) {
        const direction = gestureDelta > 0 ? -1 : 1;
        const nextIndex = Math.max(
          0,
          Math.min(order.length - 1, order.indexOf(startMode) + direction),
        );
        destination = order[nextIndex]!;
      }
      snapSheet(destination);
      sheetDragRef.current = null;
      setSheetDragging(false);
      cleanup();
    };
    cleanup = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", finish);
      window.removeEventListener("pointercancel", finish);
      if (sheetDragCleanupRef.current === cleanup) {
        sheetDragCleanupRef.current = null;
      }
    };
    sheetDragCleanupRef.current?.();
    sheetDragCleanupRef.current = cleanup;
    window.addEventListener("pointermove", move, { passive: false });
    window.addEventListener("pointerup", finish);
    window.addEventListener("pointercancel", finish);
  };

  useEffect(() => () => sheetDragCleanupRef.current?.(), []);

  const animateReorder = useCallback(
    (fromId: string, toId: string) => {
      const transitionDocument = document as Document & {
        startViewTransition?: (callback: () => void) => void;
      };
      if (transitionDocument.startViewTransition) {
        transitionDocument.startViewTransition(() => {
          flushSync(() => onReorder(fromId, toId));
        });
      } else {
        onReorder(fromId, toId);
      }
    },
    [onReorder],
  );

  const startStopDrag = (
    event: ReactPointerEvent<HTMLDivElement>,
    waypoint: Waypoint,
  ) => {
    if (event.button !== 0) return;
    if ((event.target as HTMLElement).closest("button,input,a")) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const drag: StopDrag = {
      id: waypoint.id,
      pointerId: event.pointerId,
      left: rect.left,
      top: rect.top,
      width: rect.width,
      offsetY: event.clientY - rect.top,
    };
    stopDragRef.current = drag;
    setStopDrag(drag);
  };

  const stopDragging = stopDrag !== null;
  useEffect(() => {
    if (!stopDragging) return;
    const moveDrag = (event: PointerEvent) => {
      const drag = stopDragRef.current;
      if (!drag || drag.pointerId !== event.pointerId) return;
      event.preventDefault();
      const next = { ...drag, top: event.clientY - drag.offsetY };
      stopDragRef.current = next;
      setStopDrag(next);
      const target = document
        .elementFromPoint(event.clientX, event.clientY)
        ?.closest<HTMLElement>("[data-stop-id]");
      const targetId = target?.dataset.stopId;
      if (targetId && targetId !== drag.id) animateReorder(drag.id, targetId);
    };
    const endDrag = (event: PointerEvent) => {
      const drag = stopDragRef.current;
      if (!drag || drag.pointerId !== event.pointerId) return;
      stopDragRef.current = null;
      setStopDrag(null);
    };
    window.addEventListener("pointermove", moveDrag, { passive: false });
    window.addEventListener("pointerup", endDrag);
    window.addEventListener("pointercancel", endDrag);
    return () => {
      window.removeEventListener("pointermove", moveDrag);
      window.removeEventListener("pointerup", endDrag);
      window.removeEventListener("pointercancel", endDrag);
    };
  }, [animateReorder, stopDragging]);

  const panelStyle = (
    sheetHeight ? { "--sheet-height": `${sheetHeight}px` } : {}
  ) as CSSProperties;

  const routeDistance = route?.summary?.distanceKm;
  const routeDuration = route?.summary?.durationSeconds;
  const routeCoordinateCount = route?.geometry?.coordinates?.length ?? 0;
  const progressShapeIndex =
    navigationActive && navigationShapeIndex !== null
      ? navigationShapeIndex
      : Math.round(navigationProgress * Math.max(0, routeCoordinateCount - 1));
  const maneuvers = route?.maneuvers ?? [];
  const nextManeuver =
    maneuvers.find(
      (maneuver) =>
        (maneuver.shapeIndex ?? 0) >=
        progressShapeIndex + (navigationActive ? 0.001 : 0),
    ) ?? maneuvers[maneuvers.length - 1];
  const nextTurnDistanceKm =
    navigationActive && navigationNextTurnMeters !== null
      ? navigationNextTurnMeters / 1000
      : nextManeuver?.distanceKm;
  const compactMetrics = [
    { label: "Distance", value: formatDistance(routeDistance) },
    { label: "Time", value: formatDuration(routeDuration) },
    ...(mode === "bike"
      ? [
          { label: "Average", value: speed(routeDistance, routeDuration) },
          {
            label: "Gain",
            value: `${Math.round(elevation?.gainMeters ?? 0)} m`,
          },
          {
            label: "High",
            value: `${Math.round(elevation?.maxMeters ?? 0)} m`,
          },
        ]
      : mode === "walk"
        ? [
            {
              label: "Gain",
              value: `${Math.round(elevation?.gainMeters ?? 0)} m`,
            },
            {
              label: "Loss",
              value: `${Math.round(elevation?.lossMeters ?? 0)} m`,
            },
            {
              label: "High",
              value: `${Math.round(elevation?.maxMeters ?? 0)} m`,
            },
          ]
        : [
            { label: "Stops", value: String(waypoints.length) },
            {
              label: "Profile",
              value: mode === "car" ? "Auto" : mode === "bus" ? "Bus" : "Rail",
            },
          ]),
  ];

  return (
    <aside
      className={`route-panel glass sheet--${sheetMode} ${sheetMode !== "minimized" ? "is-open" : ""} ${sheetMode === "expanded" ? "is-expanded" : ""} ${inspection ? "has-inspection" : ""} ${sheetDragging ? "is-dragging-sheet" : ""}`}
      data-navigation-progress={navigationProgress.toFixed(4)}
      data-navigation-status={navigationStatus}
      data-sheet-mode={sheetMode}
      aria-label="Route planner"
      style={panelStyle}
    >
      <button
        aria-expanded={sheetMode === "expanded"}
        aria-label={
          sheetMode === "expanded"
            ? "Collapse route planner"
            : "Expand route planner"
        }
        className="mobile-sheet-handle"
        onClick={() => {
          if (sheetMovedRef.current) {
            sheetMovedRef.current = false;
            return;
          }
          snapSheet(sheetMode === "expanded" ? "half" : "expanded");
        }}
        onPointerDown={startSheetDrag}
        type="button"
      >
        <span />
      </button>

      <header className="route-panel__header">
        <div>
          <span className="kicker">{modeInfo.kicker}</span>
          <h1>{modeInfo.title}</h1>
        </div>
        <div
          className={`live-indicator ${routeState === "error" ? "is-error" : ""} ${navigationActive ? `is-${navigationStatus}` : ""}`}
        >
          <span />{" "}
          {navigationActive
            ? navigationLabel(navigationStatus)
            : routeState === "loading"
              ? "Routing"
              : routeState === "error"
                ? "Retry"
                : routeState === "ready"
                  ? "Live"
                  : "Plan"}
        </div>
      </header>

      <div className="mode-switch" aria-label="Travel mode">
        {MODES.map((item) => (
          <button
            aria-label={item.label}
            aria-pressed={mode === item.id}
            className={mode === item.id ? "is-active" : ""}
            key={item.id}
            onClick={() => onModeChange(item.id)}
            title={item.label}
            type="button"
          >
            <Icon name={item.icon} size={17} />
            <span>{item.label}</span>
          </button>
        ))}
      </div>

      <section className="route-summary" aria-label="Route summary">
        {sheetMode === "minimized" && route && (
          <div className="minimized-metrics">
            {compactMetrics.map((metric) => (
              <div key={metric.label}>
                <small>{metric.label}</small>
                <strong>{metric.value}</strong>
              </div>
            ))}
          </div>
        )}
        <div className="stat-primary">
          <strong>{formatDistance(routeDistance)}</strong>
          <span>{formatDuration(routeDuration)}</span>
        </div>
        <div className="stat-grid">
          {mode === "bike" ? (
            <>
              <div>
                <small>Average</small>
                <strong>{speed(routeDistance, routeDuration)}</strong>
              </div>
              <div>
                <small>Gain</small>
                <strong>{Math.round(elevation?.gainMeters ?? 0)} m</strong>
              </div>
              <div>
                <small>High</small>
                <strong>{Math.round(elevation?.maxMeters ?? 0)} m</strong>
              </div>
            </>
          ) : mode === "car" ? (
            <>
              <div>
                <small>ETA</small>
                <strong>{formatDuration(routeDuration)}</strong>
              </div>
              <div>
                <small>Stops</small>
                <strong>{waypoints.length}</strong>
              </div>
              <div>
                <small>Profile</small>
                <strong>Auto</strong>
              </div>
            </>
          ) : mode === "bus" || mode === "train" ? (
            <>
              <div>
                <small>ETA</small>
                <strong>{formatDuration(routeDuration)}</strong>
              </div>
              <div>
                <small>Stops</small>
                <strong>{waypoints.length}</strong>
              </div>
              <div>
                <small>Network</small>
                <strong>{mode === "bus" ? "Bus stops" : "Rail"}</strong>
              </div>
            </>
          ) : (
            <>
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
            </>
          )}
        </div>
        {sheetMode === "minimized" && route && (
          <div className="minimized-next-turn">
            <span
              className="minimized-next-turn__icon"
              data-maneuver-icon={maneuverIcon(nextManeuver?.instruction)}
            >
              <Icon name={maneuverIcon(nextManeuver?.instruction)} size={17} />
            </span>
            <span>
              <small>
                {navigationStatus === "rerouting"
                  ? "Rerouting"
                  : navigationStatus === "off-route"
                    ? "Off route"
                    : navigationStatus === "arrived"
                      ? "Arrival"
                      : "Next turn"}
              </small>
              <strong>
                {navigationStatus === "rerouting"
                  ? "Calculating a new route…"
                  : navigationStatus === "off-route"
                    ? "Return to the route or continue for rerouting"
                    : navigationStatus === "arrived"
                      ? "You have arrived"
                      : (nextManeuver?.instruction ?? "Route ready")}
              </strong>
            </span>
            {nextTurnDistanceKm !== undefined &&
              navigationStatus !== "rerouting" && (
                <b>{formatDistance(nextTurnDistanceKm)}</b>
              )}
          </div>
        )}
        {sheetMode === "minimized" && route && (
          <div
            ref={progressRailRef}
            aria-label={`Route navigation progress ${Math.round(navigationProgress * 100)}%`}
            className="minimized-route-progress"
          >
            <div
              className="minimized-route-progress__content"
              style={
                {
                  "--route-progress": `${Math.round(navigationProgress * 100)}%`,
                  "--traveler-position": `${5 + navigationProgress * 90}%`,
                  "--route-content-width": `${Math.max(360, waypoints.length * 116)}px`,
                } as CSSProperties
              }
            >
              <span className="minimized-route-progress__line" />
              <span className="minimized-route-progress__traveler" />
              {waypoints.map((waypoint, index) => (
                <span
                  aria-hidden="true"
                  className={`minimized-waypoint ${index === 0 ? "is-first" : ""} ${index === waypoints.length - 1 ? "is-last" : ""} ${navigationProgress >= index / Math.max(1, waypoints.length - 1) ? "is-passed" : ""}`}
                  key={waypoint.id}
                  style={
                    {
                      "--waypoint-position": `${5 + (index / Math.max(1, waypoints.length - 1)) * 90}%`,
                    } as CSSProperties
                  }
                >
                  <i />
                  <small title={waypoint.label}>{waypoint.label}</small>
                </span>
              ))}
            </div>
          </div>
        )}
        {sheetMode === "minimized" && route && (
          <div className="minimized-route-actions">
            <button
              disabled={navigationActive}
              onClick={onStartNavigation}
              type="button"
            >
              <Icon name={navigationActive ? "locate" : "play"} size={13} />
              {navigationActive
                ? navigationLabel(navigationStatus)
                : "Start route"}
            </button>
            <button onClick={onEndRoute} type="button">
              <Icon name="close" size={13} />
              End route
            </button>
          </div>
        )}
        {sheetMode === "minimized" && !route && (
          <section
            aria-label="Explore this area"
            className="minimized-empty-state"
          >
            <div className="minimized-empty-state__heading">
              <span>
                <strong>Explore this area</strong>
                <small>Find somewhere nearby or start a route.</small>
              </span>
            </div>
            <button
              className="minimized-empty-state__search"
              onClick={() => onSelectEmptyStop("destination")}
              type="button"
            >
              <Icon name="search" size={14} />
              Where to?
            </button>
            <div
              aria-label="Nearby categories"
              className="minimized-empty-state__categories"
            >
              {MINIMIZED_DISCOVERY_FILTERS.map((filter) => (
                <button
                  aria-label={`Explore ${filter.label.toLowerCase()} nearby`}
                  aria-pressed={activeDiscoveryCategory === filter.id}
                  className={
                    activeDiscoveryCategory === filter.id ? "is-active" : ""
                  }
                  key={filter.id}
                  onClick={() => onExploreCategory(filter.id)}
                  type="button"
                >
                  <Icon name={filter.icon} size={15} />
                  <span>{filter.label}</span>
                </button>
              ))}
            </div>
          </section>
        )}
      </section>

      <div className="sheet-detail">
        {inspection && (
          <section
            className="inspection-card"
            aria-label="Selected place details"
          >
            <header>
              <span>Selected map point</span>
              <button
                aria-label="Close place details"
                onClick={onCloseInspection}
                type="button"
              >
                <Icon name="close" size={15} />
              </button>
            </header>
            {inspection.status === "loading" ? (
              <p className="inspection-card__status">
                <span className="search-spinner" /> Reading nearby map data
              </p>
            ) : (
              <>
                {(() => {
                  const isBuilding =
                    inspection.fallbackLabel === "Selected building";
                  const address = placeAddress(inspection.place);
                  const name = meaningfulPlaceName(inspection.place);
                  const categories = meaningfulPlaceCategories(
                    inspection.place,
                  ).join(" · ");
                  const coordinates = coordinateLabel(inspection.coordinate);
                  const title = isBuilding
                    ? address || name || "Selected building"
                    : name ||
                      address ||
                      inspection.fallbackLabel ||
                      coordinates;
                  const subtitle = isBuilding
                    ? coordinates
                    : address ||
                      [categories, name ? coordinates : null]
                        .filter(Boolean)
                        .join(" · ");
                  return (
                    <>
                      <strong>{title}</strong>
                      {subtitle && <p>{subtitle}</p>}
                    </>
                  );
                })()}
                {inspection.status === "error" && <p>{inspection.message}</p>}
                {inspection.status === "ready" &&
                  !inspection.place &&
                  inspection.fallbackLabel && (
                    <p>
                      No mapped street address is available for this building.
                    </p>
                  )}
                <div className="inspection-card__links">
                  {(() => {
                    const phone =
                      inspection.place?.properties.phone ??
                      inspection.place?.properties["contact:phone"];
                    return phone ? (
                      <a
                        aria-label="Call selected place"
                        href={`tel:${phone.replace(/[^+\d(). -]/g, "")}`}
                      >
                        <Icon name="phone" size={16} />
                      </a>
                    ) : null;
                  })()}
                  {(() => {
                    const website = safeExternalWebsite(
                      inspection.place?.properties.website ??
                        inspection.place?.properties["contact:website"],
                    );
                    return website ? (
                      <a
                        aria-label="Open selected place website"
                        href={website}
                        rel="noreferrer"
                        target="_blank"
                      >
                        <Icon name="globe" size={16} />
                      </a>
                    ) : null;
                  })()}
                  {inspection.place?.sources[0]?.url && (
                    <a
                      aria-label="Open selected place in OpenStreetMap"
                      href={inspection.place.sources[0].url}
                      rel="noreferrer"
                      target="_blank"
                    >
                      <Icon name="pin" size={16} />
                    </a>
                  )}
                </div>
                <div className="inspection-card__actions">
                  <button onClick={onAddInspection} type="button">
                    <Icon name="plus" size={16} />
                    Add to route
                  </button>
                  <button onClick={onNavigateInspection} type="button">
                    <Icon name="route" size={16} />
                    Navigate
                  </button>
                </div>
              </>
            )}
          </section>
        )}
        <section className="stops" aria-label="Route stops">
          <div className="section-heading">
            <span>Stops</span>
            <small>drag anywhere · tap pin to place</small>
          </div>
          <div className="stop-list">
            {(waypoints.length === 0 ||
              (waypoints.length === 1 &&
                waypoints[0]?.routeRole === "destination")) && (
              <div
                className={`empty-stop-row ${focusOriginSelection ? "is-selecting" : ""}`}
                data-route-role="origin"
              >
                <span className="stop-index">A</span>
                <div className="empty-stop-actions">
                  <button
                    onClick={() => onSelectEmptyStop("origin")}
                    type="button"
                  >
                    Select on map or search
                  </button>
                  <button onClick={onUseCurrentLocation} type="button">
                    Current location
                  </button>
                </div>
              </div>
            )}
            {waypoints.map((waypoint, index) => (
              <Fragment key={waypoint.id}>
                <div
                  aria-label={`Route stop ${stopLabel(index, waypoints.length, waypoint.routeRole)}: ${waypoint.label}`}
                  className={`stop-row ${selectedWaypointId === waypoint.id ? "is-moving" : ""} ${stopDrag?.id === waypoint.id ? "is-dragging" : ""}`}
                  data-stop-id={waypoint.id}
                  onPointerDown={(event) => startStopDrag(event, waypoint)}
                  style={{
                    viewTransitionName: `stop-${waypoint.id.replace(/[^a-zA-Z0-9_-]/g, "")}`,
                  }}
                >
                  <span className={`stop-index stop-index--${index}`}>
                    {stopLabel(index, waypoints.length, waypoint.routeRole)}
                  </span>
                  <Icon name="grip" size={15} />
                  <input
                    ref={
                      inlineSearchId === waypoint.id
                        ? inlineInputRef
                        : undefined
                    }
                    aria-label={`Stop ${index + 1}`}
                    onChange={(event) => {
                      const value = event.target.value;
                      onRename(waypoint.id, value);
                      if (inlineSearchId === waypoint.id) setInlineQuery(value);
                    }}
                    onKeyDown={(event) => {
                      if (
                        event.key === "Escape" &&
                        inlineSearchId === waypoint.id
                      ) {
                        setInlineSearchId(null);
                        setInlineQuery("");
                        event.currentTarget.blur();
                      }
                    }}
                    placeholder={
                      inlineSearchId === waypoint.id ? "Search stop" : undefined
                    }
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
                          selectedWaypointId === waypoint.id
                            ? null
                            : waypoint.id,
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
                {inlineSearchId === waypoint.id &&
                  inlineQuery.trim().length >= 2 && (
                    <div
                      aria-label="Stop search suggestions"
                      className="inline-stop-results"
                      role="listbox"
                    >
                      {inlineSearch.status === "loading" && (
                        <p>
                          <span className="search-spinner" /> Searching nearby
                        </p>
                      )}
                      {inlineSearch.status === "error" && (
                        <p>Search is unavailable. Try again.</p>
                      )}
                      {inlineSearch.status === "idle" &&
                        inlineSearch.results.length === 0 && (
                          <p>No matching places found.</p>
                        )}
                      {inlineSearch.results.map((result, resultIndex) => (
                        <button
                          key={
                            result.id ??
                            `${result.displayName ?? "result"}-${resultIndex}`
                          }
                          onClick={() => {
                            onResolve(waypoint.id, result);
                            setInlineSearchId(null);
                            setInlineQuery("");
                          }}
                          role="option"
                          type="button"
                        >
                          <span className="result-icon">
                            <Icon
                              name={
                                result.kind === "place" ? "mountain" : "pin"
                              }
                              size={15}
                            />
                          </span>
                          <span>
                            <strong>
                              {result.name ??
                                result.displayName ??
                                "Unnamed place"}
                            </strong>
                            <small>
                              {result.displayName ??
                                result.category ??
                                result.kind}
                            </small>
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                {index < waypoints.length - 1 && (
                  <button
                    aria-label={`Add stop between ${waypoint.label} and ${waypoints[index + 1]!.label}`}
                    className="insert-stop"
                    disabled={waypoints.length >= 10}
                    onClick={() => {
                      const id = onInsert(index);
                      if (!id) return;
                      setInlineSearchId(id);
                      setInlineQuery("");
                    }}
                    type="button"
                  >
                    <Icon name="plus" size={13} />
                  </button>
                )}
              </Fragment>
            ))}
            {(waypoints.length === 0 ||
              (waypoints.length === 1 &&
                waypoints[0]?.routeRole !== "destination")) && (
              <div
                className={`empty-stop-row ${selectedWaypointId === "pending-destination" ? "is-selecting" : ""}`}
                data-route-role="destination"
              >
                <span className="stop-index">B</span>
                <div className="empty-stop-actions">
                  <button
                    onClick={() => onSelectEmptyStop("destination")}
                    type="button"
                  >
                    Select on map or search
                  </button>
                </div>
              </div>
            )}
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

        {isOutdoor ? (
          <>
            {chartPath && (
              <section
                className="elevation-card"
                aria-label="Elevation profile"
              >
                <div className="section-heading">
                  <span>
                    {mode === "bike" ? "Ride elevation" : "Walk elevation"}
                  </span>
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
                    <linearGradient
                      id="elevation-fill"
                      x1="0"
                      x2="0"
                      y1="0"
                      y2="1"
                    >
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
          </>
        ) : (
          <section className={`mode-card mode-card--${mode}`}>
            <span className="mode-card__icon">
              <Icon name={modeInfo.icon} size={20} />
            </span>
            <div>
              <strong>
                {mode === "car"
                  ? "Road overview"
                  : mode === "bus"
                    ? "Bus-stop network route"
                    : "Rail and light-rail connection"}
              </strong>
              <p>
                {mode === "car"
                  ? "A road-network route with ordered stops and turn-by-turn maneuvers. Live traffic is not inferred."
                  : mode === "bus"
                    ? "Routes on the bus-capable road graph and references mapped OpenStreetMap bus stops. Live arrivals and agency schedules are not included."
                    : "References mapped railway tracks, stations, and light-rail stations for the rail preview. Confirm live service and schedules with the operator."}
              </p>
            </div>
          </section>
        )}

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
      </div>

      {stopDrag &&
        activeStop &&
        createPortal(
          <div
            aria-hidden="true"
            className="stop-drag-ghost"
            style={{
              left: stopDrag.left,
              top: stopDrag.top,
              width: stopDrag.width,
            }}
          >
            <span className="stop-index">
              {stopLabel(
                activeStopIndex,
                waypoints.length,
                activeStop?.routeRole,
              )}
            </span>
            <Icon name="grip" size={15} />
            <strong>{activeStop.label}</strong>
          </div>,
          document.body,
        )}
    </aside>
  );
}
