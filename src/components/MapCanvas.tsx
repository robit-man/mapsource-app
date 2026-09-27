import { useEffect, useRef, useState } from "react";
import { magvar } from "magvar";
import {
  AttributionControl,
  LngLatBounds,
  Map as MapLibreMap,
  Marker as MapLibreMarker,
  NavigationControl,
  Popup,
  setWorkerUrl,
  type GeoJSONSource,
  type MapMouseEvent,
  type Marker,
} from "maplibre-gl";
import type {
  Feature,
  FeatureCollection,
  LineString,
  Polygon,
  Position,
} from "geojson";
import {
  bearingDegrees,
  lineAtProgress,
  nearestRouteBearing,
  pointAtProgress,
} from "../route-utils";
import { LocationSmoother } from "../location-smoothing";
import {
  magneticHeadingToTrue,
  navigationHeading,
  orientationHeading,
} from "../orientation";
import type { InitialMapLocation } from "../initial-map-location";
import type {
  Coordinate,
  DiscoveryPlace,
  MapSurface,
  RouteMode,
  RouteResponse,
  UserLocationFix,
  ViewBounds,
  Waypoint,
} from "../types";

setWorkerUrl("/assets/maplibre-gl-worker.mjs");

type MapCanvasProps = {
  waypoints: Waypoint[];
  route: RouteResponse | null;
  heldPointDetails: { title: string; detail?: string } | null;
  initialLocation: InitialMapLocation | null;
  mode: RouteMode;
  navigationActive: boolean;
  selectedWaypointId: string | null;
  onWaypointMove: (
    id: string,
    coordinate: { lat: number; lon: number },
  ) => void;
  onMapPick: (coordinate: { lat: number; lon: number }) => void;
  onAddIntermediate: (coordinate: { lat: number; lon: number }) => void;
  onInspectPoint: (
    coordinate: { lat: number; lon: number },
    reveal?: boolean,
    fallbackLabel?: string,
  ) => void;
  onNavigatePoint: (
    coordinate: { lat: number; lon: number },
    userLocation: { lat: number; lon: number } | null,
  ) => void;
  onUserLocation: (fix: UserLocationFix) => void;
  onUserTrackingChange: (active: boolean) => void;
  onCenterChange: (coordinate: { lat: number; lon: number }) => void;
  surface: MapSurface;
  replayProgress: number;
  replaying: boolean;
  discoveryPlaces: DiscoveryPlace[];
  activeDiscovery: string | null;
  onBoundsChange: (bounds: ViewBounds) => void;
};

const emptyLine = (): Feature<LineString> => ({
  type: "Feature",
  properties: {},
  geometry: { type: "LineString", coordinates: [] },
});

const emptyFeatures = (): FeatureCollection => ({
  type: "FeatureCollection",
  features: [],
});

type BuildingSelection = {
  feature: Feature<Polygon>;
  lookupCoordinate: Coordinate;
};

function pointInRing(point: { x: number; y: number }, ring: Position[]) {
  let inside = false;
  for (
    let index = 0, previous = ring.length - 1;
    index < ring.length;
    index++
  ) {
    const currentPoint = ring[index]!;
    const previousPoint = ring[previous]!;
    const intersects =
      currentPoint[1]! > point.y !== previousPoint[1]! > point.y &&
      point.x <
        ((previousPoint[0]! - currentPoint[0]!) *
          (point.y - currentPoint[1]!)) /
          (previousPoint[1]! - currentPoint[1]!) +
          currentPoint[0]!;
    if (intersects) inside = !inside;
    previous = index;
  }
  return inside;
}

function pointInPolygon(point: Position, rings: Position[][]) {
  return (
    Boolean(
      rings[0] && pointInRing({ x: point[0]!, y: point[1]! }, rings[0]),
    ) &&
    !rings
      .slice(1)
      .some((ring) => pointInRing({ x: point[0]!, y: point[1]! }, ring))
  );
}

function projectedPolygon(map: MapLibreMap, rings: Position[][]): Position[][] {
  return rings.map((ring) =>
    ring.map((coordinate) => {
      const rendered = map.project([coordinate[0]!, coordinate[1]!]);
      return [rendered.x, rendered.y];
    }),
  );
}

function ringArea(ring: Position[]) {
  let sum = 0;
  for (let index = 0; index < ring.length; index += 1) {
    const current = ring[index]!;
    const next = ring[(index + 1) % ring.length]!;
    sum += current[0]! * next[1]! - next[0]! * current[1]!;
  }
  return Math.abs(sum / 2);
}

function ringDistance(point: { x: number; y: number }, ring: Position[]) {
  let closest = Number.POSITIVE_INFINITY;
  for (let index = 0; index < ring.length; index += 1) {
    const start = ring[index]!;
    const end = ring[(index + 1) % ring.length]!;
    const dx = end[0]! - start[0]!;
    const dy = end[1]! - start[1]!;
    const lengthSquared = dx * dx + dy * dy;
    const progress =
      lengthSquared === 0
        ? 0
        : Math.max(
            0,
            Math.min(
              1,
              ((point.x - start[0]!) * dx + (point.y - start[1]!) * dy) /
                lengthSquared,
            ),
          );
    closest = Math.min(
      closest,
      Math.hypot(
        point.x - (start[0]! + progress * dx),
        point.y - (start[1]! + progress * dy),
      ),
    );
  }
  return closest;
}

function polygonCentroid(ring: Position[]): Coordinate {
  let twiceArea = 0;
  let longitude = 0;
  let latitude = 0;
  for (let index = 0; index < ring.length; index += 1) {
    const current = ring[index]!;
    const next = ring[(index + 1) % ring.length]!;
    const cross = current[0]! * next[1]! - next[0]! * current[1]!;
    twiceArea += cross;
    longitude += (current[0]! + next[0]!) * cross;
    latitude += (current[1]! + next[1]!) * cross;
  }
  if (Math.abs(twiceArea) < 1e-12) {
    const count = Math.max(1, ring.length);
    return [
      ring.reduce((sum, point) => sum + point[0]!, 0) / count,
      ring.reduce((sum, point) => sum + point[1]!, 0) / count,
    ];
  }
  return [longitude / (3 * twiceArea), latitude / (3 * twiceArea)];
}

function highlightedBuildingAt(
  map: MapLibreMap,
  point: { x: number; y: number },
): BuildingSelection | null {
  const buildingLayers = (map.getStyle().layers ?? []).filter(
    (layer) =>
      !layer.id.startsWith("selected-building-") &&
      (layer.type === "fill-extrusion" || layer.type === "fill") &&
      (layer.id.toLowerCase().includes("building") ||
        ("source-layer" in layer && layer["source-layer"] === "building")),
  );
  const extrusionLayers = buildingLayers.filter(
    (layer) => layer.type === "fill-extrusion",
  );
  const fillLayers = buildingLayers.filter((layer) => layer.type === "fill");
  const candidatesFor = (layerIds: string[]) =>
    layerIds.length === 0
      ? []
      : map
          .queryRenderedFeatures([point.x, point.y], { layers: layerIds })
          .flatMap((feature, hitIndex) => {
            const polygons =
              feature.geometry.type === "Polygon"
                ? [feature.geometry.coordinates]
                : feature.geometry.type === "MultiPolygon"
                  ? feature.geometry.coordinates
                  : [];
            return polygons.map((rings) => {
              const projected = projectedPolygon(map, rings);
              const contains = pointInPolygon([point.x, point.y], projected);
              return {
                feature,
                hitIndex,
                rings,
                contains,
                distance: contains
                  ? 0
                  : ringDistance(point, projected[0] ?? []),
                area: ringArea(projected[0] ?? []),
              };
            });
          })
          .filter((candidate) => candidate.area > 0)
          .sort(
            (left, right) =>
              Number(right.contains) - Number(left.contains) ||
              left.distance - right.distance ||
              left.area - right.area ||
              left.hitIndex - right.hitIndex,
          );
  const extrusionCandidates = candidatesFor(
    extrusionLayers.map((layer) => layer.id),
  );
  const candidates =
    extrusionCandidates.length > 0
      ? extrusionCandidates
      : candidatesFor(fillLayers.map((layer) => layer.id));
  const match = candidates[0];
  if (!match) return null;

  const centroid = polygonCentroid(match.rings[0] ?? []);
  let lookupCoordinate = centroid;
  try {
    const addressFeatures = map.querySourceFeatures(match.feature.source, {
      sourceLayer: "housenumber",
    });
    const addressPoint = addressFeatures
      .filter(
        (feature) =>
          feature.geometry.type === "Point" &&
          pointInPolygon(feature.geometry.coordinates, match.rings),
      )
      .sort((left, right) => {
        const leftIdMatch = left.id === match.feature.id ? 0 : 1;
        const rightIdMatch = right.id === match.feature.id ? 0 : 1;
        if (leftIdMatch !== rightIdMatch) return leftIdMatch - rightIdMatch;
        const leftPoint =
          left.geometry.type === "Point" ? left.geometry.coordinates : centroid;
        const rightPoint =
          right.geometry.type === "Point"
            ? right.geometry.coordinates
            : centroid;
        return (
          Math.hypot(leftPoint[0]! - centroid[0], leftPoint[1]! - centroid[1]) -
          Math.hypot(rightPoint[0]! - centroid[0], rightPoint[1]! - centroid[1])
        );
      })[0];
    if (addressPoint?.geometry.type === "Point") {
      lookupCoordinate = [
        addressPoint.geometry.coordinates[0]!,
        addressPoint.geometry.coordinates[1]!,
      ];
    }
  } catch {
    // GeoJSON test/demo sources do not expose vector source layers.
  }

  return {
    lookupCoordinate,
    feature: {
      type: "Feature",
      properties: {
        ...match.feature.properties,
        name: match.feature.properties?.name ?? null,
        address:
          match.feature.properties?.address ??
          match.feature.properties?.["addr:housename"] ??
          null,
      },
      geometry: {
        type: "Polygon",
        coordinates: structuredClone(match.rings),
      },
    },
  };
}

