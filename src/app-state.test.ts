import { describe, expect, it } from "vitest";
import {
  APP_STATE_MAX_BYTES,
  APP_STATE_STORAGE_KEY,
  loadPersistedAppState,
  parsePersistedAppState,
  savePersistedAppState,
  type PersistedAppState,
} from "./app-state";

const validState: PersistedAppState = {
  version: 1,
  savedAt: 1_790_000_000_000,
  waypoints: [
    {
      id: "origin",
      label: "Lower Macleay Trailhead",
      lat: 45.53616,
      lon: -122.71256,
      routeRole: "origin",
    },
    {
      id: "destination",
      label: "Pittock Mansion",
      lat: 45.52521,
      lon: -122.71627,
      routeRole: "destination",
    },
  ],
  mode: "walk",
  surface: "dark",
  camera: {
    center: [-122.716, 45.531],
    zoom: 14.2,
    bearing: -18,
    pitch: 42,
  },
  sheetMode: "half",
  discoveryCategory: "restaurant",
  inspection: {
    coordinate: { lat: 45.533, lon: -122.72 },
    revealed: true,
    fallbackLabel: "Trail House Cafe",
  },
};

describe("persisted app state", () => {
  it("round trips a validated versioned snapshot", () => {
    let stored: string | null = null;
    const storage = {
      getItem: (key: string) => (key === APP_STATE_STORAGE_KEY ? stored : null),
      setItem: (key: string, value: string) => {
        expect(key).toBe(APP_STATE_STORAGE_KEY);
        stored = value;
      },
    };
    expect(savePersistedAppState(validState, storage)).toBe(true);
    expect(loadPersistedAppState(storage)).toEqual(validState);
  });

  it("rejects malformed, out-of-bounds, and oversized snapshots", () => {
    expect(parsePersistedAppState("not json")).toBeNull();
    expect(
      parsePersistedAppState(
        JSON.stringify({
          ...validState,
          waypoints: [{ ...validState.waypoints[0], lat: 100 }],
        }),
      ),
    ).toBeNull();
    expect(
      parsePersistedAppState("x".repeat(APP_STATE_MAX_BYTES + 1)),
    ).toBeNull();
  });

  it("fails closed when browser storage is unavailable", () => {
    expect(
      loadPersistedAppState({
        getItem: () => {
          throw new Error("blocked");
        },
      }),
    ).toBeNull();
    expect(
      savePersistedAppState(validState, {
        setItem: () => {
          throw new Error("quota");
        },
      }),
    ).toBe(false);
  });
});
