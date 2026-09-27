import { describe, expect, it } from "vitest";
import {
  magneticHeadingToTrue,
  navigationHeading,
  orientationHeading,
  shortestHeadingDelta,
  smoothHeading,
  trueHeadingToMercatorBearing,
} from "./orientation";

describe("orientation conversion", () => {
  it("converts east-positive magnetic variation to true north", () => {
    expect(magneticHeadingToTrue(350, 14.5)).toBe(4.5);
    expect(magneticHeadingToTrue(20, -7)).toBe(13);
  });

  it("converts geodetic headings into the local Mercator grid", () => {
    const portland: [number, number] = [-122.6765, 45.5231];
    expect(trueHeadingToMercatorBearing(portland, 0)).toBeCloseTo(0, 5);
    expect(trueHeadingToMercatorBearing(portland, 90)).toBeCloseTo(90, 3);
    expect(trueHeadingToMercatorBearing(portland, 225)).toBeCloseTo(225, 3);
    expect(trueHeadingToMercatorBearing([18.9553, 69.6492], 37)).toBeCloseTo(
      37,
      2,
    );
  });

  it("converts absolute W3C angles and screen rotation to compass headings", () => {
    expect(
      orientationHeading({
        type: "deviceorientationabsolute",
        absolute: true,
        alpha: 270,
        beta: 0,
        gamma: 0,
      }),
    ).toBe(90);
    expect(
      orientationHeading(
        {
          type: "deviceorientationabsolute",
          absolute: true,
          alpha: 270,
          beta: 90,
          gamma: 0,
        },
        90,
      ),
    ).toBe(180);
  });

  it("smooths across north without introducing a long-way rotation", () => {
    expect(shortestHeadingDelta(355, 5)).toBe(10);
    const result = smoothHeading(355, 5, 100);
    expect(result > 355 || result < 5).toBe(true);
  });

  it("keeps device direction distinct from GPS course between sensor events", () => {
    expect(
      navigationHeading({
        deviceHeading: 90,
        positionHeading: 45,
        positionSpeed: 2,
        gpsCourse: 44,
        routeBearing: 40,
        mapBearing: 0,
      }),
    ).toEqual({ heading: 90, source: "device" });
    expect(
      navigationHeading({
        deviceHeading: 90,
        positionHeading: 45,
        positionSpeed: 2,
        gpsCourse: 44,
        routeBearing: 40,
        mapBearing: 0,
      }),
    ).toEqual({ heading: 90, source: "device" });
    expect(
      navigationHeading({
        deviceHeading: null,
        positionHeading: 45,
        positionSpeed: 2,
        gpsCourse: 44,
        routeBearing: 40,
        mapBearing: 0,
      }),
    ).toEqual({ heading: 45, source: "course" });
  });
});
