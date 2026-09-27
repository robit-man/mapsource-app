export type InitialMapLocation = {
  center: [number, number];
  zoom: number;
  label: string;
  source: "ip-api" | "cloudflare" | "db-ip";
};

function coordinate(value: unknown, limit: number): value is number {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    Math.abs(value) <= limit
  );
}

/** Uses the same private gateway resolver as mapsource.io. It does not request
 * device location, persist an IP address, or call a geolocation provider from
 * the browser. */
export async function initialMapLocation(
  signal: AbortSignal,
  request: typeof fetch = fetch,
): Promise<InitialMapLocation | null> {
  signal.throwIfAborted();
  try {
    const response = await request("/api/location", {
      cache: "no-store",
      signal: AbortSignal.any([signal, AbortSignal.timeout(3_500)]),
    });
    if (response.ok) {
      const location = (await response.json()) as Record<string, unknown>;
      if (
        coordinate(location.latitude, 85.05112878) &&
        coordinate(location.longitude, 180) &&
        (location.source === "ip-api" ||
          location.source === "cloudflare" ||
          location.source === "db-ip")
      ) {
        signal.throwIfAborted();
        return {
          center: [location.longitude, location.latitude],
          zoom: 12,
          label:
            typeof location.label === "string"
              ? location.label
              : "your approximate location",
          source: location.source,
        };
      }
    }
  } catch {
    // A failed approximate lookup must not block the map's regional fallback.
  }
  signal.throwIfAborted();
  return null;
}
