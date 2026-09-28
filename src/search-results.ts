import {
  meaningfulPlaceCategories,
  meaningfulPlaceName,
  placeAddress,
} from "./place-utils";
import type {
  DiscoveryPlace,
  PresentedSearchResult,
  SearchResult,
} from "./types";

const MAX_PRESENTED_RESULTS = 80;

function finiteCoordinate(
  coordinate: SearchResult["coordinate"] | DiscoveryPlace["coordinate"],
): { lat: number; lon: number } | null {
  const lat = coordinate?.lat;
  const lon = coordinate?.lon;
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  if (lat! < -90 || lat! > 90 || lon! < -180 || lon! > 180) return null;
  return { lat: lat!, lon: lon! };
}

function stableHash(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function uniqueId(base: string, seen: Map<string, number>) {
  const occurrence = (seen.get(base) ?? 0) + 1;
  seen.set(base, occurrence);
  return occurrence === 1 ? base : `${base}:${occurrence}`;
}

function compactDetail(name: string, detail: string | undefined) {
  const value = detail?.trim() ?? "";
  if (!value || value.toLocaleLowerCase() === name.toLocaleLowerCase()) {
    return "Place on the map";
  }
  return value;
}

export function normalizeSearchResults(
  results: readonly SearchResult[],
): PresentedSearchResult[] {
  const seen = new Map<string, number>();
  const normalized: PresentedSearchResult[] = [];
  for (const result of results) {
    if (normalized.length >= MAX_PRESENTED_RESULTS) break;
    const coordinate = finiteCoordinate(result.coordinate);
    if (!coordinate) continue;
    const name =
      result.name?.trim() || result.displayName?.trim() || "Unnamed place";
    const signature = [
      result.id ?? "",
      name,
      coordinate.lat.toFixed(6),
      coordinate.lon.toFixed(6),
    ].join("|");
    const base = result.id
      ? `text:${result.id}`
      : `text:${stableHash(signature)}`;
    normalized.push({
      id: uniqueId(base, seen),
      sourceId: result.id ?? null,
      source: "text",
      name,
      detail: compactDetail(name, result.displayName ?? result.category),
      coordinate,
      kind: result.kind,
      category: result.category?.trim() || null,
      distanceMeters: Number.isFinite(result.distanceMeters)
        ? result.distanceMeters!
        : null,
    });
  }
  return normalized;
}

export function presentDiscoveryPlaces(
  places: readonly DiscoveryPlace[],
): PresentedSearchResult[] {
  const seen = new Map<string, number>();
  const normalized: PresentedSearchResult[] = [];
  for (const place of places) {
    if (normalized.length >= MAX_PRESENTED_RESULTS) break;
    const coordinate = finiteCoordinate(place.coordinate);
    if (!coordinate) continue;
    const address = placeAddress(place);
    const category = meaningfulPlaceCategories(place)[0] ?? null;
    const name = meaningfulPlaceName(place) ?? (address || "Unnamed place");
    normalized.push({
      id: uniqueId(`discovery:${place.id}`, seen),
      sourceId: place.id,
      source: "discovery",
      name,
      detail: compactDetail(name, address || category || undefined),
      coordinate,
      kind: "business",
      category,
      distanceMeters: Number.isFinite(place.distanceMeters)
        ? place.distanceMeters
        : null,
    });
  }
  return normalized;
}

export function resultDistanceLabel(distanceMeters: number | null) {
  if (distanceMeters === null) return null;
  if (distanceMeters < 1_000) return `${Math.round(distanceMeters)} m away`;
  return `${(distanceMeters / 1_000).toFixed(distanceMeters < 10_000 ? 1 : 0)} km away`;
}
