import type { DiscoveryPlace } from "./types";

const GENERIC_PLACE_LABELS = new Set([
  "yes",
  "building",
  "buildings",
  "house",
  "residential",
  "apartments",
  "detached",
  "commercial",
  "retail",
  "roof",
]);

function usefulLabel(value: string | null | undefined) {
  const label = value?.trim();
  if (!label || GENERIC_PLACE_LABELS.has(label.toLowerCase())) return null;
  return label;
}

export function meaningfulPlaceName(place: DiscoveryPlace | null) {
  return usefulLabel(place?.name);
}

export function meaningfulPlaceCategories(place: DiscoveryPlace | null) {
  return (place?.categories ?? [])
    .map(usefulLabel)
    .filter((value): value is string => Boolean(value));
}

export function placeAddress(place: DiscoveryPlace | null) {
  if (!place) return "";
  const street = [place.address.housenumber, place.address.street]
    .filter(Boolean)
    .join(" ");
  const locality = [
    place.address.city,
    place.address.state,
    place.address.postcode,
  ]
    .filter(Boolean)
    .join(" ");
  return [street, locality].filter(Boolean).join(", ");
}

export function coordinateLabel(coordinate: { lat: number; lon: number }) {
  return `${coordinate.lat.toFixed(5)}, ${coordinate.lon.toFixed(5)}`;
}

export function waypointLabelForPlace(
  place: DiscoveryPlace | null,
  coordinate: { lat: number; lon: number },
) {
  const name = meaningfulPlaceName(place);
  const address = placeAddress(place);
  const coordinates = coordinateLabel(coordinate);
  if (address) return name ?? address;
  return name ? `${name} · ${coordinates}` : coordinates;
}
