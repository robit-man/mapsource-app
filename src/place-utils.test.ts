import { describe, expect, it } from "vitest";
import {
  coordinateLabel,
  meaningfulPlaceCategories,
  meaningfulPlaceName,
  placeAddress,
} from "./place-utils";
import type { DiscoveryPlace } from "./types";

const place: DiscoveryPlace = {
  id: "osm-way-1",
  name: "yes",
  categories: ["building", "residential", "landmark"],
  coordinate: { lat: 45.5252, lon: -122.7162 },
  address: {
    housenumber: "3229",
    street: "Northwest Pittock Drive",
    city: "Portland",
    state: "Oregon",
    postcode: "97210",
    country: "United States",
  },
  distanceMeters: 2,
  properties: {},
  sources: [],
};

describe("place display formatting", () => {
  it("hides generic OSM building values from user-facing labels", () => {
    expect(meaningfulPlaceName(place)).toBeNull();
    expect(meaningfulPlaceCategories(place)).toEqual(["landmark"]);
  });

  it("formats an address as the primary building label", () => {
    expect(placeAddress(place)).toBe(
      "3229 Northwest Pittock Drive, Portland Oregon 97210",
    );
    expect(coordinateLabel(place.coordinate!)).toBe("45.52520, -122.71620");
  });
});
