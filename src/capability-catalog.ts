import type { MapsourceOperation } from "mapsource";
import type { CapabilityCatalog, CapabilityOperation } from "./types.js";

const CATEGORY_LABELS: Record<string, string> = {
  discovery: "Search & OpenStreetMap",
  navigation: "Routing & reachability",
  terrain: "Terrain & elevation",
  compute: "Spatial compute",
  cartography: "Basemaps & styling",
  delivery: "Map delivery",
  meta: "Operations & telemetry",
  account: "Accounts & governance",
};

const CATEGORY_ORDER = [
  "discovery",
  "navigation",
  "terrain",
  "compute",
  "cartography",
  "delivery",
  "meta",
  "account",
];

export function buildCapabilityCatalog(
  operations: readonly MapsourceOperation[],
): CapabilityCatalog {
  const grouped = new Map<string, CapabilityOperation[]>();
  for (const operation of operations) {
    const values = grouped.get(operation.category) ?? [];
    values.push({
      id: operation.id,
      category: operation.category,
      method: operation.method,
      path: operation.path,
      summary: operation.summary,
      description: operation.description,
      access: operation.access,
    });
    grouped.set(operation.category, values);
  }

  const categories = [...grouped.keys()].sort((left, right) => {
    const leftIndex = CATEGORY_ORDER.indexOf(left);
    const rightIndex = CATEGORY_ORDER.indexOf(right);
    return (
      (leftIndex < 0 ? Number.MAX_SAFE_INTEGER : leftIndex) -
        (rightIndex < 0 ? Number.MAX_SAFE_INTEGER : rightIndex) ||
      left.localeCompare(right)
    );
  });

  return {
    total: operations.length,
    groups: categories.map((category) => ({
      category,
      label: CATEGORY_LABELS[category] ?? category,
      operations: grouped.get(category) ?? [],
    })),
  };
}
