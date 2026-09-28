import { describe, expect, it } from "vitest";
import {
  normalizeSearchResults,
  presentDiscoveryPlaces,
} from "./search-results";

describe("map search result projection", () => {
  it("preserves server order and creates stable unique ids", () => {
    const input = [
      {
        id: "cafe",
        name: "First",
        coordinate: { lat: 45.5, lon: -122.7 },
      },
      {
        id: "cafe",
        name: "Second",
        coordinate: { lat: 45.6, lon: -122.8 },
      },
    ];
    expect(normalizeSearchResults(input)).toMatchObject([
      { id: "text:cafe", name: "First" },
      { id: "text:cafe:2", name: "Second" },
    ]);
    expect(normalizeSearchResults(input)).toEqual(
      normalizeSearchResults(input),
    );
  });

  it("rejects missing, non-finite, and out-of-range coordinates", () => {
    expect(
      normalizeSearchResults([
        { id: "missing", name: "Missing" },
        { id: "nan", name: "NaN", coordinate: { lat: Number.NaN, lon: 0 } },
        { id: "range", name: "Range", coordinate: { lat: 91, lon: 0 } },
        {
          id: "valid-zero",
          name: "Null Island",
          coordinate: { lat: 0, lon: 0 },
        },
      ]),
    ).toHaveLength(1);
  });

  it("projects discovery places without exposing generic place labels", () => {
    const [place] = presentDiscoveryPlaces([
      {
        id: "way/1",
        name: "yes",
        categories: ["building"],
        coordinate: { lat: 45.5, lon: -122.7 },
        address: {
          housenumber: "12",
          street: "Forest Road",
          city: "Portland",
          postcode: "97210",
          country: "United States",
        },
        distanceMeters: 430,
        properties: {},
        sources: [],
      },
    ]);
    expect(place).toMatchObject({
      id: "discovery:way/1",
      name: "12 Forest Road, Portland 97210",
      distanceMeters: 430,
    });
  });
});
