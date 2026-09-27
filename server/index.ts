import { access } from "node:fs/promises";
import { constants } from "node:fs";
import { resolve } from "node:path";
import Fastify, { type FastifyReply } from "fastify";
import fastifyRateLimit from "@fastify/rate-limit";
import fastifyStatic from "@fastify/static";
import {
  createClient,
  toMapsourceError,
  type MapsourceApiClient,
} from "mapsource";
import { rankSearchForRegion } from "../src/regional-search.js";

const app = Fastify({
  logger: true,
  trustProxy: true,
  bodyLimit: 32 * 1024,
});

const host = process.env.HOST ?? "127.0.0.1";
const port = Number(process.env.PORT ?? 3220);
const mapsourceOrigin = (
  process.env.MAPSOURCE_API_ORIGIN ?? "http://127.0.0.1:8787"
).replace(/\/$/, "");
const demoOrigin = process.env.MAPSOURCE_DEMO_ORIGIN ?? "https://mapsource.io";
const webRoot = resolve(process.cwd(), "dist");

const ESRI_WORLD_IMAGERY =
  "https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile";
const MAX_PROXY_BYTES = 8 * 1024 * 1024;

type WaypointInput = { lat: number; lon: number; label?: string };
type RouteInput = {
  waypoints?: WaypointInput[];
  mode?: "walk" | "bike" | "car" | "bus" | "train";
};

const discoveryCategories = new Set([
  "restaurant",
  "cafe",
  "shop",
  "supermarket",
  "pharmacy",
  "fuel",
  "hotel",
  "park",
  "transit_stop",
  "railway_station",
]);

let keyPromise: Promise<string> | undefined;
let clientPromise: Promise<MapsourceApiClient> | undefined;

function finiteCoordinate(lat: unknown, lon: unknown): lat is number {
  return (
    typeof lat === "number" &&
    typeof lon === "number" &&
    Number.isFinite(lat) &&
    Number.isFinite(lon) &&
    lat >= -90 &&
    lat <= 90 &&
    lon >= -180 &&
    lon <= 180
  );
}

async function resolveApiKey(): Promise<string> {
  const configured = process.env.MAPSOURCE_API_KEY?.trim();
  if (configured) return configured;
  keyPromise ??= fetch(`${mapsourceOrigin}/api/dev/key`, {
    headers: { origin: demoOrigin },
    signal: AbortSignal.timeout(5_000),
  })
    .then(async (response) => {
      if (!response.ok)
        throw new Error(
          `Mapsource demo key endpoint returned ${response.status}`,
        );
      const body = (await response.json()) as { key?: unknown };
      if (typeof body.key !== "string" || body.key.length < 24) {
        throw new Error("Mapsource demo key endpoint returned no usable key");
      }
      return body.key;
    })
    .catch((error) => {
      keyPromise = undefined;
      throw error;
    });
  return keyPromise;
}

async function mapsourceClient(): Promise<MapsourceApiClient> {
  clientPromise ??= resolveApiKey()
    .then((apiKey) =>
      createClient({
        apiKey,
        baseUrl: mapsourceOrigin,
        fetch: async (request) => {
          const headers = new Headers(request.headers);
          headers.set("origin", demoOrigin);
          return fetch(new Request(request, { headers }));
        },
      }),
    )
    .catch((error) => {
      clientPromise = undefined;
      throw error;
    });
  return clientPromise;
}

function apiFailure(reply: FastifyReply, status: number, payload: unknown) {
  const error = toMapsourceError(status, payload);
  return reply.code(status).send({
    error: {
      code: error.code ?? "UPSTREAM_UNAVAILABLE",
      message: error.message,
      requestId: error.requestId,
      retryable: error.retryable ?? status >= 500,
    },
  });
}

function validateTile(
  zText: string,
  xText: string,
  yText: string,
  maxZoom: number,
) {
  const z = Number(zText);
  const x = Number(xText);
  const y = Number(yText);
  const edge = Number.isInteger(z) && z >= 0 && z <= maxZoom ? 2 ** z : 0;
  if (
    !Number.isInteger(x) ||
    !Number.isInteger(y) ||
    x < 0 ||
    y < 0 ||
    x >= edge ||
    y >= edge
  ) {
    return null;
  }
  return { z, x, y };
}

