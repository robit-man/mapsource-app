import { useEffect, useRef, useState } from "react";
import {
  AttributionControl,
  GeolocateControl,
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
import type {
  Coordinate,
  DiscoveryPlace,
  MapSurface,
  RouteResponse,
  ViewBounds,
  Waypoint,
} from "../types";

setWorkerUrl("/assets/maplibre-gl-worker.mjs");

type MapCanvasProps = {
  waypoints: Waypoint[];
  route: RouteResponse | null;
  heldPointDetails: { title: string; detail?: string } | null;
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
  onUserLocation: (coordinate: { lat: number; lon: number }) => void;
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

function normalizeHeading(value: number) {
  return ((value % 360) + 360) % 360;
}

function smoothHeading(previous: number | null, next: number, weight = 0.24) {
  if (previous === null) return normalizeHeading(next);
  const delta = ((next - previous + 540) % 360) - 180;
  return normalizeHeading(previous + delta * weight);
}

function orientationHeading(event: CompassOrientationEvent): number | null {
  if (Number.isFinite(event.webkitCompassHeading)) {
    return normalizeHeading(event.webkitCompassHeading!);
  }
  if (
    !Number.isFinite(event.alpha) ||
    (!event.absolute && event.type !== "deviceorientationabsolute")
  ) {
    return null;
  }
  const alpha = (event.alpha! * Math.PI) / 180;
  const beta = ((event.beta ?? 0) * Math.PI) / 180;
  const gamma = ((event.gamma ?? 0) * Math.PI) / 180;
  const rA =
    -Math.cos(alpha) * Math.sin(gamma) -
    Math.sin(alpha) * Math.sin(beta) * Math.cos(gamma);
  const rB =
    -Math.sin(alpha) * Math.sin(gamma) +
    Math.cos(alpha) * Math.sin(beta) * Math.cos(gamma);
  let heading =
    Math.abs(rA) + Math.abs(rB) < 1e-7
      ? 360 - event.alpha!
      : (Math.atan2(rA, rB) * 180) / Math.PI;
  const legacyOrientation = (window as Window & { orientation?: number })
    .orientation;
  const screenAngle =
    window.screen.orientation?.angle ?? legacyOrientation ?? 0;
  heading += screenAngle;
  return normalizeHeading(heading);
}

const businessIconPaths: Record<string, string> = {
  cafe: "M6 8h10v5a4 4 0 0 1-4 4h-2a4 4 0 0 1-4-4V8Zm10 2h1a2 2 0 0 1 0 4h-1M9 4v2m4-2v2",
  restaurant: "M7 4v7m-3-7v4a3 3 0 0 0 6 0V4m-3 7v9m9-16v16m0-16c3 2 3 6 0 9",
  shop: "M4 9h16l-2-5H6L4 9Zm1 0v11h14V9M9 20v-6h6v6",
  supermarket: "m3 4 2 2 2 9h10l3-7H6m3 11h.01M17 19h.01",
  pharmacy: "M12 5v14M5 12h14",
  fuel: "M5 3h10v18H5V3Zm3 4h4m3 2h2l2 2v6a2 2 0 0 0 2 2V9",
  hotel: "M4 19V6m0 9h16v4M7 11h4a3 3 0 0 1 3 3v1",
  park: "m12 3-5 8h3l-4 6h12l-4-6h3l-5-8Zm0 14v4",
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
  selectedWaypointId,
  onWaypointMove,
  onMapPick,
  onAddIntermediate,
  onInspectPoint,
  onNavigatePoint,
  onUserLocation,
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
  const onCenterChangeRef = useRef(onCenterChange);
  const onBoundsChangeRef = useRef(onBoundsChange);
  const surfaceRef = useRef(surface);
  const routeRef = useRef(route);
  const waypointsRef = useRef(waypoints);
  const replayingRef = useRef(replaying);
  const userTrackingRef = useRef(false);
  const deviceHeadingRef = useRef<number | null>(null);
  const gpsCourseRef = useRef<number | null>(null);
  const latestUserLocationRef = useRef<Coordinate | null>(null);
  const loadedSurfaceRef = useRef(surface);
  const pendingCameraRef = useRef<CameraSnapshot | null>(null);
  const preserveCameraForRouteRef = useRef(false);
  const [ready, setReady] = useState(false);
  const [heldPoint, setHeldPoint] = useState<Coordinate | null>(null);
  const [heldBuilding, setHeldBuilding] = useState<BuildingSelection | null>(
    null,
  );
  const lastCameraUpdate = useRef(0);
  const lastOrientationUpdate = useRef(0);

  useEffect(() => {
    selectedRef.current = selectedWaypointId;
    onMapPickRef.current = onMapPick;
    onAddIntermediateRef.current = onAddIntermediate;
    onInspectPointRef.current = onInspectPoint;
    onNavigatePointRef.current = onNavigatePoint;
    onUserLocationRef.current = onUserLocation;
    onCenterChangeRef.current = onCenterChange;
    onBoundsChangeRef.current = onBoundsChange;
    surfaceRef.current = surface;
    routeRef.current = route;
    waypointsRef.current = waypoints;
    replayingRef.current = replaying;
  }, [
    onCenterChange,
    onAddIntermediate,
    onBoundsChange,
    onInspectPoint,
    onMapPick,
    onNavigatePoint,
    onUserLocation,
    replaying,
    route,
    selectedWaypointId,
    surface,
    waypoints,
  ]);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = new MapLibreMap({
      container: containerRef.current,
      style: `/map/style.json?surface=${surfaceRef.current}`,
      center: [-122.716, 45.531],
      zoom: 13.4,
      pitch: 42,
      bearing: -18,
      maxPitch: 70,
      attributionControl: false,
      cooperativeGestures: false,
    });
    mapRef.current = map;
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
    const geolocate = new GeolocateControl({
      positionOptions: { enableHighAccuracy: true },
      fitBoundsOptions: { maxZoom: 16 },
      trackUserLocation: true,
    });
    map.addControl(geolocate, "bottom-right");
    let attributionAdded = false;

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
    };

    const orientToUser = (
      location: Coordinate,
      positionHeading?: number | null,
      positionSpeed?: number | null,
    ) => {
      if (!userTrackingRef.current || replayingRef.current) return;
      const routeBearing = nearestRouteBearing(
        routeCoordinates(routeRef.current),
        location,
      );
      const heading =
        (Number.isFinite(positionHeading) && (positionSpeed ?? 0) >= 0.8
          ? normalizeHeading(positionHeading!)
          : null) ??
        deviceHeadingRef.current ??
        gpsCourseRef.current ??
        routeBearing ??
        map.getBearing();
      map.easeTo(
        {
          center: location,
          bearing: heading,
          pitch: routeRef.current ? 54 : 42,
          zoom: Math.max(routeRef.current ? 15 : 14, map.getZoom()),
          duration: 180,
          essential: true,
        },
        { geolocateSource: true },
      );
      if (containerRef.current) {
        containerRef.current.dataset.cameraBearing = heading.toFixed(1);
      }
    };

    const orientationListener = (rawEvent: Event) => {
      const event = rawEvent as CompassOrientationEvent;
      const accuracy = event.webkitCompassAccuracy;
      const button = containerRef.current?.querySelector<HTMLElement>(
        ".maplibregl-ctrl-geolocate",
      );
      if (Number.isFinite(accuracy)) {
        if (button) button.dataset.compassAccuracy = accuracy!.toFixed(0);
        if (accuracy! > 45) {
          if (button) button.dataset.orientation = "calibrate";
          return;
        }
      }
      const heading = orientationHeading(event);
      if (heading === null) return;
      const smoothed = smoothHeading(
        deviceHeadingRef.current,
        heading,
        deviceHeadingRef.current === null ? 1 : 0.24,
      );
      deviceHeadingRef.current = smoothed;
      if (button) {
        button.dataset.heading = smoothed.toFixed(1);
        button.dataset.orientation = "granted";
      }
      if (containerRef.current) {
        containerRef.current.dataset.userHeading = smoothed.toFixed(1);
      }
      const now = performance.now();
      if (now - lastOrientationUpdate.current < 100) return;
      const location = latestUserLocationRef.current;
      if (location) orientToUser(location);
      lastOrientationUpdate.current = now;
    };

    let orientationListening = false;
    const startOrientation = () => {
      if (orientationListening) return;
      orientationListening = true;
      window.addEventListener("deviceorientationabsolute", orientationListener);
      window.addEventListener("deviceorientation", orientationListener);
    };

    let geolocateButton: HTMLElement | null = null;
    const requestOrientation = async () => {
      geolocateButton ??=
        containerRef.current?.querySelector<HTMLElement>(
          ".maplibregl-ctrl-geolocate",
        ) ?? null;
      const Orientation = window.DeviceOrientationEvent as
        | PermissionedOrientationConstructor
        | undefined;
      if (!Orientation) {
        if (geolocateButton)
          geolocateButton.dataset.orientation = "unsupported";
        return;
      }
      try {
        const permission = Orientation.requestPermission
          ? await Orientation.requestPermission()
          : "granted";
        if (geolocateButton) geolocateButton.dataset.orientation = permission;
        if (permission === "granted") startOrientation();
      } catch {
        if (geolocateButton) geolocateButton.dataset.orientation = "denied";
      }
    };

    const attachOrientationRequest = () => {
      geolocateButton =
        containerRef.current?.querySelector<HTMLElement>(
          ".maplibregl-ctrl-geolocate",
        ) ?? null;
      geolocateButton?.addEventListener("click", requestOrientation, {
        capture: true,
      });
    };
    window.requestAnimationFrame(attachOrientationRequest);

    const canvasContainer = map.getCanvasContainer();
    let holdTimer: number | null = null;
    let holdFocusTimer: number | null = null;
    let holdStart: { pointerId: number; x: number; y: number } | null = null;
    const cancelHold = () => {
      if (holdTimer !== null) window.clearTimeout(holdTimer);
      holdTimer = null;
      holdStart = null;
    };
    const focusHeldPoint = (coordinate: Coordinate) => {
      const panel = document.querySelector<HTMLElement>(".route-panel");
      const width = map.getContainer().clientWidth;
      const height = map.getContainer().clientHeight;
      let targetX = width / 2;
      let targetY = height / 2;
      if (window.innerWidth <= 760) {
        const panelHeight = panel?.getBoundingClientRect().height ?? 154;
        const sheetMode = panel?.dataset.sheetMode ?? "half";
        targetY =
          sheetMode === "minimized"
            ? height / 2 - Math.min(42, panelHeight * 0.28)
            : Math.max(70, (height - panelHeight) / 2);
      } else if (panel) {
        targetX = (panel.getBoundingClientRect().right + width) / 2;
      }
      const offset: [number, number] = [
        targetX - width / 2,
        targetY - height / 2,
      ];
      if (containerRef.current) {
        containerRef.current.dataset.heldFocusTarget = [
          targetX.toFixed(1),
          targetY.toFixed(1),
        ].join(",");
      }
      map.once("moveend", () => {
        const rendered = map.project(coordinate);
        if (containerRef.current) {
          containerRef.current.dataset.heldFocusError = Math.hypot(
            rendered.x - targetX,
            rendered.y - targetY,
          ).toFixed(2);
        }
      });
      map.easeTo({
        center: coordinate,
        offset,
        duration: 520,
        essential: true,
      });
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

    geolocate.on("trackuserlocationstart", () => {
      userTrackingRef.current = true;
      const location = latestUserLocationRef.current;
      if (location) orientToUser(location);
    });
    geolocate.on("userlocationfocus", () => {
      userTrackingRef.current = true;
      const location = latestUserLocationRef.current;
      if (location) orientToUser(location);
    });
    geolocate.on("trackuserlocationend", () => {
      userTrackingRef.current = false;
    });
    geolocate.on("geolocate", (event) => {
      const location: Coordinate = [
        event.coords.longitude,
        event.coords.latitude,
      ];
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
      onUserLocationRef.current({ lat: location[1], lon: location[0] });
      orientToUser(location, event.coords.heading, event.coords.speed);
    });

    map.on("styledataloading", () => setReady(false));
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
      geolocateButton?.removeEventListener("click", requestOrientation, {
        capture: true,
      });
      window.removeEventListener(
        "deviceorientationabsolute",
        orientationListener,
      );
      window.removeEventListener("deviceorientation", orientationListener);
      cancelHold();
      if (holdFocusTimer !== null) window.clearTimeout(holdFocusTimer);
      canvasContainer.removeEventListener("pointerdown", beginHold, true);
      window.removeEventListener("pointermove", trackHold, true);
      window.removeEventListener("pointerup", endHold, true);
      window.removeEventListener("pointercancel", endHold, true);
      map.remove();
      mapRef.current = null;
    };
  }, []);

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
    map.setStyle(`/map/style.json?surface=${surface}`);
  }, [surface]);

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
            location ? { lat: location[1], lon: location[0] } : null,
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
    if (points.length > 0 && focusedDiscoveryRef.current !== activeDiscovery) {
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
      .classList.toggle("is-active", replaying || replayProgress > 0);
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
  }, [ready, replayProgress, replaying, route, surface]);

  useEffect(
    () => () => {
      replayMarkerRef.current?.remove();
    },
    [],
  );

  return <div className="map-canvas" ref={containerRef} />;
}
