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

/** Convert a magnetic compass heading to the true-north bearing used by maps.
 * WMM declination is east-positive, so it is added to magnetic heading. */
export function magneticHeadingToTrue(
  magneticHeading: number,
  declination: number,
) {
  return normalizeHeading(magneticHeading + declination);
}

const EARTH_MEAN_RADIUS_METERS = 6_371_008.8;
const MERCATOR_MAX_LATITUDE = 85.05112878;

/**
 * Express a geodetic true-north bearing in the local Web Mercator grid used by
 * MapLibre. The forward point is deliberately nearby: this is a local tangent
 * transform, not a route chord. Web Mercator is conformal, so the correction is
 * normally very close to zero, but calculating it makes the Earth-to-map frame
 * boundary explicit and keeps the code correct if the location approaches the
 * projection limit.
 */
export function trueHeadingToMercatorBearing(
  location: readonly [longitude: number, latitude: number],
  trueHeading: number,
  lookAheadMeters = 100,
) {
  const toRadians = Math.PI / 180;
  const toDegrees = 180 / Math.PI;
  const longitude = location[0] * toRadians;
  const latitude =
    Math.max(
      -MERCATOR_MAX_LATITUDE,
      Math.min(MERCATOR_MAX_LATITUDE, location[1]),
    ) * toRadians;
  const heading = normalizeHeading(trueHeading) * toRadians;
  const angularDistance =
    Math.max(0.01, lookAheadMeters) / EARTH_MEAN_RADIUS_METERS;
  const destinationLatitude = Math.asin(
    Math.sin(latitude) * Math.cos(angularDistance) +
      Math.cos(latitude) * Math.sin(angularDistance) * Math.cos(heading),
  );
  const destinationLongitude =
    longitude +
    Math.atan2(
      Math.sin(heading) * Math.sin(angularDistance) * Math.cos(latitude),
      Math.cos(angularDistance) -
        Math.sin(latitude) * Math.sin(destinationLatitude),
    );
  const mercatorNorthing = (value: number) =>
    Math.log(Math.tan(Math.PI / 4 + value / 2));
  const east =
    ((destinationLongitude - longitude + Math.PI * 3) % (Math.PI * 2)) -
    Math.PI;
  const north =
    mercatorNorthing(destinationLatitude) - mercatorNorthing(latitude);
  return normalizeHeading(Math.atan2(east, north) * toDegrees);
}

export function shortestHeadingDelta(from: number, to: number) {
  return ((to - from + 540) % 360) - 180;
}

/** Convert the platform's approximate ±degree error into a continuous filter
 * confidence. Even an uncalibrated WebKit sample contributes at low weight; it
 * is never treated as a binary valid/invalid switch. */
export function compassAccuracyConfidence(accuracy?: number | null) {
  if (!Number.isFinite(accuracy)) return 0.7;
  if (accuracy! < 0) return 0.08;
  return Math.max(0.12, 1 / (1 + Math.pow(accuracy! / 12, 2)));
}

export function updateMovementHeadingCorrection(
  currentCorrection: number,
  previousResidual: number | null,
  sensorHeading: number,
  courseHeading: number,
  gain: number,
) {
  const residual = shortestHeadingDelta(sensorHeading, courseHeading);
  const consistent =
    previousResidual === null ||
    Math.abs(shortestHeadingDelta(previousResidual, residual)) <= 12;
  if (Math.abs(residual) > 60 || !consistent) {
    return { correction: currentCorrection, residual, applied: false };
  }
  const targetCorrection = Math.max(-45, Math.min(45, residual));
  const correction =
    currentCorrection +
    (targetCorrection - currentCorrection) * Math.max(0, Math.min(0.35, gain));
  return { correction, residual, applied: true };
}

export function smoothHeading(
  previous: number | null,
  next: number,
  elapsedMs: number,
  confidence = 1,
) {
  if (previous === null) return normalizeHeading(next);
  const delta = shortestHeadingDelta(previous, next);
  const timeWeight = 1 - Math.exp(-Math.max(8, elapsedMs) / 130);
  const turnWeight = Math.min(0.52, Math.abs(delta) / 180);
  const confidenceWeight = 0.18 + 0.82 * Math.max(0, Math.min(1, confidence));
  const weight = Math.min(1, (timeWeight + turnWeight) * confidenceWeight);
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
  positionHeading: number | null | undefined;
  positionSpeed: number | null | undefined;
  gpsCourse: number | null;
  routeBearing: number | null;
  mapBearing: number;
};

export function navigationHeading(input: NavigationHeadingInput) {
  // A compass heading and a GPS course describe different things. Some mobile
  // browsers pause orientation events while the device is held still; treating
  // the last compass sample as stale then silently turns the map toward the
  // direction of travel instead of the direction the handset is facing.
  // Retain the calibrated compass for the lifetime of the tracking session and
  // use course/route bearings only when no compass sample has ever arrived.
  if (input.deviceHeading !== null) {
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