async function proxyBinary(
  reply: FastifyReply,
  url: string,
  options: {
    authenticated?: boolean;
    accept: string;
    fallbackType: string;
    timeoutMs?: number;
    method?: "GET" | "POST";
    body?: string;
    contentType?: string;
  },
) {
  const headers = new Headers({ accept: options.accept });
  if (options.contentType) headers.set("content-type", options.contentType);
  if (options.authenticated) {
    headers.set("authorization", `Bearer ${await resolveApiKey()}`);
    headers.set("origin", demoOrigin);
  }
  const response = await fetch(url, {
    method: options.method ?? "GET",
    body: options.body,
    headers,
    redirect: "error",
    signal: AbortSignal.timeout(options.timeoutMs ?? 8_000),
  });
  if (response.status === 204) return reply.code(204).send();
  if (!response.ok) {
    const message = response.headers.get("content-type")?.includes("json")
      ? await response.json().catch(() => undefined)
      : undefined;
    return apiFailure(reply, response.status, message);
  }
  const declared = Number(response.headers.get("content-length") ?? 0);
  if (declared > MAX_PROXY_BYTES) {
    return reply.code(502).send({
      error: {
        code: "RESPONSE_TOO_LARGE",
        message: "Upstream tile exceeded the proxy byte limit.",
      },
    });
  }
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.byteLength > MAX_PROXY_BYTES) {
    return reply.code(502).send({
      error: {
        code: "RESPONSE_TOO_LARGE",
        message: "Upstream tile exceeded the proxy byte limit.",
      },
    });
  }
  const contentType =
    response.headers.get("content-type") ?? options.fallbackType;
  reply.header("content-type", contentType);
  reply.header(
    "cache-control",
    response.headers.get("cache-control") ?? "public, max-age=3600",
  );
  const etag = response.headers.get("etag");
  if (etag) reply.header("etag", etag);
  return reply.send(bytes);
}

app.addHook("onSend", async (_request, reply) => {
  reply.header("x-content-type-options", "nosniff");
  reply.header("x-frame-options", "DENY");
  reply.header("referrer-policy", "strict-origin-when-cross-origin");
  reply.header(
    "permissions-policy",
    "geolocation=(self), accelerometer=(self), gyroscope=(self), magnetometer=(self), camera=(), microphone=(), payment=()",
  );
  reply.header(
    "content-security-policy",
    "default-src 'self'; base-uri 'self'; frame-ancestors 'none'; object-src 'none'; img-src 'self' data: blob:; font-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'; worker-src 'self' blob:; child-src 'self' blob:; connect-src 'self'",
  );
});

await app.register(fastifyRateLimit, {
  global: false,
  hook: "onRequest",
});

app.get("/health/live", async () => ({
  status: "ok",
  service: "mapsource-app",
}));

app.get("/health/ready", async (_request, reply) => {
  try {
    await access(webRoot, constants.R_OK);
    const response = await fetch(
      `${mapsourceOrigin}/api/styles/mapsource/style.json`,
      {
        signal: AbortSignal.timeout(3_000),
      },
    );
    if (!response.ok) throw new Error(`Mapsource returned ${response.status}`);
    return { status: "ready", mapsource: "reachable" };
  } catch (error) {
    return reply.code(503).send({
      status: "not-ready",
      reason: error instanceof Error ? error.message : "readiness check failed",
    });
  }
});

app.get(
  "/api/location",
  { config: { rateLimit: { max: 30, timeWindow: "1 minute" } } },
  async (request, reply) => {
    const headers = new Headers({ accept: "application/json" });
    for (const name of [
      "cf-connecting-ip",
      "cf-connecting-ipv6",
      "cf-iplatitude",
      "cf-iplongitude",
      "cf-ipcity",
      "cf-region",
      "cf-region-code",
      "cf-ipcountry",
    ]) {
      const value = request.headers[name];
      if (typeof value === "string" && value.length <= 200) {
        headers.set(name, value);
      }
    }
    const response = await fetch(`${mapsourceOrigin}/api/location`, {
      headers,
      signal: AbortSignal.timeout(4_000),
    });
    const body = await response.json().catch(() => undefined);
    reply.header("cache-control", "private, no-store");
    if (!response.ok) return apiFailure(reply, response.status, body);
    return body;
  },
);

