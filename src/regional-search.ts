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
  exact: 6,
  prefix: 5,
  category: 4,
  partial: 3,
  fuzzy: 2,
  indexed: 1,
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
 * Photon has already selected results relevant to the query. For ordinary map
 * search, present that candidate set in strict nearest-first order; lexical
 * match quality and source order only break distance ties. Explicitly
 * location-qualified queries keep the upstream order because their intended
 * region is not necessarily the current map center.
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
        : 3;
      const matchScore = Number.isFinite(result.match?.score)
        ? result.match!.score!
        : 0;
      return { result, sourceIndex, distance, relevance, matchScore };
    })
    .sort(
      (a, b) =>
        a.distance - b.distance ||
        b.relevance - a.relevance ||
        b.matchScore - a.matchScore ||
        a.sourceIndex - b.sourceIndex,
    )
    .slice(0, limit)
    .map(({ result }) => result);
}
