import { haversineMeters } from "./route-utils";
import type { Coordinate, UserLocationFix } from "./types";

type TimedLocationFix = UserLocationFix & { timestamp: number };

export type SmoothedLocationFix = UserLocationFix & {
  sampleCount: number;
  reset: boolean;
};

const accuracyMeters = (fix: UserLocationFix) =>
  Math.min(120, Math.max(4, fix.accuracy ?? 18));

/**
 * A short, recent-weighted location window. Accuracy affects influence without
 * letting a single optimistic fix dominate, while stale and implausibly large
 * jumps reset immediately so resumed navigation and real travel do not lag.
 */
export class LocationSmoother {
  private samples: TimedLocationFix[] = [];

  constructor(
    private readonly maxSamples = 5,
    private readonly maxAgeMs = 6_000,
    private readonly staleAfterMs = 9_000,
  ) {}

  push(
    fix: UserLocationFix,
    timestamp = performance.now(),
  ): SmoothedLocationFix {
    const previous = this.samples.at(-1);
    const distance = previous
      ? haversineMeters([previous.lon, previous.lat], [fix.lon, fix.lat])
      : 0;
    const resetDistance = Math.max(
      220,
      accuracyMeters(fix) * 6,
      previous ? accuracyMeters(previous) * 6 : 0,
    );
    const reset = Boolean(
      previous &&
        (timestamp - previous.timestamp > this.staleAfterMs ||
          timestamp <= previous.timestamp ||
          distance > resetDistance),
    );
    if (reset) this.samples = [];

    this.samples.push({ ...fix, timestamp });
    this.samples = this.samples
      .filter((sample) => timestamp - sample.timestamp <= this.maxAgeMs)
      .slice(-this.maxSamples);

    let longitude = 0;
    let latitude = 0;
    let totalWeight = 0;
    for (const [index, sample] of this.samples.entries()) {
      const recency = (index + 1) ** 2;
      const weight = recency / accuracyMeters(sample);
      longitude += sample.lon * weight;
      latitude += sample.lat * weight;
      totalWeight += weight;
    }

    return {
      lon: longitude / totalWeight,
      lat: latitude / totalWeight,
      accuracy: fix.accuracy,
      sampleCount: this.samples.length,
      reset,
    };
  }

  clear() {
    this.samples = [];
  }
}

export function locationDistanceMeters(a: UserLocationFix, b: UserLocationFix) {
  const from: Coordinate = [a.lon, a.lat];
  const to: Coordinate = [b.lon, b.lat];
  return haversineMeters(from, to);
}
