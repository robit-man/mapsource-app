export type OrientationReading = {
  type: string;
  absolute: boolean;
  alpha: number | null;
  beta: number | null;
  gamma: number | null;
  webkitCompassHeading?: number;
};

export function normalizeHeading(value: number) {
  return ((value % 360) + 360) % 360;
}

export function shortestHeadingDelta(from: number, to: number) {
  return ((to - from + 540) % 360) - 180;
}

export function smoothHeading(
  previous: number | null,
  next: number,
  elapsedMs: number,
) {
  if (previous === null) return normalizeHeading(next);
  const delta = shortestHeadingDelta(previous, next);
  const timeWeight = 1 - Math.exp(-Math.max(8, elapsedMs) / 130);
  const turnWeight = Math.min(0.52, Math.abs(delta) / 180);
  const weight = Math.min(1, timeWeight + turnWeight);
  return normalizeHeading(previous + delta * weight);
}

/** Implements the W3C tilt-compensated heading calculation. The orientation
 * angle maps the fixed, natural device axes onto the currently visible screen. */
export function orientationHeading(
  event: OrientationReading,
  screenAngle = 0,
): number | null {
  if (Number.isFinite(event.webkitCompassHeading)) {
    return normalizeHeading(event.webkitCompassHeading! + screenAngle);
  }
  if (
    !Number.isFinite(event.alpha) ||
    (!event.absolute && event.type !== "deviceorientationabsolute")
  ) {
    return null;
  }
  const alpha = (event.alpha! * Math.PI) / 180;
  const beta = ((event.beta ?? 0) * Math.PI) / 180;
  const gamma = ((event.gamma ?? 0) * Math.PI) / 180;
  const horizontalX =
    -Math.cos(alpha) * Math.sin(gamma) -
    Math.sin(alpha) * Math.sin(beta) * Math.cos(gamma);
  const horizontalY =
    -Math.sin(alpha) * Math.sin(gamma) +
    Math.cos(alpha) * Math.sin(beta) * Math.cos(gamma);
  const heading =
    Math.abs(horizontalX) + Math.abs(horizontalY) < 1e-7
      ? 360 - event.alpha!
      : (Math.atan2(horizontalX, horizontalY) * 180) / Math.PI;
  return normalizeHeading(heading + screenAngle);
}

type NavigationHeadingInput = {
  deviceHeading: number | null;
  deviceUpdatedAt: number;
  now: number;
  positionHeading: number | null | undefined;
  positionSpeed: number | null | undefined;
  gpsCourse: number | null;
  routeBearing: number | null;
  mapBearing: number;
};

export function navigationHeading(input: NavigationHeadingInput) {
  if (
    input.deviceHeading !== null &&
    input.now - input.deviceUpdatedAt <= 2_500
  ) {
    return { heading: input.deviceHeading, source: "device" as const };
  }
  if (
    Number.isFinite(input.positionHeading) &&
    (input.positionSpeed ?? 0) >= 0.8
  ) {
    return {
      heading: normalizeHeading(input.positionHeading!),
      source: "course" as const,
    };
  }
  if (input.gpsCourse !== null) {
    return { heading: input.gpsCourse, source: "gps-course" as const };
  }
  if (input.routeBearing !== null) {
    return { heading: input.routeBearing, source: "route" as const };
  }
  return { heading: input.mapBearing, source: "map" as const };
}