app.get<{ Querystring: { q?: string; lat?: string; lon?: string } }>(
  "/api/search",
  {
    config: { rateLimit: { max: 60, timeWindow: "1 minute" } },
  },
  async (request, reply) => {
    const q = request.query.q?.trim() ?? "";
    if (q.length < 2 || q.length > 120) {
      return reply.code(400).send({
        error: {
          code: "BAD_REQUEST",
          message: "Search text must contain 2 to 120 characters.",
        },
      });
    }
    const lat =
      request.query.lat === undefined ? undefined : Number(request.query.lat);
    const lon =
      request.query.lon === undefined ? undefined : Number(request.query.lon);
    if (
      (lat !== undefined || lon !== undefined) &&
      !finiteCoordinate(lat, lon)
    ) {
      return reply.code(400).send({
        error: {
          code: "BAD_REQUEST",
          message: "Search bias must be a valid latitude and longitude.",
        },
      });
    }
    const client = await mapsourceClient();
    const result = await client.GET("/api/places/lookup", {
      params: {
        query: {
          q,
          // Pull a broader candidate set so app-local regional ranking can
          // promote a nearby namesake that Photon placed just below its first
          // global results.
          limit: 20,
          ...(lat !== undefined && lon !== undefined ? { lat, lon } : {}),
        },
      },
    });
    if (result.error)
      return apiFailure(reply, result.response.status, result.error);
    reply.header("cache-control", "private, max-age=20");
    const data = result.data as {
      results?: Array<{
        coordinate?: { lat?: number; lon?: number };
        distanceMeters?: number;
        match?: {
          type?:
            | "exact"
            | "prefix"
            | "partial"
            | "fuzzy"
            | "category"
            | "indexed";
          score?: number;
        };
      }>;
      [key: string]: unknown;
    };
    return {
      ...data,
      results: rankSearchForRegion(
        data.results ?? [],
        q,
        lat !== undefined && lon !== undefined ? { lat, lon } : undefined,
        8,
      ),
    };
  },
);

