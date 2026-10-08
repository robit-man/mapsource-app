import { Marker, type Map as MapLibreMap } from "maplibre-gl";
import type { Coordinate } from "./types";

/** Match the held-point menu: a fixed outer box, with its origin at top center.
 * Hover animations belong to children, never MapLibre's positioned element. */
export function anchoredPointMarker(
  element: HTMLElement,
  coordinate: Coordinate,
  map: MapLibreMap,
) {
  return new Marker({ element, anchor: "top" })
    .setLngLat(coordinate)
    .addTo(map);
}

export function placeMarkerElement(className: string) {
  const element = document.createElement("button");
  element.type = "button";
  element.className = `map-point-anchor ${className}`;
  const visual = document.createElement("span");
  visual.className = "map-point-anchor__visual";
  element.append(visual);
  return { element, visual };
}

export function bindResultHover(
  element: HTMLElement,
  resultId: string,
  onHover: (id: string | null) => void,
) {
  element.addEventListener("pointerenter", (event) => {
    if (event.pointerType !== "touch") onHover(resultId);
  });
  element.addEventListener("pointerleave", (event) => {
    if (event.pointerType !== "touch") onHover(null);
  });
  element.addEventListener("focus", () => onHover(resultId));
  element.addEventListener("blur", () => onHover(null));
}
