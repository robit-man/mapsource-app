type SearchCoordinate = { lat?: number; lon?: number };

export type RegionRankedSearchResult = {
  coordinate?: SearchCoordinate;
  distanceMeters?: number;
  match?: {
    type?: "exact" | "prefix" | "partial" | "fuzzy" | "category" | "indexed";
    score?: number;
  };
};

const relevanceByType = {
  exact: 0.96,
  prefix: 0.87,
  category: 0.8,
  partial: 0.77,
  fuzzy: 0.67,
  indexed: 0.62,
} as const;

function distanceMeters(
  from: { lat: number; lon: number },
  coordinate: SearchCoordinate | undefined,
) {
  if (!Number.isFinite(coordinate?.lat) || !Number.isFinite(coordinate?.lon)) {
    return Number.POSITIVE_INFINITY;
  }
  const earthRadius = 6_371_008.8;
  const radians = Math.PI / 180;
  const deltaLatitude = (coordinate!.lat! - from.lat) * radians;
  const deltaLongitude = (coordinate!.lon! - from.lon) * radians;
  const a =
    Math.sin(deltaLatitude / 2) ** 2 +
    Math.cos(from.lat * radians) *
      Math.cos(coordinate!.lat! * radians) *
      Math.sin(deltaLongitude / 2) ** 2;
  return 2 * earthRadius * Math.asin(Math.sqrt(a));
}

export function hasExplicitSearchRegion(query: string) {
  return (
    /\b(?:in|near)\s+[\p{L}\p{N}]/iu.test(query) || /,\s*\p{L}/u.test(query)
  );
}

/**
 * Photon provides a useful global relevance order, but its soft proximity bias
 * can still put a namesake on another continent above a nearby destination.
 * Blend lexical quality with a logarithmic distance penalty for ordinary map
 * search. Explicitly location-qualified queries keep the global source order.
 */
export function rankSearchForRegion<T extends RegionRankedSearchResult>(
  results: T[],
  query: string,
  bias: { lat: number; lon: number } | undefined,
  limit = 8,
) {
  if (!bias || hasExplicitSearchRegion(query)) return results.slice(0, limit);
  return results
    .map((result, sourceIndex) => {
      const distance = Number.isFinite(result.distanceMeters)
        ? result.distanceMeters!
        : distanceMeters(bias, result.coordinate);
      const relevance = result.match?.type
        ? relevanceByType[result.match.type]
        : 0.77;
      const proximityPenalty = Number.isFinite(distance)
        ? Math.min(0.44, Math.log1p(distance / 25_000) * 0.07)
        : 0.5;
      return { result, sourceIndex, score: relevance - proximityPenalty };
    })
    .sort(
      (a, b) =>
        b.score - a.score ||
        (a.result.distanceMeters ?? Number.POSITIVE_INFINITY) -
          (b.result.distanceMeters ?? Number.POSITIVE_INFINITY) ||
        a.sourceIndex - b.sourceIndex,
    )
    .slice(0, limit)
    .map(({ result }) => result);
}
