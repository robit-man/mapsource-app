import { useEffect, useRef, useState } from "react";
import type { SearchResult } from "../types";
import { Icon } from "./Icon";

type SearchBarProps = {
  center: { lat: number; lon: number };
  onSelect: (result: SearchResult) => void;
};

export function SearchBar({ center, onSelect }: SearchBarProps) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [status, setStatus] = useState<"idle" | "loading" | "error">("idle");
  const [open, setOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      setResults([]);
      setStatus("idle");
      return;
    }
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setStatus("loading");
      const params = new URLSearchParams({
        q: trimmed,
        lat: String(center.lat),
        lon: String(center.lon),
      });
      fetch(`/api/search?${params}`, { signal: controller.signal })
        .then(async (response) => {
          if (!response.ok)
            throw new Error(`Search returned ${response.status}`);
          return response.json() as Promise<{ results?: SearchResult[] }>;
        })
        .then((body) => {
          setResults(body.results ?? []);
          setStatus("idle");
          setOpen(true);
        })
        .catch((error: unknown) => {
          if (error instanceof DOMException && error.name === "AbortError")
            return;
          setStatus("error");
        });
    }, 260);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [center.lat, center.lon, query]);

  const choose = (result: SearchResult) => {
    onSelect(result);
    setQuery("");
    setResults([]);
    setOpen(false);
    inputRef.current?.blur();
  };

  return (
    <div className="search-shell">
      <div className={`search-bar ${open ? "is-open" : ""}`}>
        <Icon name="search" size={20} />
        <input
          ref={inputRef}
          aria-label="Search trailheads, parks, and addresses"
          autoComplete="off"
          onChange={(event) => {
            setQuery(event.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          placeholder="Search trailheads, parks, addresses"
          spellCheck="false"
          value={query}
        />
        {status === "loading" && (
          <span aria-label="Searching" className="search-spinner" />
        )}
        {query && status !== "loading" && (
          <button
            aria-label="Clear search"
            className="icon-button compact"
            onClick={() => {
              setQuery("");
              setResults([]);
            }}
            type="button"
          >
            <Icon name="close" size={16} />
          </button>
        )}
      </div>
      {open && query.trim().length >= 2 && (
        <div className="search-results" role="listbox">
          <div className="search-results__meta">
            <span>
              {status === "loading"
                ? "Finding nearby places"
                : `${results.length} places`}
            </span>
            <span>Mapsource local search</span>
          </div>
          {status === "error" && (
            <p className="search-message">Search is unavailable. Try again.</p>
          )}
          {status === "idle" && results.length === 0 && (
            <p className="search-message">No matching places found.</p>
          )}
          {results.map((result, index) => (
            <button
              className="search-result"
              key={result.id ?? `${result.displayName}-${index}`}
              onClick={() => choose(result)}
              role="option"
              type="button"
            >
              <span className="result-icon">
                <Icon
                  name={result.kind === "place" ? "mountain" : "pin"}
                  size={17}
                />
              </span>
              <span className="result-copy">
                <strong>
                  {result.name ?? result.displayName ?? "Unnamed place"}
                </strong>
                <small>
                  {result.displayName ?? result.category ?? result.kind}
                </small>
              </span>
              <span className="result-action">
                <Icon name="plus" size={17} />
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
