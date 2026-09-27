import { useEffect, useRef, useState } from "react";
import {
  AttributionControl,
  GeolocateControl,
  LngLatBounds,
  Map as MapLibreMap,
  Marker as MapLibreMarker,
  NavigationControl,
  setWorkerUrl,
  type GeoJSONSource,
  type MapMouseEvent,
  type Marker,
} from "maplibre-gl";
import type { Feature, LineString } from "geojson";
import {
  bearingDegrees,
  lineAtProgress,
  pointAtProgress,
} from "../route-utils";
import type { Coordinate, RouteResponse, Waypoint } from "../types";

setWorkerUrl("/assets/maplibre-gl-worker.mjs");

type MapCanvasProps = {
  waypoints: Waypoint[];
  route: RouteResponse | null;
  selectedWaypointId: string | null;
  onWaypointMove: (
    id: string,
    coordinate: { lat: number; lon: number },
  ) => void;
  onMapPick: (coordinate: { lat: number; lon: number }) => void;
  onCenterChange: (coordinate: { lat: number; lon: number }) => void;
  satellite: boolean;
  satelliteOpacity: number;
  terrain: boolean;
  replayProgress: number;
  replaying: boolean;
};

const emptyLine = (): Feature<LineString> => ({
  type: "Feature",
  properties: {},
  geometry: { type: "LineString", coordinates: [] },
});

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

export function MapCanvas({
  waypoints,
  route,
  selectedWaypointId,
  onWaypointMove,
  onMapPick,
  onCenterChange,
  satellite,
  satelliteOpacity,
  terrain,
  replayProgress,
  replaying,
}: MapCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const markersRef = useRef<Marker[]>([]);
  const replayMarkerRef = useRef<Marker | null>(null);
  const selectedRef = useRef(selectedWaypointId);
  const onMapPickRef = useRef(onMapPick);
  const onCenterChangeRef = useRef(onCenterChange);
  const [ready, setReady] = useState(false);
  const lastCameraUpdate = useRef(0);

  useEffect(() => {
    selectedRef.current = selectedWaypointId;
    onMapPickRef.current = onMapPick;
    onCenterChangeRef.current = onCenterChange;
  }, [onCenterChange, onMapPick, selectedWaypointId]);

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;
    const map = new MapLibreMap({
      container: containerRef.current,
      style: "/map/style.json",
      center: [-122.716, 45.531],
      zoom: 13.4,
      pitch: 42,
      bearing: -18,
      maxPitch: 70,
      attributionControl: false,
      cooperativeGestures: false,
    });
    mapRef.current = map;
    map.addControl(
      new NavigationControl({ showCompass: true, visualizePitch: true }),
      "bottom-right",
    );
    map.addControl(
      new GeolocateControl({
        positionOptions: { enableHighAccuracy: true },
        trackUserLocation: true,
      }),
      "bottom-right",
    );
    map.addControl(new AttributionControl({ compact: true }), "bottom-right");

    map.on("load", () => {
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
          layout: { visibility: "none" },
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
      setReady(true);
    });
    map.on("click", (event: MapMouseEvent) => {
      if (selectedRef.current) {
        onMapPickRef.current({ lat: event.lngLat.lat, lon: event.lngLat.lng });
      }
    });
    map.on("moveend", () => {
      const center = map.getCenter();
      onCenterChangeRef.current({ lat: center.lat, lon: center.lng });
    });

    return () => {
      setReady(false);
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    map.setLayoutProperty(
      "satellite",
      "visibility",
      satellite ? "visible" : "none",
    );
    map.setPaintProperty("satellite", "raster-opacity", satelliteOpacity);
  }, [ready, satellite, satelliteOpacity]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    map.setTerrain(
      terrain ? { source: "mapsource-terrain", exaggeration: 1.12 } : null,
    );
    map.easeTo({ pitch: terrain ? 54 : 36, duration: 500, essential: true });
  }, [ready, terrain]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    markersRef.current.forEach((marker) => marker.remove());
    markersRef.current = waypoints.map((waypoint, index) => {
      const element = document.createElement("button");
      element.type = "button";
      element.className = `map-stop ${selectedWaypointId === waypoint.id ? "is-selected" : ""}`;
      element.setAttribute(
        "aria-label",
        `Drag ${waypoint.label} to move this stop`,
      );
      const label = document.createElement("span");
      label.textContent =
        index === 0
          ? "A"
          : index === waypoints.length - 1
            ? "B"
            : String(index + 1);
      element.append(label);
      element.addEventListener("click", (event) => event.stopPropagation());
      const marker = new MapLibreMarker({
        element,
        draggable: true,
        anchor: "bottom",
      })
        .setLngLat([waypoint.lon, waypoint.lat])
        .addTo(map);
      marker.on("dragstart", () => element.classList.add("is-dragging"));
      marker.on("dragend", () => {
        element.classList.remove("is-dragging");
        const coordinate = marker.getLngLat();
        onWaypointMove(waypoint.id, {
          lat: coordinate.lat,
          lon: coordinate.lng,
        });
      });
      return marker;
    });
    return () => {
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
    if (coordinates.length > 1 && !replaying) {
      const bounds = coordinates.reduce(
        (value, coordinate) => value.extend(coordinate),
        new LngLatBounds(coordinates[0]!, coordinates[0]!),
      );
      map.fitBounds(bounds, {
        padding: {
          top: 120,
          right: 90,
          bottom: 120,
          left: window.innerWidth >= 800 ? 455 : 70,
        },
        maxZoom: 15.5,
        duration: 850,
        essential: true,
      });
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
        pitch: terrain ? 58 : 42,
        zoom: Math.max(14.2, map.getZoom()),
        duration: 420,
        essential: true,
      });
      lastCameraUpdate.current = now;
    }
  }, [ready, replayProgress, replaying, route, terrain]);

  useEffect(
    () => () => {
      replayMarkerRef.current?.remove();
    },
    [],
  );

  return <div className="map-canvas" ref={containerRef} />;
}
