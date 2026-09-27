import { describe, expect, it } from "vitest";
import { LocationSmoother, locationDistanceMeters } from "./location-smoothing";

describe("location smoothing", () => {
  it("dampens stationary GPS jitter with a recent-weighted window", () => {
    const smoother = new LocationSmoother();
    smoother.push({ lat: 45, lon: -122, accuracy: 8 }, 1_000);
    smoother.push({ lat: 45.00008, lon: -121.99992, accuracy: 8 }, 2_000);
    const result = smoother.push(
      { lat: 44.99996, lon: -122.00004, accuracy: 8 },
      3_000,
    );

    expect(result.sampleCount).toBe(3);
    expect(result.reset).toBe(false);
    expect(
      locationDistanceMeters(result, {
        lat: 45,
        lon: -122,
        accuracy: 8,
      }),
    ).toBeLessThan(5);
  });

  it("gives inaccurate samples less influence", () => {
    const smoother = new LocationSmoother();
    const stable = { lat: 45, lon: -122, accuracy: 5 };
    smoother.push(stable, 1_000);
    const result = smoother.push(
      { lat: 45.0004, lon: -122, accuracy: 100 },
      2_000,
    );

    expect(locationDistanceMeters(stable, result)).toBeLessThan(10);
  });

  it("resets instead of dragging behind a stale or large real movement", () => {
    const smoother = new LocationSmoother();
    smoother.push({ lat: 45, lon: -122, accuracy: 8 }, 1_000);
    const moved = smoother.push(
      { lat: 45.01, lon: -121.99, accuracy: 8 },
      2_000,
    );

    expect(moved.reset).toBe(true);
    expect(moved.sampleCount).toBe(1);
    expect(moved.lat).toBe(45.01);
    expect(moved.lon).toBe(-121.99);

    const resumed = smoother.push(
      { lat: 45.0101, lon: -121.9901, accuracy: 8 },
      12_000,
    );
    expect(resumed.reset).toBe(true);
    expect(resumed.sampleCount).toBe(1);
  });
});
