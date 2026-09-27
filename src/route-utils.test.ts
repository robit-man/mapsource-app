import { describe, expect, it } from "vitest";
import {
  bearingDegrees,
  elevationPath,
  formatDistance,
  formatDuration,
  haversineMeters,
  lineAtProgress,
  nearestRouteBearing,
  pointAtProgress,
} from "./route-utils";

describe("route utilities", () => {
  it("measures and interpolates a route", () => {
    const line: [number, number][] = [
      [0, 0],
      [0.01, 0],
      [0.02, 0],
    ];
    expect(haversineMeters(line[0]!, line[2]!)).toBeGreaterThan(2_200);
    expect(pointAtProgress(line, 0.5)).toEqual([0.01, 0]);
    expect(lineAtProgress(line, 0.75)).toHaveLength(3);
  });

  it("clamps replay progress and calculates headings", () => {
    const line: [number, number][] = [
      [-122, 45],
      [-121, 45],
    ];
    expect(pointAtProgress(line, -1)).toEqual(line[0]);
    expect(pointAtProgress(line, 2)).toEqual(line[1]);
    expect(bearingDegrees(line[0]!, line[1]!)).toBeGreaterThan(89);
    expect(bearingDegrees(line[0]!, line[1]!)).toBeLessThan(91);
    expect(nearestRouteBearing(line, [-121.4, 45.001])).toBeGreaterThan(89);
    expect(nearestRouteBearing(line, [-121.4, 45.001])).toBeLessThan(91);
    expect(nearestRouteBearing([], [-121.4, 45.001])).toBeNull();
  });

  it("formats hike metrics and elevation paths", () => {
    expect(formatDistance(0.42)).toBe("420 m");
    expect(formatDuration(5_400)).toBe("1 hr 30 min");
    expect(elevationPath([10, 20, 15])).toContain("L160.00,0.00");
  });
});