app.get<{
  Querystring: {
    category?: string;
    lat?: string;
    lon?: string;
    west?: string;
    south?: string;
    east?: string;
    north?: string;
  };
}>(
  "/api/discover",
  { config: { rateLimit: { max: 40, timeWindow: "1 minute" } } },
  async (request, reply) => {
    const category = request.query.category ?? "";
    const lat = Number(request.query.lat);
    const lon = Number(request.query.lon);
    const west = Number(request.query.west);
    const south = Number(request.query.south);
    const east = Number(request.query.east);
    const north = Number(request.query.north);
    if (
      !discoveryCategories.has(category) ||
      !finiteCoordinate(lat, lon) ||
      ![west, south, east, north].every(Number.isFinite) ||
      west >= east ||
      south >= north ||
      west < -180 ||
      east > 180 ||
      south < -90 ||
      north > 90
    ) {
      return reply.code(400).send({
        error: { code: "BAD_REQUEST", message: "Invalid discovery view." },
      });
    }
    const northSouthMeters = Math.abs(north - south) * 111_320;
    const eastWestMeters =
      Math.abs(east - west) *
      111_320 *
      Math.max(0.15, Math.cos((lat * Math.PI) / 180));
    const radius = Math.max(
      300,
      Math.min(
        5_000,
        Math.ceil(Math.hypot(northSouthMeters, eastWestMeters) / 2),
      ),
    );
    const client = await mapsourceClient();
    if (category === "railway_station") {
      const bbox = [south, west, north, east]
        .map((value) => value.toFixed(7))
        .join(",");
      const query =
        `[out:json][timeout:20];(` +
        `nwr["railway"~"^(station|halt|tram_stop)$"](${bbox});` +
        `nwr["station"~"^(light_rail|subway|train)$"](${bbox});` +
        `nwr["public_transport"="station"](${bbox});` +
        `);out center tags 80;`;
      const response = await fetch(`${mapsourceOrigin}/api/interpreter`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${await resolveApiKey()}`,
          "content-type": "text/plain; charset=utf-8",
          origin: demoOrigin,
        },
        body: query,
        signal: AbortSignal.timeout(25_000),
      });
      if (!response.ok) {
        return apiFailure(
          reply,
          response.status,
          await response.json().catch(() => undefined),
        );
      }
      const payload = (await response.json()) as {
        elements?: Array<{
          type?: "node" | "way" | "relation";
          id?: number;
          lat?: number;
          lon?: number;
          center?: { lat?: number; lon?: number };
          tags?: Record<string, string>;
        }>;
      };
      const overpassPlaces = (payload.elements ?? []).flatMap((element) => {
        const placeLat = element.lat ?? element.center?.lat;
        const placeLon = element.lon ?? element.center?.lon;
        if (
          typeof placeLat !== "number" ||
          typeof placeLon !== "number" ||
          !finiteCoordinate(placeLat, placeLon) ||
          !element.type ||
          !Number.isFinite(element.id)
        ) {
          return [];
        }
        const tags = element.tags ?? {};
        const meanLatitude = ((lat + placeLat) / 2) * (Math.PI / 180);
        const eastMeters = (placeLon - lon) * 111_320 * Math.cos(meanLatitude);
        const northMeters = (placeLat - lat) * 111_320;
        return [
          {
            id: `osm-${element.type}-${element.id}`,
            name: tags.name ?? tags.ref ?? null,
            categories: [
              tags.railway ? `railway=${tags.railway}` : null,
              tags.station ? `station=${tags.station}` : null,
              tags.public_transport
                ? `public_transport=${tags.public_transport}`
                : null,
            ].filter(Boolean),
            coordinate: { lat: placeLat, lon: placeLon },
            address: {
              housenumber: tags["addr:housenumber"] ?? null,
              street: tags["addr:street"] ?? null,
              city: tags["addr:city"] ?? null,
              state: tags["addr:state"] ?? null,
              postcode: tags["addr:postcode"] ?? null,
              country: tags["addr:country"] ?? null,
            },
            distanceMeters: Math.round(Math.hypot(eastMeters, northMeters)),
            properties: tags,
            sources: [
              {
                dataset: "OpenStreetMap",
                id: `${element.type}/${element.id}`,
                url: `https://www.openstreetmap.org/${element.type}/${element.id}`,
              },
            ],
          },
        ];
      });
      if (overpassPlaces.length > 0) {
        reply.header("cache-control", "private, max-age=20");
        return { category, radius, places: overpassPlaces };
      }

      // Some regional Overpass generations intentionally carry a smaller POI
      // subset than the global Photon index. Keep the result bounded to the
      // current viewport and return only real, indexed railway records instead
      // of manufacturing a station marker when that subset has no match.
      const lookup = await client.GET("/api/places/lookup", {
        params: {
          query: {
            q: "railway station",
            lat,
            lon,
            limit: 20,
            bbox: `${west},${south},${east},${north}`,
            bounded: true,
          },
        },
      });
      if (lookup.error)
        return apiFailure(reply, lookup.response.status, lookup.error);
      const lookupPayload = lookup.data as {
        results?: Array<{
          id?: string;
          name?: string;
          displayName?: string;
          category?: string;
          coordinate?: { lat?: number; lon?: number };
          address?: Record<string, string>;
          distanceMeters?: number;
          sources?: Array<{
            dataset?: string;
            id?: string;
            type?: string;
            url?: string;
          }>;
        }>;
      };
      const places = (lookupPayload.results ?? []).flatMap((place) => {
        const placeLat = place.coordinate?.lat;
        const placeLon = place.coordinate?.lon;
        if (!finiteCoordinate(placeLat, placeLon)) return [];
        const address = place.address ?? {};
        return [
          {
            id: place.id ?? `station-${placeLat}-${placeLon}`,
            name: place.name ?? place.displayName ?? "Railway station",
            categories: [place.category ?? "railway_station"],
            coordinate: { lat: placeLat, lon: placeLon },
            address: {
              housenumber: address.houseNumber ?? address.housenumber ?? null,
              street: address.street ?? address.road ?? null,
              city: address.city ?? address.town ?? address.village ?? null,
              state: address.state ?? null,
              postcode: address.postcode ?? null,
              country: address.country ?? null,
            },
            distanceMeters: place.distanceMeters ?? null,
            properties: {
              category: place.category ?? "railway_station",
              display_name:
                place.displayName ?? place.name ?? "Railway station",
            },
            sources: (place.sources ?? []).map((source) => ({
              dataset: source.dataset ?? "OpenStreetMap",
              id: source.id ?? place.id ?? "railway-station",
              url:
                source.url ??
                (source.type && source.id
                  ? `https://www.openstreetmap.org/${source.type}/${source.id}`
                  : "https://www.openstreetmap.org"),
            })),
          },
        ];
      });
      reply.header("cache-control", "private, max-age=20");
      return { category, radius, places };
    }
    const result = await client.GET("/api/places/nearby", {
      params: { query: { lat, lon, radius, category, limit: 80 } },
    });
    if (result.error)
      return apiFailure(reply, result.response.status, result.error);
    const data = result.data as {
      places?: Array<{
        coordinate?: { lat?: number; lon?: number } | null;
        [key: string]: unknown;
      }>;
    };
    const places = (data.places ?? []).filter((place) => {
      const coordinate = place.coordinate;
      const placeLat = coordinate?.lat;
      const placeLon = coordinate?.lon;
      return (
        typeof placeLat === "number" &&
        typeof placeLon === "number" &&
        Number.isFinite(placeLat) &&
        Number.isFinite(placeLon) &&
        placeLon >= west &&
        placeLon <= east &&
        placeLat >= south &&
        placeLat <= north
      );
    });
    reply.header("cache-control", "private, max-age=20");
    return { category, radius, places };
  },
);