function routeConnectors(
  waypoints: Waypoint[],
  coordinates: Coordinate[],
): FeatureCollection<LineString> {
  if (coordinates.length === 0) {
    return { type: "FeatureCollection", features: [] };
  }
  let minimumIndex = 0;
  const features = waypoints.map((waypoint) => {
    const point: Coordinate = [waypoint.lon, waypoint.lat];
    const longitudeScale = Math.max(
      0.15,
      Math.cos((waypoint.lat * Math.PI) / 180),
    );
    let matchIndex = minimumIndex;
    let matchDistance = Number.POSITIVE_INFINITY;
    for (let index = minimumIndex; index < coordinates.length; index += 1) {
      const coordinate = coordinates[index]!;
      const distance =
        ((coordinate[0] - point[0]) * longitudeScale) ** 2 +
        (coordinate[1] - point[1]) ** 2;
      if (distance < matchDistance) {
        matchDistance = distance;
        matchIndex = index;
      }
    }
    minimumIndex = matchIndex;
    return {
      type: "Feature" as const,
      properties: { waypointId: waypoint.id },
      geometry: {
        type: "LineString" as const,
        coordinates: [point, coordinates[matchIndex]!],
      },
    };
  });
  return { type: "FeatureCollection", features };
}

function routeCoordinates(route: RouteResponse | null): Coordinate[] {
  const coordinates = route?.geometry?.coordinates;
  if (!Array.isArray(coordinates)) return [];
  return coordinates.filter(
    (coordinate): coordinate is Coordinate =>
      Array.isArray(coordinate) &&
      coordinate.length >= 2 &&
      Number.isFinite(coordinate[0]) &&
      Number.isFinite(coordinate[1]),
  );
}

function firstSymbolLayer(map: MapLibreMap): string | undefined {
  return map.getStyle().layers?.find((layer) => layer.type === "symbol")?.id;
}

function usesTerrain(surface: MapSurface) {
  return ["mapsource", "dark", "light", "elevation", "satellite"].includes(
    surface,
  );
}

function closeAttribution(container: HTMLElement | null) {
  const control = container?.querySelector(".maplibregl-ctrl-attrib");
  control?.classList.remove("maplibregl-compact-show");
  control?.removeAttribute("open");
  control
    ?.querySelector(".maplibregl-ctrl-attrib-button")
    ?.setAttribute("aria-expanded", "false");
}

function visibleMapPadding() {
  if (window.innerWidth > 760) {
    return { top: 120, right: 90, bottom: 120, left: 455 };
  }
  const sheet = document.querySelector<HTMLElement>(".route-panel");
  const coveredHeight = sheet?.getBoundingClientRect().height ?? 154;
  return {
    top: 82,
    right: 42,
    bottom: Math.min(window.innerHeight - 130, coveredHeight + 30),
    left: 42,
  };
}

function visibleMapFocusTarget(map: MapLibreMap) {
  const width = map.getContainer().clientWidth;
  const height = map.getContainer().clientHeight;
  const panel = document.querySelector<HTMLElement>(".route-panel");
  let x = width / 2;
  let y = height / 2;
  if (window.innerWidth <= 760) {
    const panelHeight = panel?.getBoundingClientRect().height ?? 202;
    const sheetMode = panel?.dataset.sheetMode ?? "half";
    y =
      sheetMode === "minimized"
        ? height / 2 - Math.min(42, panelHeight * 0.28)
        : Math.max(70, (height - panelHeight) / 2);
  } else if (panel) {
    x = (panel.getBoundingClientRect().right + width) / 2;
  }
  return {
    x,
    y,
    offset: [x - width / 2, y - height / 2] as [number, number],
  };
}

type CameraSnapshot = {
  center: Coordinate;
  zoom: number;
  bearing: number;
  pitch: number;
};

type PermissionedOrientationConstructor = typeof DeviceOrientationEvent & {
  requestPermission?: () => Promise<"granted" | "denied">;
};

type CompassOrientationEvent = DeviceOrientationEvent & {
  webkitCompassHeading?: number;
  webkitCompassAccuracy?: number;
};

const businessIconPaths: Record<string, string> = {
  cafe: "M6 8h10v5a4 4 0 0 1-4 4h-2a4 4 0 0 1-4-4V8Zm10 2h1a2 2 0 0 1 0 4h-1M9 4v2m4-2v2",
  restaurant: "M7 4v7m-3-7v4a3 3 0 0 0 6 0V4m-3 7v9m9-16v16m0-16c3 2 3 6 0 9",
  shop: "M4 9h16l-2-5H6L4 9Zm1 0v11h14V9M9 20v-6h6v6",
  supermarket: "m3 4 2 2 2 9h10l3-7H6m3 11h.01M17 19h.01",
  pharmacy: "M12 5v14M5 12h14",
  fuel: "M5 3h10v18H5V3Zm3 4h4m3 2h2l2 2v6a2 2 0 0 0 2 2V9",
  hotel: "M4 19V6m0 9h16v4M7 11h4a3 3 0 0 1 3 3v1",
  park: "m12 3-5 8h3l-4 6h12l-4-6h3l-5-8Zm0 14v4",
  transit_stop:
    "M6 3h12a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Zm1 4h10v6H7V7Zm1 9h2m4 0h2M7 19v2m10-2v2",
  railway_station:
    "M8 3h8a3 3 0 0 1 3 3v10a3 3 0 0 1-3 3H8a3 3 0 0 1-3-3V6a3 3 0 0 1 3-3Zm0 4h8v5H8V7Zm1 9h.01M15 16h.01M9 19l-2 3m8-3 2 3",
};

const intermediateIconPaths = {
  origin:
    "M12 21s6-5.2 6-11a6 6 0 1 0-12 0c0 5.8 6 11 6 11Z|M12 12.2a2.2 2.2 0 1 0 0-4.4 2.2 2.2 0 0 0 0 4.4Z",
  add: "M12 5v14M5 12h14",
  inspect: "M12 10.5v5M12 7.5h.01|M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z",
  navigate: "m4 11 16-7-7 16-2-7-7-2Z",
};

function appendSvg(target: HTMLElement, path: string) {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("aria-hidden", "true");
  const paths = path.split("|");
  for (const definition of paths) {
    const part = document.createElementNS("http://www.w3.org/2000/svg", "path");
    part.setAttribute("d", definition);
    svg.append(part);
  }
  target.append(svg);
}

