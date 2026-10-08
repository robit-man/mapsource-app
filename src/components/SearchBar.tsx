import { useEffect, useMemo, useRef, useState } from "react";
import { DISCOVERY_FILTERS } from "../discovery-categories";
import { normalizeSearchResults, resultDistanceLabel } from "../search-results";
import type { PresentedSearchResult, SearchStatus } from "../types";
import { usePlaceSearch } from "../use-place-search";
import { Icon } from "./Icon";

type SearchBarProps = {
  center: { lat: number; lon: number };
  activeCategory: string | null;
  categoryResults: PresentedSearchResult[];
  categoryStatus: SearchStatus;
  selectedResultId: string | null;
  hoveredResultId: string | null;
  hoveredOnMap: boolean;
  onResultHover: (id: string | null) => void;
  searchAreaAvailable: boolean;
  routeSelectionActive: boolean;
  onCategory: (category: string | null) => void;
  onQueryResults: (
    query: string,
    results: PresentedSearchResult[],
    status: SearchStatus,
  ) => void;
  onSearchArea: () => void;
  onSelect: (result: PresentedSearchResult) => void;
};

export function SearchBar({
  center,
  activeCategory,
  categoryResults,
  categoryStatus,
  selectedResultId,
  hoveredResultId,
  hoveredOnMap,
  onResultHover,
  searchAreaAvailable,
  routeSelectionActive,
  onCategory,
  onQueryResults,
  onSearchArea,
  onSelect,
}: SearchBarProps) {
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState(false);
  const [resultsOpen, setResultsOpen] = useState(false);
  const [searchBias, setSearchBias] = useState(center);
  const inputRef = useRef<HTMLInputElement>(null);
  const disclosureRef = useRef<HTMLButtonElement>(null);
  const rowRefs = useRef(new Map<string, HTMLButtonElement>());
  const previousQueryRef = useRef("");
  const { results, status } = usePlaceSearch(query, searchBias);
  const textResults = useMemo(() => normalizeSearchResults(results), [results]);
  const presentedResults = activeCategory ? categoryResults : textResults;
  const presentedStatus = activeCategory ? categoryStatus : status;
  const hasIntent = query.trim().length >= 2;
  const highlightedResultId = presentedResults.some(
    (result) => result.id === hoveredResultId,
  )
    ? hoveredResultId
    : null;

  useEffect(() => {
    onQueryResults(query.trim(), textResults, status);
  }, [onQueryResults, query, status, textResults]);

  useEffect(() => {
    if (previousQueryRef.current !== query) {
      setResultsOpen(routeSelectionActive && query.trim().length >= 2);
    }
    previousQueryRef.current = query;
  }, [query, routeSelectionActive]);

  useEffect(() => {
    const acceptRouteSelection = () => {
      setQuery("");
      setResultsOpen(false);
      setExpanded(false);
      onCategory(null);
      inputRef.current?.blur();
    };
    window.addEventListener("mapsource:search-accepted", acceptRouteSelection);
    return () =>
      window.removeEventListener(
        "mapsource:search-accepted",
        acceptRouteSelection,
      );
  }, [onCategory]);

  useEffect(() => {
    const id = hoveredOnMap ? hoveredResultId : selectedResultId;
    if (!resultsOpen || !id) return;
    const frame = window.requestAnimationFrame(() => {
      const row = rowRefs.current.get(id);
      const list = document.getElementById("map-search-results");
      if (!row || !list) return;
      const bounds = row.getBoundingClientRect();
      const viewport = list.getBoundingClientRect();
      if (bounds.top < viewport.top || bounds.bottom > viewport.bottom) {
        row.scrollIntoView({
          block: "nearest",
          inline: "nearest",
          behavior: hoveredOnMap ? "smooth" : "auto",
        });
      }
    });
    return () => window.cancelAnimationFrame(frame);
  }, [hoveredOnMap, hoveredResultId, resultsOpen, selectedResultId]);

  const closeResults = () => {
    onResultHover(null);
    setResultsOpen(false);
    disclosureRef.current?.focus();
  };

  const collapse = () => {
    onResultHover(null);
    setExpanded(false);
    setResultsOpen(false);
    inputRef.current?.blur();
  };

  const clear = () => {
    onResultHover(null);
    setQuery("");
    setResultsOpen(false);
    onCategory(null);
    onQueryResults("", [], "idle");
  };

  const countLabel =
    presentedStatus === "loading"
      ? "Searching map"
      : presentedStatus === "error"
        ? "Retry search"
        : presentedResults.length === 0
          ? "No results"
          : `${presentedResults.length} ${presentedResults.length === 1 ? "result" : "results"}`;

  return (
    <div
      className={`search-shell ${expanded ? "is-expanded" : ""}`}
      onKeyDown={(event) => {
        if (event.key !== "Escape") return;
        event.stopPropagation();
        if (resultsOpen) closeResults();
        else collapse();
      }}
    >
      <div className="search-bar">
        <button
          aria-label="Open search"
          className="search-toggle"
          onClick={() => {
            setExpanded(true);
            window.requestAnimationFrame(() => inputRef.current?.focus());
          }}
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
            if (!query.trim() && nextQuery.trim()) setSearchBias(center);
            setQuery(nextQuery);
            onCategory(null);
          }}
          placeholder="Search trailheads, parks, addresses"
          spellCheck="false"
          value={query}
        />
        {status === "loading" && !activeCategory && (
          <span
            aria-label="Searching"
            className="search-spinner search-spinner--bar"
          />
        )}
        {query && !(status === "loading" && !activeCategory) && (
          <button
            aria-label="Clear search"
            className="icon-button compact"
            onClick={clear}
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
                setSearchBias(center);
                setResultsOpen(false);
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

      {expanded && hasIntent && (
        <div className="search-result-controls">
          <button
            ref={disclosureRef}
            aria-controls="map-search-results"
            aria-expanded={resultsOpen}
            className="search-results-disclosure"
            disabled={
              presentedStatus === "loading" && presentedResults.length === 0
            }
            onClick={() => {
              onResultHover(null);
              setResultsOpen((value) => !value);
            }}
            type="button"
          >
            {presentedStatus === "loading" && (
              <span className="search-spinner" />
            )}
            <span>{countLabel}</span>
            <Icon name={resultsOpen ? "chevronUp" : "chevronDown"} size={15} />
          </button>
          {searchAreaAvailable && (
            <button
              className="search-area-button"
              onClick={() => {
                setSearchBias(center);
                onSearchArea();
              }}
              type="button"
            >
              Search this area
            </button>
          )}
        </div>
      )}

      {expanded && hasIntent && resultsOpen && (
        <div
          aria-label="Search results"
          className="search-results"
          id="map-search-results"
          role="listbox"
        >
          <div className="search-results__meta">
            <span>{countLabel}</span>
            <button
              aria-label="Close results"
              onClick={closeResults}
              type="button"
            >
              <Icon name="close" size={14} />
            </button>
          </div>
          {presentedStatus === "error" && (
            <p className="search-message">Search is unavailable. Try again.</p>
          )}
          {presentedStatus === "idle" && presentedResults.length === 0 && (
            <p className="search-message">No matching places found here.</p>
          )}
          {presentedResults.map((result) => {
            const distance = resultDistanceLabel(result.distanceMeters);
            return (
              <button
                ref={(element) => {
                  if (element) rowRefs.current.set(result.id, element);
                  else rowRefs.current.delete(result.id);
                }}
                aria-selected={selectedResultId === result.id}
                className={`search-result ${selectedResultId === result.id ? "is-selected" : ""} ${highlightedResultId === result.id ? "is-highlighted" : highlightedResultId ? "is-dimmed" : ""}`}
                data-result-id={result.id}
                key={result.id}
                onClick={() => onSelect(result)}
                onPointerEnter={(event) => {
                  if (event.pointerType !== "touch") onResultHover(result.id);
                }}
                onPointerLeave={(event) => {
                  if (event.pointerType !== "touch") onResultHover(null);
                }}
                onFocus={() => onResultHover(result.id)}
                onBlur={() => onResultHover(null)}
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
                  <strong>{result.name}</strong>
                  <small>
                    {[result.detail, distance].filter(Boolean).join(" · ")}
                  </small>
                </span>
                <span className="result-action">
                  <Icon name="arrow" size={17} />
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
