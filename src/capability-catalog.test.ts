import { allOperations } from "mapsource";
import { describe, expect, it } from "vitest";
import { buildCapabilityCatalog } from "./capability-catalog";

describe("capability catalog", () => {
  it("projects every SDK operation exactly once", () => {
    const catalog = buildCapabilityCatalog(allOperations);
    const projected = catalog.groups.flatMap((group) => group.operations);

    expect(catalog.total).toBe(allOperations.length);
    expect(new Set(projected.map((operation) => operation.id)).size).toBe(
      allOperations.length,
    );
    expect(projected.map((operation) => operation.id).sort()).toEqual(
      allOperations.map((operation) => operation.id).sort(),
    );
  });

  it("keeps every service family discoverable", () => {
    const categories = buildCapabilityCatalog(allOperations).groups.map(
      (group) => group.category,
    );
    expect(categories).toEqual(
      expect.arrayContaining([
        "discovery",
        "navigation",
        "terrain",
        "compute",
        "cartography",
        "delivery",
        "meta",
        "account",
      ]),
    );
  });
});