app.get<{ Querystring: { lat?: string; lon?: string } }>(
  "/api/inspect",
  { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } },
  async (request, reply) => {
    const lat = Number(request.query.lat);
    const lon = Number(request.query.lon);
    if (!finiteCoordinate(lat, lon)) {
      return reply.code(400).send({
        error: { code: "BAD_REQUEST", message: "Invalid map coordinate." },
      });
    }
    const client = await mapsourceClient();
    const result = await client.GET("/api/places/reverse", {
      params: { query: { lat, lon, radius: 180 } },
    });
    if (result.error)
      return apiFailure(reply, result.response.status, result.error);
    reply.header("cache-control", "private, max-age=20");
    return result.data;
  },
);

app.post<{ Body: RouteInput }>(
  "/api/route",
  {
    config: { rateLimit: { max: 20, timeWindow: "1 minute" } },
  },
  async (request, reply) => {
    const waypoints = request.body?.waypoints;
    if (
      !Array.isArray(waypoints) ||
      waypoints.length < 2 ||
      waypoints.length > 10
    ) {
      return reply.code(400).send({
        error: {
          code: "BAD_REQUEST",
          message: "A route requires 2 to 10 stops.",
        },
      });
    }
    if (!waypoints.every((point) => finiteCoordinate(point?.lat, point?.lon))) {
      return reply.code(400).send({
        error: {
          code: "BAD_REQUEST",
          message: "Every stop must have valid coordinates.",
        },
      });
    }
    const mode = request.body.mode ?? "walk";
    if (!new Set(["walk", "bike", "car", "bus", "train"]).has(mode)) {
      return reply.code(400).send({
        error: {
          code: "BAD_REQUEST",
          message: "Mode must be walk, bike, car, bus, or train.",
        },
      });
    }
    const costing =
      mode === "bike"
        ? "bicycle"
        : mode === "car"
          ? "auto"
          : mode === "bus" || mode === "train"
            ? "bus"
            : "pedestrian";
    const client = await mapsourceClient();
    const result = await client.POST("/api/route", {
      body: {
        locations: waypoints.map(({ lat, lon }) => ({ lat, lon })),
        costing,
        elevation: true,
      },
    });
    if (result.error)
      return apiFailure(reply, result.response.status, result.error);
    reply.header("cache-control", "no-store");
    return result.data;
  },
);

