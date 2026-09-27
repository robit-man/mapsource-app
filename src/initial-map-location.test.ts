import { describe, expect, it, vi } from "vitest";
import { initialMapLocation } from "./initial-map-location";

const visitor = {
  latitude: 52.52,
  longitude: 13.405,
  label: "Berlin, DE",
  source: "cloudflare",
};

describe("initial map location", () => {
  it.each(["cloudflare", "ip-api", "db-ip"])(
    "accepts the shared gateway's %s result",
    async (source) => {
      const request = vi
        .fn<typeof fetch>()
        .mockResolvedValue(Response.json({ ...visitor, source }));
      await expect(
        initialMapLocation(new AbortController().signal, request),
      ).resolves.toEqual({
        center: [13.405, 52.52],
        zoom: 12,
        label: "Berlin, DE",
        source,
      });
      expect(request).toHaveBeenCalledWith(
        "/api/location",
        expect.objectContaining({ cache: "no-store" }),
      );
    },
  );

  it.each([null, "52.52", 91, Number.NaN])(
    "rejects invalid coordinates (%s)",
    async (latitude) => {
      const request = vi
        .fn<typeof fetch>()
        .mockResolvedValue(Response.json({ ...visitor, latitude }));
      await expect(
        initialMapLocation(new AbortController().signal, request),
      ).resolves.toBeNull();
    },
  );

  it("does not invent a location when the resolver is unavailable", async () => {
    const request = vi
      .fn<typeof fetch>()
      .mockRejectedValue(new Error("offline"));
    await expect(
      initialMapLocation(new AbortController().signal, request),
    ).resolves.toBeNull();
  });
});
