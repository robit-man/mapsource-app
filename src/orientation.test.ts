import { describe, expect, it } from "vitest";
import {
  compassAccuracyConfidence,
  magneticHeadingToTrue,
  navigationHeading,
  orientationHeading,
  shortestHeadingDelta,
  smoothHeading,
  trueHeadingToMercatorBearing,
  updateMovementHeadingCorrection,
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

  it("weights uncertain compass samples instead of rejecting them", () => {
    expect(compassAccuracyConfidence(5)).toBeGreaterThan(
      compassAccuracyConfidence(20),
    );
    expect(compassAccuracyConfidence(20)).toBeGreaterThan(
      compassAccuracyConfidence(90),
    );
    expect(compassAccuracyConfidence(-1)).toBeGreaterThan(0);
    const highConfidence = smoothHeading(0, 40, 16, 1);
    const lowConfidence = smoothHeading(0, 40, 16, 0.08);
    expect(lowConfidence).toBeGreaterThan(0);
    expect(lowConfidence).toBeLessThan(highConfidence);
  });

  it("self-corrects a stable compass bias from natural movement", () => {
    let correction = 0;
    let previousResidual: number | null = null;
    for (let sample = 0; sample < 12; sample += 1) {
      const update = updateMovementHeadingCorrection(
        correction,
        previousResidual,
        80,
        100,
        0.2,
      );
      correction = update.correction;
      previousResidual = update.residual;
      expect(update.applied).toBe(true);
    }
    expect(correction).toBeGreaterThan(18);
    expect(correction).toBeLessThanOrEqual(20);

    const unstable = updateMovementHeadingCorrection(
      correction,
      previousResidual,
      20,
      100,
      0.2,
    );
    expect(unstable.applied).toBe(false);
    expect(unstable.correction).toBe(correction);
  });

  it("favors movement course while moving and compass while stationary", () => {
    const moving = navigationHeading({
      deviceHeading: 90,
      deviceConfidence: 0.1,
      positionHeading: 45,
      positionSpeed: 2,
      gpsCourse: 44,
      routeBearing: 40,
      mapBearing: 0,
    });
    expect(moving.source).toBe("fused");
    expect(moving.heading).toBeCloseTo(48.6, 5);
    expect(
      navigationHeading({
        deviceHeading: 90,
        deviceConfidence: 0.1,
        positionHeading: 45,
        positionSpeed: 0,
        gpsCourse: 44,
        gpsSpeed: 0,
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
