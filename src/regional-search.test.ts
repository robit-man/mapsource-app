import { describe, expect, it } from "vitest";
import {
  hasExplicitSearchRegion,
  rankSearchForRegion,
} from "./regional-search";

const portland = { lat: 45.52, lon: -122.68 };

describe("regional place-search ranking", () => {
  it("promotes a useful regional match above a distant namesake", () => {
    const distant = {
      name: "Forest Park",
      coordinate: { lat: 41.88, lon: -87.81 },
      match: { type: "exact" as const },
    };
    const nearby = {
      name: "Forest Park Trailhead",
      coordinate: { lat: 45.57, lon: -122.74 },
      match: { type: "prefix" as const },
    };
    expect(
      rankSearchForRegion([distant, nearby], "Forest Park", portland)[0],
    ).toBe(nearby);
  });

  it("uses upstream distances and keeps deterministic source order for ties", () => {
    const results = [
      { name: "far", distanceMeters: 900_000 },
      { name: "near", distanceMeters: 900 },
      { name: "near-second", distanceMeters: 900 },
    ];
    expect(
      rankSearchForRegion(results, "springfield", portland).map(
        (result) => result.name,
      ),
    ).toEqual(["near", "near-second", "far"]);
  });

  it("orders relevant candidates strictly by distance before match strength", () => {
    const results = [
      {
        name: "far exact",
        distanceMeters: 12_000,
        match: { type: "exact" as const, score: 1 },
      },
      {
        name: "nearest partial",
        distanceMeters: 350,
        match: { type: "partial" as const, score: 0.72 },
      },
      {
        name: "middle prefix",
        distanceMeters: 2_100,
        match: { type: "prefix" as const, score: 0.9 },
      },
    ];
    expect(
      rankSearchForRegion(results, "forest park", portland).map(
        (result) => result.name,
      ),
    ).toEqual(["nearest partial", "middle prefix", "far exact"]);
  });

  it("preserves global ranking for an explicitly requested remote region", () => {
    const results = [
      { name: "London", distanceMeters: 8_000_000 },
      { name: "local namesake", distanceMeters: 1_000 },
    ];
    expect(
      rankSearchForRegion(results, "coffee in London", portland)[0]?.name,
    ).toBe("London");
    expect(hasExplicitSearchRegion("10 Downing Street, London")).toBe(true);
    expect(hasExplicitSearchRegion("coffee")).toBe(false);
  });
});
