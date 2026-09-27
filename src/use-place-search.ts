import { useEffect, useState } from "react";
import type { SearchResult } from "./types";

type SearchBias = { lat: number; lon: number };
type SearchStatus = "idle" | "loading" | "error";

type SearchResponse = {
  query: string;
  results: SearchResult[];
  status: SearchStatus;
};

export function usePlaceSearch(query: string, bias: SearchBias) {
  const trimmed = query.trim();
  const [response, setResponse] = useState<SearchResponse>({
    query: "",
    results: [],
    status: "idle",
  });

  useEffect(() => {
    if (trimmed.length < 2) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      const params = new URLSearchParams({
        q: trimmed,
        lat: String(bias.lat),
        lon: String(bias.lon),
      });
      fetch(`/api/search?${params}`, { signal: controller.signal })
        .then(async (result) => {
          if (!result.ok) throw new Error(`Search returned ${result.status}`);
          return result.json() as Promise<{ results?: SearchResult[] }>;
        })
        .then((body) => {
          setResponse({
            query: trimmed,
            results: body.results ?? [],
            status: "idle",
          });
        })
        .catch((error: unknown) => {
          if (error instanceof DOMException && error.name === "AbortError")
            return;
          setResponse({ query: trimmed, results: [], status: "error" });
        });
    }, 260);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [bias.lat, bias.lon, trimmed]);

  if (trimmed.length < 2) {
    return { results: [] as SearchResult[], status: "idle" as const };
  }
  if (response.query !== trimmed) {
    return { results: [] as SearchResult[], status: "loading" as const };
  }
  return { results: response.results, status: response.status };
}
