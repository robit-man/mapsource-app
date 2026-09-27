import { describe, expect, it } from "vitest";
import {
  navigationHeading,
  orientationHeading,
  shortestHeadingDelta,
  smoothHeading,
} from "./orientation";

describe("orientation conversion", () => {
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