app.get<{ Querystring: { surface?: string } }>(
  "/map/style.json",
  {
    config: { rateLimit: { max: 120, timeWindow: "1 minute" } },
  },
  async (request, reply) => {
    const surface = request.query.surface ?? "mapsource";
    if (
      !new Set(["mapsource", "dark", "light", "elevation", "satellite"]).has(
        surface,
      )
    ) {
      return reply.code(400).send({
        error: { code: "BAD_REQUEST", message: "Unknown map surface." },
      });
    }
    const styleId =
      surface === "dark" || surface === "light" ? surface : "mapsource";
    const response = await fetch(
      `${mapsourceOrigin}/api/styles/${styleId}/style.json`,
      {
        signal: AbortSignal.timeout(5_000),
      },
    );
    if (!response.ok)
      return apiFailure(
        reply,
        response.status,
        await response.json().catch(() => undefined),
      );
    const style = (await response.json()) as {
      sources?: Record<string, { tiles?: string[] }>;
      glyphs?: string;
      layers?: Array<Record<string, unknown>>;
      [key: string]: unknown;
    };
    for (const source of Object.values(style.sources ?? {})) {
      if (source.tiles) {
        source.tiles = source.tiles.map((tile) =>
          tile.includes("/api/tiles/vector/")
            ? "/map/tiles/vector/{z}/{x}/{y}.pbf"
            : tile,
        );
      }
    }
    style.glyphs = "/map/glyphs/{fontstack}/{range}.pbf";
    style.sources ??= {};
    style.sources["mapsource-terrain"] = {
      type: "raster-dem",
      tiles: ["/map/terrain/{z}/{x}/{y}.png"],
      tileSize: 256,
      maxzoom: 15,
      encoding: "terrarium",
      attribution: "Mapzen Terrain Tiles · AWS Open Data",
    } as never;
    const firstLabel =
      style.layers?.findIndex((layer) => layer.type === "symbol") ?? -1;
    const hillshade = {
      id: "mapsource.hillshade",
      type: "hillshade",
      source: "mapsource-terrain",
      paint: {
        "hillshade-shadow-color": surface === "light" ? "#7c8879" : "#0a0d0a",
        "hillshade-highlight-color":
          surface === "elevation" ? "#f0ffb7" : "#d8ed9d",
        "hillshade-accent-color":
          surface === "elevation" ? "#6f905c" : "#506a55",
        "hillshade-exaggeration": surface === "elevation" ? 0.62 : 0.24,
      },
    };
    if (style.layers)
      style.layers.splice(
        firstLabel >= 0 ? firstLabel : style.layers.length,
        0,
        hillshade,
      );
    reply.header("cache-control", "public, max-age=300");
    return style;
  },
);

app.get<{ Params: { style: string; z: string; x: string; y: string } }>(
  "/map/tiles/raster/:style/:z/:x/:y.png",
  {
    config: { rateLimit: { max: 300, timeWindow: "1 minute" } },
  },
  async (request, reply) => {
    if (request.params.style !== "dark" && request.params.style !== "light") {
      return reply.code(400).send({
        error: { code: "BAD_REQUEST", message: "Unknown raster style." },
      });
    }
    const tile = validateTile(
      request.params.z,
      request.params.x,
      request.params.y,
      20,
    );
    if (!tile) {
      return reply.code(400).send({
        error: {
          code: "BAD_REQUEST",
          message: "Invalid raster tile coordinate.",
        },
      });
    }
    return proxyBinary(
      reply,
      `${mapsourceOrigin}/api/tiles/${request.params.style}/${tile.z}/${tile.x}/${tile.y}.png`,
      {
        authenticated: true,
        accept: "image/png",
        fallbackType: "image/png",
      },
    );
  },
);

app.get<{ Params: { surface: string } }>(
  "/map/preview/:surface.png",
  {
    config: { rateLimit: { max: 30, timeWindow: "1 minute" } },
  },
  async (request, reply) => {
    if (
      !new Set(["mapsource", "dark", "light", "elevation"]).has(
        request.params.surface,
      )
    ) {
      return reply.code(400).send({
        error: { code: "BAD_REQUEST", message: "Unknown preview surface." },
      });
    }
    return proxyBinary(reply, `${mapsourceOrigin}/api/render/static`, {
      authenticated: true,
      method: "POST",
      body: JSON.stringify({
        lat: 45.531,
        lon: -122.716,
        zoom: 13.2,
        width: 320,
        height: 180,
        style:
          request.params.surface === "elevation"
            ? "mapsource"
            : request.params.surface,
        bearing: -12,
        pitch: 34,
      }),
      contentType: "application/json",
      accept: "image/png",
      fallbackType: "image/png",
      timeoutMs: 20_000,
    });
  },
);

