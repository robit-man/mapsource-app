import { useRef, useState } from "react";
import { DISCOVERY_FILTERS } from "../discovery-categories";
import type { SearchResult } from "../types";
import { usePlaceSearch } from "../use-place-search";
import { Icon } from "./Icon";

type SearchBarProps = {
  center: { lat: number; lon: number };
  onSelect: (result: SearchResult) => void;
  activeCategory: string | null;
  onCategory: (category: string | null) => void;
};

export function SearchBar({
  center,
  onSelect,
  activeCategory,
  onCategory,
}: SearchBarProps) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const { results, status } = usePlaceSearch(query, center);

  const choose = (result: SearchResult) => {
    onSelect(result);
    setQuery("");
    setOpen(false);
    setExpanded(false);
    onCategory(null);
    inputRef.current?.blur();
  };

  const expand = () => {
    setExpanded(true);
    window.requestAnimationFrame(() => inputRef.current?.focus());
  };

  const collapse = () => {
    setExpanded(false);
    setOpen(false);
    inputRef.current?.blur();
  };

  return (
    <div className={`search-shell ${expanded ? "is-expanded" : ""}`}>
      <div className={`search-bar ${open ? "is-open" : ""}`}>
        <button
          aria-label="Open search"
          className="search-toggle"
          onClick={expand}
          type="button"
        >
          <Icon name="search" size={20} />
        </button>
        <input
          ref={inputRef}
          aria-label="Search trailheads, parks, and addresses"
          autoComplete="off"
          disabled={!expanded}
          onChange={(event) => {
            const nextQuery = event.target.value;
            setQuery(nextQuery);
            setOpen(true);
            onCategory(null);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(event) => {
            if (event.key === "Escape") collapse();
          }}
          placeholder="Search trailheads, parks, addresses"
          spellCheck="false"
          value={query}
        />
        {status === "loading" && (
          <span
            aria-label="Searching"
            className="search-spinner search-spinner--bar"
          />
        )}
        {query && status !== "loading" && (
          <button
            aria-label="Clear search"
            className="icon-button compact"
            onClick={() => {
              setQuery("");
              onCategory(null);
            }}
            type="button"
          >
            <Icon name="close" size={16} />
          </button>
        )}
        {expanded && !query && (
          <button
            aria-label="Close search"
            className="icon-button compact"
            onClick={collapse}
            type="button"
          >
            <Icon name="close" size={16} />
          </button>
        )}
      </div>
      {expanded && (
        <div className="quick-filters" aria-label="Explore nearby">
          {DISCOVERY_FILTERS.map((filter) => (
            <button
              aria-label={filter.label}
              aria-pressed={activeCategory === filter.id}
              className={activeCategory === filter.id ? "is-active" : ""}
              key={filter.id}
              onClick={() => {
                setQuery(filter.query);
                setOpen(true);
                onCategory(filter.id);
                inputRef.current?.focus();
              }}
              title={filter.label}
              type="button"
            >
              <Icon name={filter.icon} size={17} />
            </button>
          ))}
        </div>
      )}
      {expanded && open && query.trim().length >= 2 && (
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
