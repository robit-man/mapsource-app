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
  mode?: "hike" | "run" | "bike";
};

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
  },
) {
  const headers = new Headers({ accept: options.accept });
  if (options.authenticated) {
    headers.set("authorization", `Bearer ${await resolveApiKey()}`);
    headers.set("origin", demoOrigin);
  }
  const response = await fetch(url, {
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
    "geolocation=(self), camera=(), microphone=(), payment=()",
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
          limit: 8,
          ...(lat !== undefined && lon !== undefined ? { lat, lon } : {}),
        },
      },
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
    const mode = request.body.mode ?? "hike";
    if (!new Set(["hike", "run", "bike"]).has(mode)) {
      return reply.code(400).send({
        error: {
          code: "BAD_REQUEST",
          message: "Mode must be hike, run, or bike.",
        },
      });
    }
    const client = await mapsourceClient();
    const result = await client.POST("/api/route", {
      body: {
        locations: waypoints.map(({ lat, lon }) => ({ lat, lon })),
        costing: mode === "bike" ? "bicycle" : "pedestrian",
        elevation: true,
      },
    });
    if (result.error)
      return apiFailure(reply, result.response.status, result.error);
    reply.header("cache-control", "no-store");
    return result.data;
  },
);

app.get(
  "/map/style.json",
  {
    config: { rateLimit: { max: 120, timeWindow: "1 minute" } },
  },
  async (_request, reply) => {
    const response = await fetch(
      `${mapsourceOrigin}/api/styles/mapsource/style.json`,
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
        "hillshade-shadow-color": "#0a0d0a",
        "hillshade-highlight-color": "#d8ed9d",
        "hillshade-accent-color": "#506a55",
        "hillshade-exaggeration": 0.28,
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