app.get<{ Params: { z: string; x: string; y: string } }>(
  "/map/tiles/vector/:z/:x/:y.pbf",
  {
    config: { rateLimit: { max: 600, timeWindow: "1 minute" } },
  },
  async (request, reply) => {
    const tile = validateTile(
      request.params.z,
      request.params.x,
      request.params.y,
      14,
    );
    if (!tile)
      return reply.code(400).send({
        error: {
          code: "BAD_REQUEST",
          message: "Invalid vector tile coordinate.",
        },
      });
    return proxyBinary(
      reply,
      `${mapsourceOrigin}/api/tiles/vector/${tile.z}/${tile.x}/${tile.y}.pbf`,
      {
        authenticated: true,
        accept: "application/x-protobuf",
        fallbackType: "application/x-protobuf",
      },
    );
  },
);

app.get<{ Params: { z: string; x: string; y: string } }>(
  "/map/terrain/:z/:x/:y.png",
  {
    config: { rateLimit: { max: 300, timeWindow: "1 minute" } },
  },
  async (request, reply) => {
    const tile = validateTile(
      request.params.z,
      request.params.x,
      request.params.y,
      15,
    );
    if (!tile)
      return reply.code(400).send({
        error: {
          code: "BAD_REQUEST",
          message: "Invalid terrain tile coordinate.",
        },
      });
    return proxyBinary(
      reply,
      `${mapsourceOrigin}/api/terrain/${tile.z}/${tile.x}/${tile.y}.png`,
      {
        authenticated: true,
        accept: "image/png",
        fallbackType: "image/png",
      },
    );
  },
);

app.get<{ Params: { fontstack: string; range: string } }>(
  "/map/glyphs/:fontstack/:range.pbf",
  {
    config: { rateLimit: { max: 300, timeWindow: "1 minute" } },
  },
  async (request, reply) => {
    const fontstack = request.params.fontstack;
    const range = request.params.range;
    if (
      !/^[A-Za-z0-9 ,.\-_]{1,128}$/.test(fontstack) ||
      !/^\d+-\d+$/.test(range)
    ) {
      return reply.code(400).send({
        error: { code: "BAD_REQUEST", message: "Invalid glyph range." },
      });
    }
    return proxyBinary(
      reply,
      `${mapsourceOrigin}/api/glyphs/${encodeURIComponent(fontstack)}/${range}.pbf`,
      {
        accept: "application/x-protobuf",
        fallbackType: "application/x-protobuf",
      },
    );
  },
);

app.get<{ Params: { z: string; x: string; y: string } }>(
  "/map/satellite/:z/:x/:y.jpg",
  {
    config: { rateLimit: { max: 300, timeWindow: "1 minute" } },
  },
  async (request, reply) => {
    const tile = validateTile(
      request.params.z,
      request.params.x,
      request.params.y,
      19,
    );
    if (!tile)
      return reply.code(400).send({
        error: {
          code: "BAD_REQUEST",
          message: "Invalid satellite tile coordinate.",
        },
      });
    return proxyBinary(
      reply,
      `${ESRI_WORLD_IMAGERY}/${tile.z}/${tile.y}/${tile.x}`,
      {
        accept: "image/jpeg,image/png",
        fallbackType: "image/jpeg",
      },
    );
  },
);

await app.register(fastifyStatic, {
  root: webRoot,
  prefix: "/",
  index: false,
  maxAge: "1h",
  immutable: false,
});

app.get("/", (_request, reply) => {
  reply.header("cache-control", "no-cache");
  return reply.sendFile("index.html");
});

app.setNotFoundHandler((request, reply) => {
  if (
    request.method === "GET" &&
    !request.url.startsWith("/api/") &&
    !request.url.startsWith("/map/")
  ) {
    reply.header("cache-control", "no-cache");
    return reply.sendFile("index.html");
  }
  return reply
    .code(404)
    .send({ error: { code: "NOT_FOUND", message: "Route not found." } });
});

try {
  await app.listen({ host, port });
} catch (error) {
  app.log.error(error);
  process.exitCode = 1;
}
