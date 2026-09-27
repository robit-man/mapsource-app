const origin = (
  process.env.DEPLOYMENT_ORIGIN || "http://127.0.0.1:3220"
).replace(/\/$/, "");

for (const path of ["/health/live", "/health/ready", "/map/style.json"]) {
  const started = performance.now();
  const response = await fetch(`${origin}${path}`, {
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error(`${path} returned ${response.status}`);
  process.stdout.write(
    `${path} ${response.status} ${Math.round(performance.now() - started)}ms\n`,
  );
}

const routeStarted = performance.now();
const routeResponse = await fetch(`${origin}/api/route`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    mode: "hike",
    waypoints: [
      { lat: 45.53616, lon: -122.71256 },
      { lat: 45.52521, lon: -122.71627 },
    ],
  }),
  signal: AbortSignal.timeout(20_000),
});
if (!routeResponse.ok)
  throw new Error(`/api/route returned ${routeResponse.status}`);
const route = await routeResponse.json();
if (
  !Array.isArray(route?.geometry?.coordinates) ||
  route.geometry.coordinates.length < 2
) {
  throw new Error("/api/route returned no usable geometry");
}
process.stdout.write(
  `/api/route ${routeResponse.status} ${Math.round(performance.now() - routeStarted)}ms ${route.geometry.coordinates.length} points\n`,
);

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
