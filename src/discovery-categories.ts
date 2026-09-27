export const DISCOVERY_FILTERS = [
  { id: "restaurant", query: "restaurants", label: "Hungry", icon: "food" },
  { id: "cafe", query: "coffee", label: "Coffee", icon: "coffee" },
  { id: "shop", query: "shops", label: "Shopping", icon: "shop" },
  {
    id: "supermarket",
    query: "groceries",
    label: "Groceries",
    icon: "grocery",
  },
  {
    id: "pharmacy",
    query: "pharmacy",
    label: "Pharmacy",
    icon: "pharmacy",
  },
  { id: "fuel", query: "fuel", label: "Fuel", icon: "fuel" },
  { id: "hotel", query: "hotels", label: "Stay", icon: "hotel" },
  { id: "park", query: "parks", label: "Outdoors", icon: "park" },
] as const;

export const MINIMIZED_DISCOVERY_FILTERS = DISCOVERY_FILTERS.filter((filter) =>
  ["restaurant", "cafe", "park", "fuel"].includes(filter.id),
);
