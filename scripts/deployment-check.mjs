const origin = (
  process.env.DEPLOYMENT_ORIGIN || "http://127.0.0.1:3220"
).replace(/\/$/, "");

for (const path of ["/health/live", "/health/ready"]) {
  const started = performance.now();
  const response = await fetch(`${origin}${path}`, {
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error(`${path} returned ${response.status}`);
  process.stdout.write(
    `${path} ${response.status} ${Math.round(performance.now() - started)}ms\n`,
  );
}

for (const [surface, expectedName] of Object.entries({
  mapsource: "Mapsource",
  dark: "Mapsource Dark",
  light: "Mapsource Light",
  elevation: "Mapsource",
  satellite: "Mapsource",
})) {
  const path = `/map/style.json?surface=${surface}`;
  const response = await fetch(`${origin}${path}`, {
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error(`${path} returned ${response.status}`);
  const style = await response.json();
  if (style?.name !== expectedName) {
    throw new Error(`${path} returned ${style?.name ?? "no style name"}`);
  }
  if (!style?.sources?.["mapsource-terrain"]) {
    throw new Error(`${path} omitted the terrain source`);
  }
  if (!style?.layers?.some((layer) => layer.id === "mapsource.hillshade")) {
    throw new Error(`${path} omitted the hillshade layer`);
  }
  if (!style?.layers?.some((layer) => layer.id === "transit.rail")) {
    throw new Error(`${path} omitted the rail/light-rail network layer`);
  }
  process.stdout.write(`${path} ${response.status} ${style.name}\n`);
}

for (const imagePath of [
  "/map/preview/mapsource.png",
  "/map/preview/elevation.png",
  "/map/preview/dark.png",
  "/map/preview/light.png",
  "/map/tiles/raster/dark/14/2606/5859.png",
  "/map/tiles/vector/14/2606/5859.pbf",
]) {
  const response = await fetch(`${origin}${imagePath}`, {
    signal: AbortSignal.timeout(25_000),
  });
  if (!response.ok) throw new Error(`${imagePath} returned ${response.status}`);
  const bytes = (await response.arrayBuffer()).byteLength;
  if (bytes < 512) throw new Error(`${imagePath} returned too few bytes`);
  process.stdout.write(`${imagePath} ${response.status} ${bytes} bytes\n`);
}

for (const category of ["transit_stop", "railway_station"]) {
  const query = `category=${category}&lat=45.5231&lon=-122.6765&west=-122.74&south=45.49&east=-122.62&north=45.56`;
  const response = await fetch(`${origin}/api/discover?${query}`, {
    signal: AbortSignal.timeout(25_000),
  });
  if (!response.ok) {
    throw new Error(`/api/discover (${category}) returned ${response.status}`);
  }
  const body = await response.json();
  if (!Array.isArray(body?.places) || body.places.length === 0) {
    throw new Error(`/api/discover (${category}) returned no mapped features`);
  }
  process.stdout.write(
    `/api/discover ${category} ${response.status} ${body.places.length} mapped features\n`,
  );
}

for (const mode of ["walk", "bike", "car", "bus", "train"]) {
  const routeStarted = performance.now();
  const routeResponse = await fetch(`${origin}/api/route`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      mode,
      waypoints: [
        { lat: 45.53616, lon: -122.71256 },
        { lat: 45.52521, lon: -122.71627 },
      ],
    }),
    signal: AbortSignal.timeout(20_000),
  });
  if (!routeResponse.ok)
    throw new Error(`/api/route (${mode}) returned ${routeResponse.status}`);
  const route = await routeResponse.json();
  if (
    !Array.isArray(route?.geometry?.coordinates) ||
    route.geometry.coordinates.length < 2
  ) {
    throw new Error(`/api/route (${mode}) returned no usable geometry`);
  }
  process.stdout.write(
    `/api/route ${mode} ${routeResponse.status} ${Math.round(performance.now() - routeStarted)}ms ${route.geometry.coordinates.length} points\n`,
  );
}

const satelliteStarted = performance.now();
const satelliteResponse = await fetch(`${origin}/map/satellite/5/5/11.jpg`, {
  signal: AbortSignal.timeout(10_000),
});
if (!satelliteResponse.ok)
  throw new Error(`/map/satellite returned ${satelliteResponse.status}`);
const satelliteBytes = (await satelliteResponse.arrayBuffer()).byteLength;
if (satelliteBytes < 512)
  throw new Error("/map/satellite returned an implausibly small image");
process.stdout.write(
  `/map/satellite ${satelliteResponse.status} ${Math.round(performance.now() - satelliteStarted)}ms ${satelliteBytes} bytes\n`,
);
