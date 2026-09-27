import type { Coordinate } from "./types";

const EARTH_RADIUS_M = 6_371_008.8;

export function haversineMeters(a: Coordinate, b: Coordinate): number {
  const toRadians = Math.PI / 180;
  const lat1 = a[1] * toRadians;
  const lat2 = b[1] * toRadians;
  const dLat = (b[1] - a[1]) * toRadians;
  const dLon = (b[0] - a[0]) * toRadians;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function routeDistances(coordinates: Coordinate[]): {
  cumulative: number[];
  total: number;
} {
  const cumulative = [0];
  let total = 0;
  for (let index = 1; index < coordinates.length; index += 1) {
    total += haversineMeters(coordinates[index - 1]!, coordinates[index]!);
    cumulative.push(total);
  }
  return { cumulative, total };
}

export function pointAtProgress(
  coordinates: Coordinate[],
  progress: number,
): Coordinate | null {
  if (coordinates.length === 0) return null;
  if (coordinates.length === 1) return coordinates[0]!;
  const clamped = Math.max(0, Math.min(1, progress));
  const { cumulative, total } = routeDistances(coordinates);
  if (total === 0) return coordinates[0]!;
  const target = total * clamped;
  const nextIndex = cumulative.findIndex((distance) => distance >= target);
  if (nextIndex <= 0) return coordinates[0]!;
  const previousIndex = nextIndex - 1;
  const segmentLength = cumulative[nextIndex]! - cumulative[previousIndex]!;
  const segmentProgress =
    segmentLength === 0
      ? 0
      : (target - cumulative[previousIndex]!) / segmentLength;
  const previous = coordinates[previousIndex]!;
  const next = coordinates[nextIndex]!;
  return [
    previous[0] + (next[0] - previous[0]) * segmentProgress,
    previous[1] + (next[1] - previous[1]) * segmentProgress,
  ];
}

export function lineAtProgress(
  coordinates: Coordinate[],
  progress: number,
): Coordinate[] {
  if (coordinates.length < 2) return [...coordinates];
  const clamped = Math.max(0, Math.min(1, progress));
  const { cumulative, total } = routeDistances(coordinates);
  if (total === 0 || clamped === 0) return [coordinates[0]!, coordinates[0]!];
  if (clamped === 1) return [...coordinates];
  const target = total * clamped;
  const nextIndex = cumulative.findIndex((distance) => distance >= target);
  const point = pointAtProgress(coordinates, clamped);
  return [
    ...coordinates.slice(0, Math.max(1, nextIndex)),
    ...(point ? [point] : []),
  ];
}

export function bearingDegrees(a: Coordinate, b: Coordinate): number {
  const toRadians = Math.PI / 180;
  const y = Math.sin((b[0] - a[0]) * toRadians) * Math.cos(b[1] * toRadians);
  const x =
    Math.cos(a[1] * toRadians) * Math.sin(b[1] * toRadians) -
    Math.sin(a[1] * toRadians) *
      Math.cos(b[1] * toRadians) *
      Math.cos((b[0] - a[0]) * toRadians);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

export function nearestRouteBearing(
  coordinates: Coordinate[],
  location: Coordinate,
): number | null {
  if (coordinates.length < 2) return null;
  const longitudeScale = Math.cos((location[1] * Math.PI) / 180);
  let nearestDistance = Number.POSITIVE_INFINITY;
  let nearestBearing: number | null = null;
  for (let index = 1; index < coordinates.length; index += 1) {
    const start = coordinates[index - 1]!;
    const end = coordinates[index]!;
    const startX = (start[0] - location[0]) * longitudeScale;
    const startY = start[1] - location[1];
    const endX = (end[0] - location[0]) * longitudeScale;
    const endY = end[1] - location[1];
    const segmentX = endX - startX;
    const segmentY = endY - startY;
    const lengthSquared = segmentX ** 2 + segmentY ** 2;
    const progress =
      lengthSquared === 0
        ? 0
        : Math.max(
            0,
            Math.min(
              1,
              -(startX * segmentX + startY * segmentY) / lengthSquared,
            ),
          );
    const distance =
      (startX + progress * segmentX) ** 2 + (startY + progress * segmentY) ** 2;
    if (distance < nearestDistance && lengthSquared > 0) {
      nearestDistance = distance;
      nearestBearing = bearingDegrees(start, end);
    }
  }
  return nearestBearing;
}

export function formatDistance(distanceKm = 0): string {
  return distanceKm < 1
    ? `${Math.round(distanceKm * 1000)} m`
    : `${distanceKm.toFixed(distanceKm >= 10 ? 1 : 2)} km`;
}

export function formatDuration(seconds = 0): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.max(1, Math.round((seconds % 3600) / 60));
  return hours > 0 ? `${hours} hr ${minutes} min` : `${minutes} min`;
}

export function elevationPath(
  samples: number[],
  width = 320,
  height = 72,
): string {
  if (samples.length < 2) return "";
  const min = Math.min(...samples);
  const max = Math.max(...samples);
  const range = Math.max(1, max - min);
  return samples
    .map((sample, index) => {
      const x = (index / (samples.length - 1)) * width;
      const y = height - ((sample - min) / range) * height;
      return `${index === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(" ");
}