function safeWebsite(value: string | undefined): string | null {
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

function placePopup(place: DiscoveryPlace, category: string) {
  const card = document.createElement("article");
  card.className = "business-card";
  const eyebrow = document.createElement("span");
  eyebrow.textContent = category.replaceAll("_", " ");
  const title = document.createElement("strong");
  title.textContent = place.name ?? "Mapped place";
  const address = document.createElement("p");
  address.textContent = [
    place.address.housenumber,
    place.address.street,
    place.address.city,
  ]
    .filter(Boolean)
    .join(" ");
  card.append(eyebrow, title);
  if (address.textContent) card.append(address);
  const actions = document.createElement("div");
  actions.className = "business-actions";
  const phone = place.properties.phone ?? place.properties["contact:phone"];
  const website = safeWebsite(
    place.properties.website ?? place.properties["contact:website"],
  );
  const links = [
    phone
      ? {
          label: "Call",
          href: `tel:${phone.replace(/[^+\d(). -]/g, "")}`,
          icon: "M7 3H4a1 1 0 0 0-1 1c0 9 8 17 17 17a1 1 0 0 0 1-1v-3l-5-2-2 3c-4-1-7-4-8-8l3-2-2-5Z",
        }
      : null,
    website
      ? {
          label: "Website",
          href: website,
          icon: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Zm-9 9h18M12 3c3 3 3 15 0 18M12 3c-3 3-3 15 0 18",
        }
      : null,
    place.sources[0]?.url
      ? {
          label: "OpenStreetMap",
          href: place.sources[0].url,
          icon: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-13v5m0 3h.01",
        }
      : null,
  ].filter((link): link is { label: string; href: string; icon: string } =>
    Boolean(link),
  );
  for (const link of links) {
    const anchor = document.createElement("a");
    anchor.href = link.href;
    anchor.ariaLabel = link.label;
    anchor.title = link.label;
    if (!link.href.startsWith("tel:")) {
      anchor.target = "_blank";
      anchor.rel = "noreferrer";
    }
    appendSvg(anchor, link.icon);
    actions.append(anchor);
  }
  card.append(actions);
  return card;
}

export function MapCanvas({
  waypoints,
  route,
  heldPointDetails,
  initialLocation,
  mode,
  navigationActive,
  selectedWaypointId,
  onWaypointMove,
  onMapPick,
  onAddIntermediate,
  onInspectPoint,
  onNavigatePoint,
  onUserLocation,
  onUserTrackingChange,
  onCenterChange,
  surface,
  replayProgress,
  replaying,
  discoveryPlaces,
  activeDiscovery,
  onBoundsChange,
}: MapCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const markersRef = useRef<Marker[]>([]);
  const businessMarkersRef = useRef<Marker[]>([]);
  const businessPopupRef = useRef<Popup | null>(null);
  const intermediateMarkerRef = useRef<Marker | null>(null);
  const focusedDiscoveryRef = useRef<string | null>(null);
  const replayMarkerRef = useRef<Marker | null>(null);
  const selectedRef = useRef(selectedWaypointId);
  const onMapPickRef = useRef(onMapPick);
  const onAddIntermediateRef = useRef(onAddIntermediate);
  const onInspectPointRef = useRef(onInspectPoint);
  const onNavigatePointRef = useRef(onNavigatePoint);
  const onUserLocationRef = useRef(onUserLocation);
  const onUserTrackingChangeRef = useRef(onUserTrackingChange);
  const onCenterChangeRef = useRef(onCenterChange);
  const onBoundsChangeRef = useRef(onBoundsChange);
  const surfaceRef = useRef(surface);
  const modeRef = useRef(mode);
  const routeRef = useRef(route);
  const waypointsRef = useRef(waypoints);
  const replayProgressRef = useRef(replayProgress);
  const replayingRef = useRef(replaying);
  const heldBuildingRef = useRef<BuildingSelection | null>(null);
  const userTrackingRef = useRef(false);
  const userFollowingRef = useRef(false);
  const userCameraInteractedRef = useRef(false);
  const initialLocationAppliedRef = useRef(false);
  const deviceHeadingRef = useRef<number | null>(null);
  const rawDeviceHeadingRef = useRef<number | null>(null);
  const deviceHeadingMagneticRef = useRef(false);
  const magneticDeclinationRef = useRef(0);
  const gpsCourseRef = useRef<number | null>(null);
  const latestUserLocationRef = useRef<Coordinate | null>(null);
  const loadedSurfaceRef = useRef(surface);
  const pendingCameraRef = useRef<CameraSnapshot | null>(null);
  const resumeFollowAfterStyleRef = useRef(false);
  const preserveCameraForRouteRef = useRef(false);
  const [ready, setReady] = useState(false);
  const [heldPoint, setHeldPoint] = useState<Coordinate | null>(null);
  const [heldBuilding, setHeldBuilding] = useState<BuildingSelection | null>(
    null,
  );
  const lastCameraUpdate = useRef(0);

  useEffect(() => {
    selectedRef.current = selectedWaypointId;
    onMapPickRef.current = onMapPick;
    onAddIntermediateRef.current = onAddIntermediate;
    onInspectPointRef.current = onInspectPoint;
    onNavigatePointRef.current = onNavigatePoint;
    onUserLocationRef.current = onUserLocation;
    onUserTrackingChangeRef.current = onUserTrackingChange;
    onCenterChangeRef.current = onCenterChange;
    onBoundsChangeRef.current = onBoundsChange;
    surfaceRef.current = surface;
    modeRef.current = mode;
    routeRef.current = route;
    waypointsRef.current = waypoints;
    replayProgressRef.current = replayProgress;
    replayingRef.current = replaying;
  }, [
    onCenterChange,
    onAddIntermediate,
    onBoundsChange,
    onInspectPoint,
    onMapPick,
    onNavigatePoint,
    onUserLocation,
    onUserTrackingChange,
    mode,
    replayProgress,
    replaying,
    route,
    selectedWaypointId,
    surface,
    waypoints,
  ]);

  useEffect(() => {
    heldBuildingRef.current = heldBuilding;
  }, [heldBuilding]);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const mapContainer = containerRef.current;
    const map = new MapLibreMap({
      container: mapContainer,
      style: `/map/style.json?surface=${surfaceRef.current}`,
      center: [-122.716, 45.531],
      zoom: 13.4,
      pitch: 42,
      bearing: -18,
      maxPitch: 70,
      fadeDuration: 520,
      attributionControl: false,
      cooperativeGestures: false,
    });
    mapRef.current = map;
    map.touchZoomRotate.enable();
    const attribution = new AttributionControl({
      compact: true,
      customAttribution: [
        '<a href="https://mapsource.io" target="_blank" rel="noreferrer">Mapsource</a>',
        '<a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">© OpenStreetMap contributors</a>',
      ],
    });
    map.addControl(
      new NavigationControl({ showCompass: true, visualizePitch: true }),
      "bottom-right",
    );
    // MapLibre's GeolocateControl owns its own camera and calls easeTo for each
    // GPS update. On a real handset, a fix arriving while two fingers remain on
    // the screen cancels the in-progress pinch. Keep its familiar control
    // surface, but own the location watch and camera in this component so
    // sensor updates and gestures cannot race each other.
    const locationControlElement = document.createElement("div");
    locationControlElement.className =
      "maplibregl-ctrl maplibregl-ctrl-group mapsource-location-control";
    const geolocateButton = document.createElement("button");
    geolocateButton.type = "button";
    geolocateButton.className = "maplibregl-ctrl-geolocate";
    geolocateButton.title = "Find my location";
    geolocateButton.ariaLabel = "Find my location";
    geolocateButton.setAttribute("aria-pressed", "false");
    const geolocateIcon = document.createElement("span");
    geolocateIcon.className = "maplibregl-ctrl-icon";
    geolocateIcon.ariaHidden = "true";
    geolocateButton.append(geolocateIcon);
    locationControlElement.append(geolocateButton);
    map.addControl(
      {
        onAdd: () => locationControlElement,
        onRemove: () => locationControlElement.remove(),
      },
      "bottom-right",
    );
    const locationSmoother = new LocationSmoother();
    const userLocationElement = document.createElement("div");
    userLocationElement.className = "smoothed-user-location";
    userLocationElement.ariaHidden = "true";
    const userLocationMarker = new MapLibreMarker({
      element: userLocationElement,
      anchor: "center",
    });
    let userLocationMarkerAdded = false;
    let renderedUserLocation: Coordinate | null = null;
    let userLocationAnimationFrame: number | null = null;
    let lastLocationReceivedAt: number | null = null;
    const moveUserLocationMarker = (
      target: Coordinate,
      receivedAt: number,
      reset: boolean,
    ) => {
      if (userLocationAnimationFrame !== null) {
        window.cancelAnimationFrame(userLocationAnimationFrame);
        userLocationAnimationFrame = null;
      }
      if (!userLocationMarkerAdded) {
        userLocationMarker.setLngLat(target).addTo(map);
        userLocationMarkerAdded = true;
        renderedUserLocation = target;
        lastLocationReceivedAt = receivedAt;
        return;
      }
      const start = renderedUserLocation ?? target;
      const elapsed = lastLocationReceivedAt
        ? receivedAt - lastLocationReceivedAt
        : 700;
      const duration = reset
        ? 0
        : Math.max(280, Math.min(1_200, elapsed * 0.9));
      lastLocationReceivedAt = receivedAt;
      if (duration === 0) {
        renderedUserLocation = target;
        userLocationMarker.setLngLat(target);
        return;
      }
      const startedAt = performance.now();
      let longitudeDelta = target[0] - start[0];
      if (longitudeDelta > 180) longitudeDelta -= 360;
      if (longitudeDelta < -180) longitudeDelta += 360;
      const animate = (now: number) => {
        const progress = Math.min(1, (now - startedAt) / duration);
        const eased = progress * progress * (3 - 2 * progress);
        renderedUserLocation = [
          start[0] + longitudeDelta * eased,
          start[1] + (target[1] - start[1]) * eased,
        ];
        userLocationMarker.setLngLat(renderedUserLocation);
        if (progress < 1) {
          userLocationAnimationFrame = window.requestAnimationFrame(animate);
        } else {
          userLocationAnimationFrame = null;
        }
      };
      userLocationAnimationFrame = window.requestAnimationFrame(animate);
    };
    const recenterButton = document.createElement("button");
    recenterButton.type = "button";
    recenterButton.className = "map-recenter";
    recenterButton.textContent = "Recenter";
    recenterButton.ariaLabel = "Recenter on current location";
    mapContainer.append(recenterButton);
    let attributionAdded = false;
    let userFocusSequence = 0;
    let userZooming = false;
    let userAdjustingCamera = false;
    let preserveMultiTouchFollow = false;
    let preserveZoomFollow = false;
    let followedUserZoom: number | null = null;
    let locationWatchId: number | null = null;
    let panelFocusFrame: number | null = null;
    let surfaceTransitionTimer: number | null = null;

    const positionRecenterButton = () => {
      const container = containerRef.current;
      const locationButton = container?.querySelector<HTMLElement>(
        ".maplibregl-ctrl-geolocate",
      );
      if (!container || !locationButton) return;
      const containerBox = container.getBoundingClientRect();
      const locationBox = locationButton.getBoundingClientRect();
      recenterButton.style.top = `${locationBox.top - containerBox.top + (locationBox.height - recenterButton.offsetHeight) / 2}px`;
      recenterButton.style.right = `${containerBox.right - locationBox.left + 9}px`;
    };

    const syncLocationButton = () => {
      const tracking = userTrackingRef.current;
      const following = userFollowingRef.current;
      geolocateButton.setAttribute("aria-pressed", String(tracking));
      geolocateButton.classList.toggle(
        "maplibregl-ctrl-geolocate-active",
        tracking && following,
      );
      geolocateButton.classList.toggle(
        "maplibregl-ctrl-geolocate-background",
        tracking && !following,
      );
    };

    const setCameraFollowing = (following: boolean) => {
      userFollowingRef.current = following;
      syncLocationButton();
      recenterButton.classList.toggle(
        "is-visible",
        userTrackingRef.current && !following,
      );
      if (containerRef.current) {
        containerRef.current.dataset.cameraFollowing = following
          ? "active"
          : "detached";
      }
      if (!following) window.requestAnimationFrame(positionRecenterButton);
    };

    const updateMapTelemetry = () => {
      const container = containerRef.current;
      if (!container) return;
      const center = map.getCenter();
      container.dataset.camera = [
        center.lng.toFixed(5),
        center.lat.toFixed(5),
        map.getZoom().toFixed(2),
        map.getBearing().toFixed(1),
        map.getPitch().toFixed(1),
      ].join(",");
      container.dataset.cameraBearingActual = map.getBearing().toFixed(1);
    };

    const orientToUser = (
      location: Coordinate,
      positionHeading?: number | null,
      positionSpeed?: number | null,
      duration = 180,
    ) => {
      if (
        !userFollowingRef.current ||
        replayingRef.current ||
        userZooming ||
        preserveMultiTouchFollow ||
        userAdjustingCamera
      )
        return;
      const routeBearing = nearestRouteBearing(
        routeCoordinates(routeRef.current),
        location,
      );
      const resolvedHeading = navigationHeading({
        deviceHeading: deviceHeadingRef.current,
        positionHeading,
        positionSpeed,
        gpsCourse: gpsCourseRef.current,
        routeBearing,
        mapBearing: map.getBearing(),
      });
      const heading = resolvedHeading.heading;
      const target = visibleMapFocusTarget(map);
      followedUserZoom ??= map.getZoom();
      const focusSequence = ++userFocusSequence;
      if (containerRef.current) {
        containerRef.current.dataset.userFocusTarget = [
          target.x.toFixed(1),
          target.y.toFixed(1),
        ].join(",");
      }
      const recordUserFocus = () => {
        if (focusSequence !== userFocusSequence) return;
        const rendered = map.project(location);
        if (containerRef.current) {
          containerRef.current.dataset.userFocusError = Math.hypot(
            rendered.x - target.x,
            rendered.y - target.y,
          ).toFixed(2);
          containerRef.current.dataset.userFocusRendered = [
            rendered.x.toFixed(1),
            rendered.y.toFixed(1),
          ].join(",");
        }
      };
      map.stop();
      map.once("moveend", () => {
        if (focusSequence !== userFocusSequence) return;
        const rendered = map.project(location);
        const correction: [number, number] = [
          rendered.x - target.x,
          rendered.y - target.y,
        ];
        if (Math.hypot(correction[0], correction[1]) < 0.75) {
          recordUserFocus();
          return;
        }
        map.once("moveend", recordUserFocus);
        map.panBy(
          correction,
          { duration: 120, essential: true },
          { geolocateSource: true },
        );
      });
      map.easeTo(
        {
          center: location,
          offset: target.offset,
          zoom: followedUserZoom,
          bearing: heading,
          pitch: routeRef.current ? 54 : 42,
          duration,
          essential: true,
        },
        { geolocateSource: true },
      );
      if (containerRef.current) {
        containerRef.current.dataset.cameraBearing = heading.toFixed(1);
        containerRef.current.dataset.cameraBearingTarget = heading.toFixed(1);
        containerRef.current.dataset.cameraBearingSource =
          resolvedHeading.source;
      }
    };

    const refocusTrackedUser = () => {
      const location = latestUserLocationRef.current;
      if (location) orientToUser(location);
    };

    const restoreTrackingLock = () => {
      // Follow never needs to be re-enabled after zoom now that this component
      // owns the geolocation camera. A queued post-pinch frame must not be able
      // to undo a later one-finger detach.
      if (!userTrackingRef.current || !userFollowingRef.current) return;
      refocusTrackedUser();
    };

    const recenterOnUser = () => {
      if (!userTrackingRef.current) {
        startUserTracking();
        return;
      }
      setCameraFollowing(true);
      refocusTrackedUser();
    };
    recenterButton.addEventListener("click", recenterOnUser);
    window.addEventListener("mapsource:recenter", recenterOnUser);

    const handleZoomStart = (event: { originalEvent?: unknown }) => {
      if (!event.originalEvent) return;
      userCameraInteractedRef.current = true;
      userZooming = true;
      userFocusSequence += 1;
    };
    const handleZoomEnd = () => {
      if (!userZooming) return;
      userZooming = false;
      followedUserZoom = map.getZoom();
      if (containerRef.current) {
        containerRef.current.dataset.userZoom = map.getZoom().toFixed(2);
      }
      if (preserveZoomFollow) {
        preserveZoomFollow = false;
        window.requestAnimationFrame(restoreTrackingLock);
      } else if (userFollowingRef.current) {
        window.requestAnimationFrame(refocusTrackedUser);
      }
    };
    const handlePanStart = (event: { originalEvent?: unknown }) => {
      if (!event.originalEvent) return;
      if (
        preserveMultiTouchFollow ||
        (event.originalEvent instanceof TouchEvent &&
          event.originalEvent.touches.length !== 1)
      ) {
        return;
      }
      userCameraInteractedRef.current = true;
      if (userTrackingRef.current) setCameraFollowing(false);
    };
    const handleCameraAdjustmentStart = (event: {
      originalEvent?: unknown;
    }) => {
      if (!event.originalEvent) return;
      userCameraInteractedRef.current = true;
      userAdjustingCamera = true;
    };
    const handleCameraAdjustmentEnd = () => {
      if (!userAdjustingCamera) return;
      userAdjustingCamera = false;
      if (userFollowingRef.current) {
        window.requestAnimationFrame(refocusTrackedUser);
      }
    };
    map.on("zoomstart", handleZoomStart);
    map.on("zoomend", handleZoomEnd);
    map.on("dragstart", handlePanStart);
    map.on("rotatestart", handleCameraAdjustmentStart);
    map.on("pitchstart", handleCameraAdjustmentStart);
    map.on("rotateend", handleCameraAdjustmentEnd);
    map.on("pitchend", handleCameraAdjustmentEnd);

    const panel = document.querySelector<HTMLElement>(".route-panel");
    const panelObserver = new ResizeObserver(() => {
      if (!userFollowingRef.current || userZooming) return;
      if (panelFocusFrame !== null) {
        window.cancelAnimationFrame(panelFocusFrame);
      }
      panelFocusFrame = window.requestAnimationFrame(() => {
        panelFocusFrame = null;
        refocusTrackedUser();
      });
    });
    if (panel) panelObserver.observe(panel);

    let orientationFocusFrame: number | null = null;
    const orientToLatestUser = (attempt = 0) => {
      orientationFocusFrame = null;
      const location = latestUserLocationRef.current;
      if (location) {
        // Compass animation must not trail the sensor. GPS/location transitions
        // retain their own smoothing, while bearing samples land exactly on the
        // latest true-north target.
        orientToUser(location, null, null, 0);
        return;
      }
      if (attempt >= 60) return;
      orientationFocusFrame = window.requestAnimationFrame(() =>
        orientToLatestUser(attempt + 1),
      );
    };
    const orientationListener = (rawEvent: Event) => {
      const event = rawEvent as CompassOrientationEvent;
      const accuracy = event.webkitCompassAccuracy;
      const button = containerRef.current?.querySelector<HTMLElement>(
        ".maplibregl-ctrl-geolocate",
      );
      if (Number.isFinite(accuracy)) {
        if (button) button.dataset.compassAccuracy = accuracy!.toFixed(0);
        if (accuracy! < 0 || accuracy! > 45) {
          if (button) button.dataset.orientation = "calibrate";
          return;
        }
      }
      const legacyOrientation = (window as Window & { orientation?: number })
        .orientation;
      const screenAngle =
        window.screen.orientation?.angle ?? legacyOrientation ?? 0;
      const heading = orientationHeading(event, screenAngle);
      if (heading === null) return;
      // The map animation already interpolates bearing. Numerically smoothing
      // only when sensor events arrive can strand the camera tens of degrees
      // behind the final physical heading when the browser stops emitting after
      // the handset becomes still. Preserve the actual compass sample here.
      const isMagneticHeading = Number.isFinite(event.webkitCompassHeading);
      const cameraHeading = isMagneticHeading
        ? magneticHeadingToTrue(heading, magneticDeclinationRef.current)
        : heading;
      rawDeviceHeadingRef.current = heading;
      deviceHeadingMagneticRef.current = isMagneticHeading;
      deviceHeadingRef.current = cameraHeading;
      const sensorHeading = Number.isFinite(event.webkitCompassHeading)
        ? event.webkitCompassHeading!
        : event.alpha;
      if (button) {
        button.dataset.rawHeading = heading.toFixed(1);
        button.dataset.compassSensorHeading = Number.isFinite(sensorHeading)
          ? sensorHeading!.toFixed(1)
          : "unavailable";
        button.dataset.compassSensorKind = Number.isFinite(
          event.webkitCompassHeading,
        )
          ? "webkit-compass"
          : "w3c-alpha";
        button.dataset.compassScreenAngle = String(screenAngle);
        button.dataset.compassTransformedHeading = heading.toFixed(1);
        button.dataset.compassDeclination =
          magneticDeclinationRef.current.toFixed(2);
        button.dataset.compassTrueHeading = cameraHeading.toFixed(1);
        button.dataset.heading = cameraHeading.toFixed(1);
        button.dataset.orientation = "granted";
      }
      if (containerRef.current) {
        containerRef.current.dataset.userHeading = cameraHeading.toFixed(1);
        containerRef.current.dataset.compassSensorHeading = Number.isFinite(
          sensorHeading,
        )
          ? sensorHeading!.toFixed(1)
          : "unavailable";
        containerRef.current.dataset.compassSensorKind = Number.isFinite(
          event.webkitCompassHeading,
        )
          ? "webkit-compass"
          : "w3c-alpha";
        containerRef.current.dataset.compassScreenAngle = String(screenAngle);
        containerRef.current.dataset.compassTransformedHeading =
          heading.toFixed(1);
        containerRef.current.dataset.compassDeclination =
          magneticDeclinationRef.current.toFixed(2);
        containerRef.current.dataset.compassCameraHeading =
          cameraHeading.toFixed(1);
      }
      if (orientationFocusFrame !== null) {
        window.cancelAnimationFrame(orientationFocusFrame);
      }
      orientToLatestUser();
    };

    let orientationListening = false;
    const startOrientation = () => {
      if (orientationListening) return;
      orientationListening = true;
      window.addEventListener("deviceorientationabsolute", orientationListener);
      window.addEventListener("deviceorientation", orientationListener);
    };

    const requestOrientation = async () => {
      const Orientation = window.DeviceOrientationEvent as
        | PermissionedOrientationConstructor
        | undefined;
      if (!Orientation) {
        geolocateButton.dataset.orientation = "unsupported";
        return;
      }
      try {
        const permission = Orientation.requestPermission
          ? await Orientation.requestPermission()
          : "granted";
        geolocateButton.dataset.orientation = permission;
        if (permission === "granted") startOrientation();
      } catch {
        geolocateButton.dataset.orientation = "denied";
      }
    };

    const attachOrientationRequest = () => {
      geolocateButton.addEventListener("click", requestOrientation, {
        capture: true,
      });
    };
    window.requestAnimationFrame(attachOrientationRequest);

    const canvasContainer = map.getCanvasContainer();
    let singleTouchStart: {
      identifier: number;
      clientX: number;
      clientY: number;
    } | null = null;
    const finishMultiTouchGesture = () => {
      if (!preserveMultiTouchFollow) return;
      preserveMultiTouchFollow = false;
      if (!userZooming && !userAdjustingCamera) {
        preserveZoomFollow = false;
        window.requestAnimationFrame(restoreTrackingLock);
      }
    };
    const trackTouchStart = (event: TouchEvent) => {
      if (
        event.target instanceof Node &&
        canvasContainer.contains(event.target) &&
        event.touches.length === 1
      ) {
        const touch = event.touches[0]!;
        singleTouchStart = {
          identifier: touch.identifier,
          clientX: touch.clientX,
          clientY: touch.clientY,
        };
      }
      if (
        event.target instanceof Node &&
        canvasContainer.contains(event.target) &&
        event.touches.length >= 2 &&
        userFollowingRef.current
      ) {
        singleTouchStart = null;
        preserveMultiTouchFollow = true;
        preserveZoomFollow = true;
        userCameraInteractedRef.current = true;
        if (containerRef.current) {
          containerRef.current.dataset.mapGesture = "multi-touch";
          containerRef.current.dataset.mapTouchCount = String(
            event.touches.length,
          );
        }
      }
    };
    const trackTouchMove = (event: TouchEvent) => {
      if (
        preserveMultiTouchFollow ||
        event.touches.length !== 1 ||
        !singleTouchStart
      ) {
        return;
      }
      const touch = Array.from(event.touches).find(
        (candidate) => candidate.identifier === singleTouchStart?.identifier,
      );
      if (
        !touch ||
        Math.hypot(
          touch.clientX - singleTouchStart.clientX,
          touch.clientY - singleTouchStart.clientY,
        ) < 8
      ) {
        return;
      }
      singleTouchStart = null;
      userCameraInteractedRef.current = true;
      if (userTrackingRef.current) setCameraFollowing(false);
    };
    const trackTouchEnd = (event: TouchEvent) => {
      singleTouchStart = null;
      if (containerRef.current) {
        containerRef.current.dataset.mapTouchCount = String(
          event.touches.length,
        );
      }
      if (event.touches.length < 2) {
        if (containerRef.current) {
          containerRef.current.dataset.mapGesture = "idle";
        }
        finishMultiTouchGesture();
      }
    };
    window.addEventListener("touchstart", trackTouchStart, {
      capture: true,
      passive: true,
    });
    window.addEventListener("touchend", trackTouchEnd, {
      capture: true,
      passive: true,
    });
    window.addEventListener("touchcancel", trackTouchEnd, {
      capture: true,
      passive: true,
    });
    window.addEventListener("touchmove", trackTouchMove, {
      capture: true,
      passive: true,
    });
    const captureZoomControlIntent = (event: PointerEvent) => {
      if (
        userFollowingRef.current &&
        event.target instanceof Element &&
        event.target.closest(
          ".maplibregl-ctrl-zoom-in, .maplibregl-ctrl-zoom-out",
        )
      ) {
        preserveZoomFollow = true;
      }
    };
    const captureWheelZoomIntent = () => {
      if (userFollowingRef.current) preserveZoomFollow = true;
    };
    mapContainer.addEventListener(
      "pointerdown",
      captureZoomControlIntent,
      true,
    );
    canvasContainer.addEventListener("wheel", captureWheelZoomIntent, {
      capture: true,
      passive: true,
    });
    let holdTimer: number | null = null;
    let holdFocusTimer: number | null = null;
    let holdStart: { pointerId: number; x: number; y: number } | null = null;
    const cancelHold = () => {
      if (holdTimer !== null) window.clearTimeout(holdTimer);
      holdTimer = null;
      holdStart = null;
    };
    const focusHeldPoint = (coordinate: Coordinate) => {
      const target = visibleMapFocusTarget(map);
      if (containerRef.current) {
        containerRef.current.dataset.heldFocusTarget = [
          target.x.toFixed(1),
          target.y.toFixed(1),
        ].join(",");
      }
      map.once("moveend", () => {
        const rendered = map.project(coordinate);
        if (containerRef.current) {
          containerRef.current.dataset.heldFocusError = Math.hypot(
            rendered.x - target.x,
            rendered.y - target.y,
          ).toFixed(2);
        }
      });
      map.easeTo(
        {
          center: coordinate,
          offset: target.offset,
          duration: 520,
          essential: true,
        },
        { geolocateSource: true },
      );
    };
    const selectHeldPoint = (point: { x: number; y: number }) => {
      map.stop();
      const coordinate = map.unproject([point.x, point.y]);
      const selected: Coordinate = [coordinate.lng, coordinate.lat];
      const building = highlightedBuildingAt(map, point);
      setHeldPoint(selected);
      setHeldBuilding(building);
      const inspectionCoordinate = building?.lookupCoordinate ?? selected;
      onInspectPointRef.current(
        { lat: inspectionCoordinate[1], lon: inspectionCoordinate[0] },
        false,
        building ? "Selected building" : undefined,
      );
      if (holdFocusTimer !== null) window.clearTimeout(holdFocusTimer);
      holdFocusTimer = window.setTimeout(() => {
        focusHeldPoint(selected);
        holdFocusTimer = null;
      }, 90);
    };
    const beginHold = (event: PointerEvent) => {
      if (
        selectedRef.current ||
        event.button !== 0 ||
        !(event.target instanceof Element) ||
        !event.target.closest(".maplibregl-canvas")
      ) {
        return;
      }
      cancelHold();
      if (holdFocusTimer !== null) window.clearTimeout(holdFocusTimer);
      holdStart = {
        pointerId: event.pointerId,
        x: event.clientX,
        y: event.clientY,
      };
      holdTimer = window.setTimeout(() => {
        const start = holdStart;
        if (!start) return;
        const rect = canvasContainer.getBoundingClientRect();
        selectHeldPoint({ x: start.x - rect.left, y: start.y - rect.top });
        holdTimer = null;
      }, 520);
    };
    const trackHold = (event: PointerEvent) => {
      if (!holdStart || event.pointerId !== holdStart.pointerId) return;
      if (
        Math.hypot(event.clientX - holdStart.x, event.clientY - holdStart.y) > 8
      ) {
        cancelHold();
      }
    };
    const endHold = (event: PointerEvent) => {
      if (!holdStart || event.pointerId !== holdStart.pointerId) return;
      cancelHold();
    };
    canvasContainer.addEventListener("pointerdown", beginHold, true);
    window.addEventListener("pointermove", trackHold, true);
    window.addEventListener("pointerup", endHold, true);
    window.addEventListener("pointercancel", endHold, true);
    map.on("contextmenu", (event) => {
      event.originalEvent.preventDefault();
      selectHeldPoint(event.point);
    });

    function handleUserPosition(event: GeolocationPosition) {
      const rawFix: UserLocationFix = {
        lat: event.coords.latitude,
        lon: event.coords.longitude,
        accuracy: Number.isFinite(event.coords.accuracy)
          ? event.coords.accuracy
          : null,
      };
      const receivedAt = performance.now();
      const smoothedFix = locationSmoother.push(rawFix, receivedAt);
      const location: Coordinate = [smoothedFix.lon, smoothedFix.lat];
      const declination = magvar(
        smoothedFix.lat,
        smoothedFix.lon,
        0,
        new Date(),
      );
      if (Number.isFinite(declination)) {
        magneticDeclinationRef.current = declination;
        if (
          deviceHeadingMagneticRef.current &&
          rawDeviceHeadingRef.current !== null
        ) {
          deviceHeadingRef.current = magneticHeadingToTrue(
            rawDeviceHeadingRef.current,
            declination,
          );
        }
        if (containerRef.current) {
          containerRef.current.dataset.compassDeclination =
            declination.toFixed(2);
        }
        geolocateButton.dataset.compassDeclination = declination.toFixed(2);
      }
      const previous = latestUserLocationRef.current;
      if (previous) {
        const meanLatitude =
          ((previous[1] + location[1]) / 2) * (Math.PI / 180);
        const eastMeters =
          (location[0] - previous[0]) * 111_320 * Math.cos(meanLatitude);
        const northMeters = (location[1] - previous[1]) * 111_320;
        if (Math.hypot(eastMeters, northMeters) >= 4) {
          gpsCourseRef.current = bearingDegrees(previous, location);
        }
      }
      latestUserLocationRef.current = location;
      userTrackingRef.current = true;
      geolocateButton.classList.remove("maplibregl-ctrl-geolocate-waiting");
      geolocateButton.classList.remove("maplibregl-ctrl-geolocate-error");
      syncLocationButton();
      onUserTrackingChangeRef.current(true);
      if (containerRef.current) {
        containerRef.current.dataset.userTracking = "active";
        containerRef.current.dataset.userLocationRaw = [
          rawFix.lon.toFixed(6),
          rawFix.lat.toFixed(6),
        ].join(",");
        containerRef.current.dataset.userLocationSmoothed = [
          smoothedFix.lon.toFixed(6),
          smoothedFix.lat.toFixed(6),
        ].join(",");
        containerRef.current.dataset.userLocationSamples = String(
          smoothedFix.sampleCount,
        );
      }
      const fixInterval = lastLocationReceivedAt
        ? receivedAt - lastLocationReceivedAt
        : 700;
      moveUserLocationMarker(location, receivedAt, smoothedFix.reset);
      onUserLocationRef.current(smoothedFix);
      const positionHeading = event.coords.heading;
      const positionSpeed = event.coords.speed;
      const cameraDuration = smoothedFix.reset
        ? 220
        : Math.max(280, Math.min(1_000, fixInterval * 0.9));
      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => {
          orientToUser(
            location,
            positionHeading,
            positionSpeed,
            cameraDuration,
          );
        });
      });
    }

    function handleUserLocationError(error: GeolocationPositionError) {
      geolocateButton.dataset.locationError = String(error.code);
      geolocateButton.classList.remove("maplibregl-ctrl-geolocate-waiting");
      geolocateButton.classList.add("maplibregl-ctrl-geolocate-error");
      if (error.code !== error.PERMISSION_DENIED) return;
      if (locationWatchId !== null) {
        navigator.geolocation.clearWatch(locationWatchId);
        locationWatchId = null;
      }
      userTrackingRef.current = false;
      setCameraFollowing(false);
      onUserTrackingChangeRef.current(false);
      if (containerRef.current) {
        containerRef.current.dataset.userTracking = "inactive";
      }
    }

    function startUserTracking() {
      if (userTrackingRef.current) {
        setCameraFollowing(true);
        refocusTrackedUser();
        return;
      }
      if (!navigator.geolocation) {
        geolocateButton.dataset.locationError = "unsupported";
        geolocateButton.classList.add("maplibregl-ctrl-geolocate-error");
        return;
      }
      userTrackingRef.current = true;
      setCameraFollowing(true);
      onUserTrackingChangeRef.current(true);
      geolocateButton.classList.add("maplibregl-ctrl-geolocate-waiting");
      if (containerRef.current) {
        containerRef.current.dataset.userTracking = "active";
      }
      locationWatchId = navigator.geolocation.watchPosition(
        handleUserPosition,
        handleUserLocationError,
        {
          enableHighAccuracy: true,
          maximumAge: 1_000,
          timeout: 15_000,
        },
      );
    }

    const activateLocation = () => startUserTracking();
    geolocateButton.addEventListener("click", activateLocation);

    map.on("styledataloading", () => {
      setReady(false);
      containerRef.current?.classList.add("is-switching-surface");
    });
    map.on("style.load", () => {
      const before = firstSymbolLayer(map);
      map.addSource("satellite", {
        type: "raster",
        tiles: ["/map/satellite/{z}/{x}/{y}.jpg"],
        tileSize: 256,
        maxzoom: 19,
        attribution:
          "Tiles © Esri — Source: Esri, Maxar, Earthstar Geographics",
      });
      map.addLayer(
        {
          id: "satellite",
          type: "raster",
          source: "satellite",
          layout: {
            visibility: surfaceRef.current === "satellite" ? "visible" : "none",
          },
          paint: {
            "raster-opacity": 0.82,
            "raster-saturation": -0.08,
            "raster-contrast": 0.06,
          },
        },
        before,
      );
      if (map.getSource("mapsource")) {
        map.addLayer(
          {
            id: "active-rail-network",
            type: "line",
            source: "mapsource",
            "source-layer": "transportation",
            filter: ["in", ["get", "class"], ["literal", ["rail", "transit"]]],
            layout: {
              visibility: modeRef.current === "train" ? "visible" : "none",
              "line-cap": "round",
              "line-join": "round",
            },
            paint: {
              "line-color": "#d8ed9d",
              "line-width": [
                "interpolate",
                ["linear"],
                ["zoom"],
                8,
                1.4,
                16,
                4.5,
              ],
              "line-opacity": 0.82,
              "line-blur": 0.25,
            },
          },
          before,
        );
      }
      map.addSource("route", { type: "geojson", data: emptyLine() });
      map.addSource("route-played", { type: "geojson", data: emptyLine() });
      map.addSource("route-connectors", {
        type: "geojson",
        data: emptyFeatures(),
      });
      map.addSource("selected-building", {
        type: "geojson",
        data: emptyFeatures(),
      });
      map.addLayer(
        {
          id: "selected-building-fill",
          type: "fill",
          source: "selected-building",
          paint: {
            "fill-color": "#d8f88b",
            "fill-opacity": 0.18,
          },
        },
        before,
      );
      map.addLayer(
        {
          id: "selected-building-extrusion",
          type: "fill-extrusion",
          source: "selected-building",
          paint: {
            "fill-extrusion-base": [
              "coalesce",
              ["to-number", ["get", "render_min_height"]],
              0,
            ],
            "fill-extrusion-color": "#d8f88b",
            "fill-extrusion-height": [
              "+",
              ["coalesce", ["to-number", ["get", "render_height"]], 4],
              0.8,
            ],
            "fill-extrusion-opacity": 0.82,
            "fill-extrusion-vertical-gradient": true,
          },
        },
        before,
      );
      map.addLayer(
        {
          id: "selected-building-outline",
          type: "line",
          source: "selected-building",
          layout: { "line-cap": "round", "line-join": "round" },
          paint: {
            "line-color": "#e8ffad",
            "line-width": 3,
            "line-blur": 0.25,
          },
        },
        before,
      );
      map.addLayer(
        {
          id: "route-connectors-casing",
          type: "line",
          source: "route-connectors",
          layout: { "line-cap": "round", "line-join": "round" },
          paint: {
            "line-color": "#101310",
            "line-width": ["interpolate", ["linear"], ["zoom"], 10, 5, 16, 9],
            "line-opacity": 0.9,
          },
        },
        before,
      );
      map.addLayer(
        {
          id: "route-connectors-line",
          type: "line",
          source: "route-connectors",
          layout: { "line-cap": "round", "line-join": "round" },
          paint: {
            "line-color": "#d8f88b",
            "line-width": ["interpolate", ["linear"], ["zoom"], 10, 2.5, 16, 5],
            "line-dasharray": [1, 1.4],
            "line-opacity": 0.94,
          },
        },
        before,
      );
      map.addLayer(
        {
          id: "route-casing",
          type: "line",
          source: "route",
          layout: { "line-cap": "round", "line-join": "round" },
          paint: {
            "line-color": "#101310",
            "line-width": ["interpolate", ["linear"], ["zoom"], 10, 6, 16, 12],
            "line-opacity": 0.92,
          },
        },
        before,
      );
      map.addLayer(
        {
          id: "route-line",
          type: "line",
          source: "route",
          layout: { "line-cap": "round", "line-join": "round" },
          paint: {
            "line-color": "#d8f88b",
            "line-width": [
              "interpolate",
              ["linear"],
              ["zoom"],
              10,
              3.2,
              16,
              6.8,
            ],
            "line-opacity": 0.96,
          },
        },
        before,
      );
      map.addLayer(
        {
          id: "route-played-line",
          type: "line",
          source: "route-played",
          layout: { "line-cap": "round", "line-join": "round" },
          paint: {
            "line-color": "#e9ffc2",
            "line-width": ["interpolate", ["linear"], ["zoom"], 10, 3.2, 16, 7],
            "line-blur": 0.35,
          },
        },
        before,
      );
      const restoredCoordinates = routeCoordinates(routeRef.current);
      (map.getSource("route") as GeoJSONSource).setData({
        type: "Feature",
        properties: {},
        geometry: { type: "LineString", coordinates: restoredCoordinates },
      });
      const restoredConnectors = routeConnectors(
        waypointsRef.current,
        restoredCoordinates,
      );
      (map.getSource("route-connectors") as GeoJSONSource).setData(
        restoredConnectors,
      );
      (map.getSource("route-played") as GeoJSONSource).setData({
        type: "Feature",
        properties: {},
        geometry: {
          type: "LineString",
          coordinates: lineAtProgress(
            restoredCoordinates,
            replayProgressRef.current,
          ),
        },
      });
      const restoredBuilding = heldBuildingRef.current;
      (map.getSource("selected-building") as GeoJSONSource).setData(
        restoredBuilding
          ? {
              type: "FeatureCollection",
              features: [restoredBuilding.feature],
            }
          : emptyFeatures(),
      );
      if (containerRef.current) {
        containerRef.current.dataset.routeCoordinateCount = String(
          restoredCoordinates.length,
        );
        containerRef.current.dataset.styleRouteRestored =
          restoredCoordinates.length > 1 ? "true" : "false";
      }
      if (restoredCoordinates.length > 1) {
        preserveCameraForRouteRef.current = true;
      }
      map.setTerrain(
        usesTerrain(surfaceRef.current)
          ? {
              source: "mapsource-terrain",
              exaggeration: surfaceRef.current === "elevation" ? 1.3 : 1.08,
            }
          : null,
      );
      const paleSurface = surfaceRef.current === "light";
      map.setSky({
        "sky-color": paleSurface ? "#dfe5dd" : "#111811",
        "horizon-color": paleSurface ? "#eef0e9" : "#1d291f",
        "fog-color": paleSurface ? "#e7e9e2" : "#182119",
        "fog-ground-blend": 0.72,
        "horizon-fog-blend": 0.9,
        "sky-horizon-blend": 0.82,
        "atmosphere-blend": 0.18,
      });
      if (containerRef.current) {
        containerRef.current.dataset.surface = surfaceRef.current;
        containerRef.current.dataset.terrain = usesTerrain(surfaceRef.current)
          ? "on"
          : "off";
        containerRef.current.dataset.fog = "on";
      }
      const camera = pendingCameraRef.current;
      if (camera) {
        map.jumpTo(camera);
        pendingCameraRef.current = null;
      }
      updateMapTelemetry();
      if (!attributionAdded) {
        map.addControl(attribution, "bottom-right");
        attributionAdded = true;
        const element = containerRef.current?.querySelector(
          ".maplibregl-ctrl-attrib",
        );
        element?.parentElement?.append(element);
      }
      closeAttribution(containerRef.current);
      setReady(true);
      if (surfaceTransitionTimer !== null) {
        window.clearTimeout(surfaceTransitionTimer);
      }
      surfaceTransitionTimer = window.setTimeout(() => {
        containerRef.current?.classList.remove("is-switching-surface");
        surfaceTransitionTimer = null;
      }, 260);
      if (resumeFollowAfterStyleRef.current) {
        resumeFollowAfterStyleRef.current = false;
        window.requestAnimationFrame(recenterOnUser);
      }
    });
    window.requestAnimationFrame(() => {
      closeAttribution(containerRef.current);
    });
    map.on("click", (event: MapMouseEvent) => {
      if (selectedRef.current) {
        preserveCameraForRouteRef.current = true;
        onMapPickRef.current({ lat: event.lngLat.lat, lon: event.lngLat.lng });
      }
    });
    map.on("moveend", () => {
      updateMapTelemetry();
      const center = map.getCenter();
      onCenterChangeRef.current({ lat: center.lat, lon: center.lng });
      const bounds = map.getBounds();
      onBoundsChangeRef.current({
        west: bounds.getWest(),
        south: bounds.getSouth(),
        east: bounds.getEast(),
        north: bounds.getNorth(),
      });
    });

    return () => {
      setReady(false);
      geolocateButton.removeEventListener("click", requestOrientation, {
        capture: true,
      });
      geolocateButton.removeEventListener("click", activateLocation);
      if (locationWatchId !== null) {
        navigator.geolocation.clearWatch(locationWatchId);
        locationWatchId = null;
      }
      window.removeEventListener(
        "deviceorientationabsolute",
        orientationListener,
      );
      window.removeEventListener("deviceorientation", orientationListener);
      if (orientationFocusFrame !== null) {
        window.cancelAnimationFrame(orientationFocusFrame);
      }
      if (panelFocusFrame !== null) {
        window.cancelAnimationFrame(panelFocusFrame);
      }
      if (surfaceTransitionTimer !== null) {
        window.clearTimeout(surfaceTransitionTimer);
      }
      recenterButton.removeEventListener("click", recenterOnUser);
      window.removeEventListener("mapsource:recenter", recenterOnUser);
      recenterButton.remove();
      panelObserver.disconnect();
      map.off("zoomstart", handleZoomStart);
      map.off("zoomend", handleZoomEnd);
      map.off("dragstart", handlePanStart);
      map.off("rotatestart", handleCameraAdjustmentStart);
      map.off("pitchstart", handleCameraAdjustmentStart);
      map.off("rotateend", handleCameraAdjustmentEnd);
      map.off("pitchend", handleCameraAdjustmentEnd);
      cancelHold();
      if (holdFocusTimer !== null) window.clearTimeout(holdFocusTimer);
      canvasContainer.removeEventListener("pointerdown", beginHold, true);
      window.removeEventListener("touchstart", trackTouchStart, true);
      window.removeEventListener("touchend", trackTouchEnd, true);
      window.removeEventListener("touchcancel", trackTouchEnd, true);
      window.removeEventListener("touchmove", trackTouchMove, true);
      mapContainer.removeEventListener(
        "pointerdown",
        captureZoomControlIntent,
        true,
      );
      canvasContainer.removeEventListener(
        "wheel",
        captureWheelZoomIntent,
        true,
      );
      window.removeEventListener("pointermove", trackHold, true);
      window.removeEventListener("pointerup", endHold, true);
      window.removeEventListener("pointercancel", endHold, true);
      if (userLocationAnimationFrame !== null) {
        window.cancelAnimationFrame(userLocationAnimationFrame);
      }
      userLocationMarker.remove();
      locationSmoother.clear();
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (
      !map ||
      !ready ||
      !initialLocation ||
      initialLocationAppliedRef.current ||
      userTrackingRef.current ||
      userCameraInteractedRef.current ||
      waypointsRef.current.length > 0 ||
      routeCoordinates(routeRef.current).length > 0
    ) {
      return;
    }
    initialLocationAppliedRef.current = true;
    map.easeTo({
      center: initialLocation.center,
      zoom: initialLocation.zoom,
      duration: 720,
      essential: true,
    });
    if (containerRef.current) {
      containerRef.current.dataset.initialLocation = initialLocation.source;
      containerRef.current.dataset.initialLocationLabel = initialLocation.label;
    }
  }, [initialLocation, ready]);

  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.dataset.navigation = navigationActive
        ? "active"
        : "inactive";
    }
  }, [navigationActive]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || loadedSurfaceRef.current === surface) return;
    loadedSurfaceRef.current = surface;
    const center = map.getCenter();
    pendingCameraRef.current = {
      center: [center.lng, center.lat],
      zoom: map.getZoom(),
      bearing: map.getBearing(),
      pitch: map.getPitch(),
    };
    resumeFollowAfterStyleRef.current = userFollowingRef.current;
    containerRef.current?.classList.add("is-switching-surface");
    map.setStyle(`/map/style.json?surface=${surface}`, { diff: true });
  }, [surface]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready || !map.getLayer("active-rail-network")) return;
    map.setLayoutProperty(
      "active-rail-network",
      "visibility",
      mode === "train" ? "visible" : "none",
    );
    if (containerRef.current) {
      containerRef.current.dataset.transportContext =
        mode === "bus"
          ? "bus-stops"
          : mode === "train"
            ? "railway-tracks-stations-light-rail"
            : "road-network";
    }
  }, [mode, ready]);

  useEffect(() => {
    const map = mapRef.current;
    intermediateMarkerRef.current?.remove();
    intermediateMarkerRef.current = null;
    if (!map || !ready || !heldPoint) return;
    const element = document.createElement("div");
    element.className = "intermediate-point";
    element.addEventListener("pointerdown", (event) => event.stopPropagation());

    if (heldPointDetails) {
      const label = document.createElement("div");
      label.className = "intermediate-point__label";
      label.ariaLive = "polite";
      const title = document.createElement("strong");
      title.textContent = heldPointDetails.title;
      label.append(title);
      if (heldPointDetails.detail) {
        const detail = document.createElement("small");
        detail.textContent = heldPointDetails.detail;
        label.append(detail);
      }
      element.append(label);
    }

    const origin = document.createElement("button");
    origin.type = "button";
    origin.className = "intermediate-point__origin";
    origin.ariaLabel = "Dismiss selected map point";
    origin.title = "Dismiss";
    appendSvg(origin, intermediateIconPaths.origin);
    origin.addEventListener("click", () => {
      setHeldPoint(null);
      setHeldBuilding(null);
    });
    element.append(origin);

    const coordinate = { lat: heldPoint[1], lon: heldPoint[0] };
    const actions = [
      {
        id: "add",
        label: "Add map point to route",
        run: () => {
          onAddIntermediateRef.current(coordinate);
          setHeldPoint(null);
        },
      },
      {
        id: "inspect",
        label: "Inspect map point",
        run: () => onInspectPointRef.current(coordinate, true),
      },
      {
        id: "navigate",
        label: "Navigate to map point",
        run: () => {
          const location = latestUserLocationRef.current;
          onNavigatePointRef.current(
            coordinate,
            userTrackingRef.current && location
              ? { lat: location[1], lon: location[0] }
              : null,
          );
          setHeldPoint(null);
        },
      },
    ] as const;
    for (const action of actions) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = `intermediate-point__action intermediate-point__action--${action.id}`;
      button.ariaLabel = action.label;
      button.title = action.label;
      appendSvg(button, intermediateIconPaths[action.id]);
      button.addEventListener("click", (event) => {
        event.stopPropagation();
        action.run();
      });
      element.append(button);
    }
    intermediateMarkerRef.current = new MapLibreMarker({
      element,
      anchor: "top",
    })
      .setLngLat(heldPoint)
      .addTo(map);
    window.requestAnimationFrame(() => {
      const rect = origin.getBoundingClientRect();
      const projected = map.project(heldPoint);
      const delta = Math.hypot(
        rect.left + rect.width / 2 - projected.x,
        rect.top + rect.height / 2 - projected.y,
      );
      if (containerRef.current) {
        containerRef.current.dataset.heldPointPixelError = delta.toFixed(2);
      }
    });
    return () => {
      intermediateMarkerRef.current?.remove();
      intermediateMarkerRef.current = null;
    };
  }, [heldPoint, heldPointDetails, ready]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    const source = map.getSource("selected-building") as
      | GeoJSONSource
      | undefined;
    source?.setData(
      heldBuilding
        ? { type: "FeatureCollection", features: [heldBuilding.feature] }
        : emptyFeatures(),
    );
    if (containerRef.current) {
      containerRef.current.dataset.selectedBuilding = heldBuilding
        ? "highlighted"
        : "none";
      containerRef.current.dataset.selectedBuildingRendering = heldBuilding
        ? "extruded"
        : "none";
      containerRef.current.dataset.selectedBuildingParts = heldBuilding
        ? "1"
        : "0";
      containerRef.current.dataset.selectedBuildingName = String(
        heldBuilding?.feature.properties?.name ?? "",
      );
      containerRef.current.dataset.selectedBuildingLookup = heldBuilding
        ? heldBuilding.lookupCoordinate.join(",")
        : "";
    }
  }, [heldBuilding, ready]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    businessMarkersRef.current.forEach((marker) => marker.remove());
    businessMarkersRef.current = [];
    businessPopupRef.current?.remove();
    businessPopupRef.current = null;
    if (!activeDiscovery) {
      focusedDiscoveryRef.current = null;
      return;
    }
    const points: Coordinate[] = [];
    for (const place of discoveryPlaces) {
      if (!place.coordinate) continue;
      const coordinate: Coordinate = [
        place.coordinate.lon,
        place.coordinate.lat,
      ];
      points.push(coordinate);
      const element = document.createElement("button");
      element.type = "button";
      element.className = "business-marker";
      element.ariaLabel = place.name ?? `Open ${activeDiscovery} details`;
      appendSvg(
        element,
        businessIconPaths[activeDiscovery] ?? businessIconPaths.shop!,
      );
      const marker = new MapLibreMarker({ element })
        .setLngLat(coordinate)
        .addTo(map);
      element.addEventListener("click", (event) => {
        event.stopPropagation();
        businessPopupRef.current?.remove();
        businessMarkersRef.current.forEach((item) =>
          item.getElement().classList.toggle("is-active", item === marker),
        );
        businessPopupRef.current = new Popup({
          closeButton: true,
          closeOnClick: true,
          offset: 18,
          maxWidth: "290px",
        })
          .setLngLat(coordinate)
          .setDOMContent(placePopup(place, activeDiscovery))
          .addTo(map);
      });
      businessMarkersRef.current.push(marker);
    }
    const isTransportContext = ["transit_stop", "railway_station"].includes(
      activeDiscovery,
    );
    if (
      points.length > 0 &&
      !isTransportContext &&
      focusedDiscoveryRef.current !== activeDiscovery
    ) {
      const bounds = points.reduce(
        (value, coordinate) => value.extend(coordinate),
        new LngLatBounds(points[0]!, points[0]!),
      );
      map.fitBounds(bounds, {
        padding: visibleMapPadding(),
        maxZoom: 14.25,
        pitch: 42,
        bearing: map.getBearing(),
        duration: 800,
        essential: true,
      });
      focusedDiscoveryRef.current = activeDiscovery;
    }
    return () => {
      businessMarkersRef.current.forEach((marker) => marker.remove());
      businessMarkersRef.current = [];
      businessPopupRef.current?.remove();
      businessPopupRef.current = null;
    };
  }, [activeDiscovery, discoveryPlaces, ready]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    markersRef.current.forEach((marker) => marker.remove());
    const cleanups: Array<() => void> = [];
    markersRef.current = waypoints.map((waypoint, index) => {
      const element = document.createElement("button");
      element.type = "button";
      element.className = `map-stop ${selectedWaypointId === waypoint.id ? "is-selected" : ""}`;
      element.setAttribute(
        "aria-label",
        `Hold and drag ${waypoint.label} to move this stop`,
      );
      element.title = "Hold, then drag to move this stop";
      const visual = document.createElement("span");
      visual.className = "map-stop__visual";
      const label = document.createElement("span");
      label.className = "map-stop__label";
      label.textContent =
        waypoints.length === 1 && waypoint.routeRole === "destination"
          ? "B"
          : index === 0
            ? "A"
            : index === waypoints.length - 1
              ? "B"
              : String(index + 1);
      visual.append(label);
      element.append(visual);
      element.addEventListener("click", (event) => event.stopPropagation());
      const marker = new MapLibreMarker({
        element,
        draggable: false,
        anchor: "bottom",
      })
        .setLngLat([waypoint.lon, waypoint.lat])
        .addTo(map);

      let holdTimer: number | null = null;
      let pointerId: number | null = null;
      let start = { x: 0, y: 0 };
      let dragAnchor: { x: number; y: number } | null = null;
      let dragDelta = { x: 0, y: 0 };
      let dragVisualOrigin: { x: number; y: number } | null = null;
      let armed = false;
      let moved = false;
      let restoreDragPan = false;
      let dragCamera: CameraSnapshot | null = null;

      const clearHoldTimer = () => {
        if (holdTimer !== null) window.clearTimeout(holdTimer);
        holdTimer = null;
      };
      const restoreMapPan = () => {
        const camera = dragCamera;
        if (restoreDragPan) {
          window.setTimeout(() => {
            map.stop();
            if (camera) map.jumpTo(camera);
            map.dragPan.enable();
          }, 80);
        }
        restoreDragPan = false;
      };
      const reset = () => {
        clearHoldTimer();
        pointerId = null;
        armed = false;
        moved = false;
        restoreMapPan();
        dragCamera = null;
        dragAnchor = null;
        dragDelta = { x: 0, y: 0 };
        dragVisualOrigin = null;
        element.classList.remove("is-dragging");
      };
      const pointerDown = (event: PointerEvent) => {
        if (event.button !== 0 || pointerId !== null) return;
        map.stop();
        pointerId = event.pointerId;
        start = { x: event.clientX, y: event.clientY };
        holdTimer = window.setTimeout(() => {
          if (pointerId !== event.pointerId) return;
          armed = true;
          restoreDragPan = map.dragPan.isEnabled();
          map.dragPan.disable();
          map.stop();
          const center = map.getCenter();
          dragCamera = {
            center: [center.lng, center.lat],
            zoom: map.getZoom(),
            bearing: map.getBearing(),
            pitch: map.getPitch(),
          };
          dragAnchor = map.project(marker.getLngLat());
          element.classList.add("is-dragging");
          element.setPointerCapture?.(event.pointerId);
          holdTimer = null;
        }, 520);
      };
      const pointerMove = (event: PointerEvent) => {
        if (event.pointerId !== pointerId) return;
        if (!armed) {
          if (
            Math.hypot(event.clientX - start.x, event.clientY - start.y) > 8
          ) {
            clearHoldTimer();
          }
          return;
        }
        event.preventDefault();
        event.stopPropagation();
        if (dragCamera) map.jumpTo(dragCamera);
        dragDelta = {
          x: event.clientX - start.x,
          y: event.clientY - start.y,
        };
        if (!dragVisualOrigin) {
          const bounds = element.getBoundingClientRect();
          dragVisualOrigin = { x: bounds.x, y: bounds.y };
        }
        marker.setOffset([dragDelta.x, dragDelta.y]);
        const rendered = element.getBoundingClientRect();
        if (containerRef.current) {
          containerRef.current.dataset.waypointDragPixelError = Math.hypot(
            rendered.x - dragVisualOrigin.x - dragDelta.x,
            rendered.y - dragVisualOrigin.y - dragDelta.y,
          ).toFixed(2);
        }
        moved = true;
      };
      const pointerEnd = (event: PointerEvent) => {
        if (event.pointerId !== pointerId) return;
        const commit = armed && moved && dragAnchor !== null;
        if (commit && dragCamera) map.jumpTo(dragCamera);
        const coordinate = commit
          ? map.unproject([
              dragAnchor!.x + dragDelta.x,
              dragAnchor!.y + dragDelta.y,
            ])
          : marker.getLngLat();
        marker.setOffset([0, 0]);
        if (commit) marker.setLngLat(coordinate);
        reset();
        if (!commit) return;
        event.preventDefault();
        event.stopPropagation();
        preserveCameraForRouteRef.current = true;
        onWaypointMove(waypoint.id, {
          lat: coordinate.lat,
          lon: coordinate.lng,
        });
      };
      element.addEventListener("pointerdown", pointerDown);
      window.addEventListener("pointermove", pointerMove, true);
      window.addEventListener("pointerup", pointerEnd, true);
      window.addEventListener("pointercancel", pointerEnd, true);
      cleanups.push(() => {
        reset();
        element.removeEventListener("pointerdown", pointerDown);
        window.removeEventListener("pointermove", pointerMove, true);
        window.removeEventListener("pointerup", pointerEnd, true);
        window.removeEventListener("pointercancel", pointerEnd, true);
      });
      return marker;
    });
    return () => {
      cleanups.forEach((cleanup) => cleanup());
      markersRef.current.forEach((marker) => marker.remove());
      markersRef.current = [];
    };
  }, [onWaypointMove, ready, selectedWaypointId, waypoints]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    map.getCanvas().classList.toggle("is-picking", Boolean(selectedWaypointId));
  }, [ready, selectedWaypointId]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    const coordinates = routeCoordinates(route);
    (map.getSource("route") as GeoJSONSource | undefined)?.setData({
      type: "Feature",
      properties: {},
      geometry: { type: "LineString", coordinates },
    });
    const connectors = routeConnectors(waypointsRef.current, coordinates);
    (map.getSource("route-connectors") as GeoJSONSource | undefined)?.setData(
      connectors,
    );
    if (containerRef.current) {
      containerRef.current.dataset.routeCoordinateCount = String(
        coordinates.length,
      );
      containerRef.current.dataset.routeConnectorCount = String(
        connectors.features.length,
      );
    }
    if (coordinates.length > 1 && !replaying && !userTrackingRef.current) {
      if (preserveCameraForRouteRef.current) {
        preserveCameraForRouteRef.current = false;
        if (containerRef.current) {
          containerRef.current.dataset.routeFit =
            "preserved-direct-manipulation";
        }
        return;
      }
      const bounds = coordinates.reduce(
        (value, coordinate) => value.extend(coordinate),
        new LngLatBounds(coordinates[0]!, coordinates[0]!),
      );
      waypointsRef.current.forEach((waypoint) =>
        bounds.extend([waypoint.lon, waypoint.lat]),
      );
      const padding = visibleMapPadding();
      map.fitBounds(bounds, {
        padding,
        maxZoom: 15.5,
        duration: 850,
        essential: true,
      });
      if (containerRef.current) {
        containerRef.current.dataset.routeFit = "automatic";
        containerRef.current.dataset.routePadding = [
          padding.top,
          padding.right,
          padding.bottom,
          padding.left,
        ].join(",");
      }
    }
  }, [ready, replaying, route]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    const coordinates = routeCoordinates(route);
    const traveled = lineAtProgress(coordinates, replayProgress);
    (map.getSource("route-played") as GeoJSONSource | undefined)?.setData({
      type: "Feature",
      properties: {},
      geometry: { type: "LineString", coordinates: traveled },
    });
    const point = pointAtProgress(coordinates, replayProgress);
    if (!point) return;
    let replayMarker = replayMarkerRef.current;
    if (!replayMarker) {
      const element = document.createElement("div");
      element.className = "replay-marker";
      element.innerHTML = "<span></span>";
      replayMarker = new MapLibreMarker({ element })
        .setLngLat(point)
        .addTo(map);
      replayMarkerRef.current = replayMarker;
    } else {
      replayMarker.setLngLat(point);
    }
    replayMarker
      .getElement()
      .classList.toggle(
        "is-active",
        !navigationActive && (replaying || replayProgress > 0),
      );
    const now = performance.now();
    if (replaying && now - lastCameraUpdate.current > 360) {
      const lookAhead =
        pointAtProgress(coordinates, Math.min(1, replayProgress + 0.008)) ??
        point;
      map.easeTo({
        center: point,
        bearing: bearingDegrees(point, lookAhead),
        pitch: usesTerrain(surface) ? 58 : 42,
        zoom: Math.max(14.2, map.getZoom()),
        duration: 420,
        essential: true,
      });
      lastCameraUpdate.current = now;
    }
  }, [navigationActive, ready, replayProgress, replaying, route, surface]);

  useEffect(
    () => () => {
      replayMarkerRef.current?.remove();
    },
    [],
  );

  return <div className="map-canvas" ref={containerRef} />;
}
