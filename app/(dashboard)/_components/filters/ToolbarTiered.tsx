"use client";

/* Variant C — "Two-tier"
   Primary row always visible. Secondary row of triggers collapses behind a
   one-click "More filters" toggle. Persistence: if the user has any secondary
   filter active, the tier auto-expands on mount. */

import { useEffect, useState } from "react";
import { ChevronDown, Filter, LayoutGrid, Rows3, Star } from "lucide-react";
import { PRICE_SOURCE_CURRENCY } from "@/lib/pricing/pokemontcg";
import { useUser } from "../../_lib/UserContext";
import { SearchInput } from "./SearchInput";
import { SupertypeTabs } from "./SupertypeTabs";
import { SortControl } from "./SortControl";
import { SizeControl } from "./SizeControl";
import { RarityFilter } from "./RarityFilter";
import { SetFilter } from "./SetFilter";
import { ArtistFilter } from "./ArtistFilter";
import { TypeFilter } from "./TypeFilter";
import { DexFilter } from "./DexFilter";
import { PriceFilter } from "./PriceFilter";
import { RegionFilter } from "./RegionFilter";
import { FormFilter } from "./FormFilter";
import { ResultCount } from "./primitives";
import {
  countActiveFilters,
  emptyFilters,
  isFiltersDirty,
} from "./types";
import type { CardView, ToolbarProps } from "./ToolbarShared";

export function ToolbarTiered({
  filters,
  onFiltersChange,
  sort,
  onSortChange,
  sortDir,
  onSortDirChange,
  sortOptions,
  cols,
  onColsChange,
  resultCount,
  totalCount,
  artists,
  types,
  features = {},
  view = "grid",
  onViewChange,
}: ToolbarProps) {
  const { priceSource } = useUser();
  const currencySymbol =
    PRICE_SOURCE_CURRENCY[priceSource] === "EUR" ? "€" : "$";

  const activeCount = countActiveFilters(filters);
  const dirty = isFiltersDirty(filters);
  const [expanded, setExpanded] = useState(false);
  // `overflow-hidden` is required during the collapse/expand transition so
  // the grid-rows animation hides the secondary row cleanly. Once fully open,
  // we drop it so dropdown popovers (Rarity, Set, …) aren't clipped.
  const [allowOverflow, setAllowOverflow] = useState(false);

  // Auto-expand if the user already has secondary filters active.
  useEffect(() => {
    if (activeCount > 0) {
      setExpanded(true);
      setAllowOverflow(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (expanded) {
      const t = setTimeout(() => setAllowOverflow(true), 220);
      return () => clearTimeout(t);
    }
    setAllowOverflow(false);
  }, [expanded]);

  const update = (patch: Partial<typeof filters>) =>
    onFiltersChange({ ...filters, ...patch });

  return (
    // `top-16` clears the 64px-tall app top bar; the page scrolls beneath it so
    // the title disappears while this stays pinned.
    <div className="sticky top-16 z-sticky rounded-lg border border-border bg-panel/85 backdrop-blur-md">
      <div className="flex flex-wrap items-center gap-2 px-3 py-2.5 sm:gap-3">
        <SearchInput
          value={filters.search}
          onChange={(search) => update({ search })}
          className="flex-1 sm:max-w-xs"
        />
        <SupertypeTabs
          value={filters.supertype}
          onChange={(supertype) => update({ supertype })}
        />
        <SortControl
          value={sort}
          onChange={onSortChange}
          dir={sortDir}
          onDirChange={onSortDirChange}
          options={sortOptions}
        />

        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          className={[
            "inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-xs transition outline-none",
            "focus-visible:ring-2 focus-visible:ring-accent/60",
            expanded
              ? "bg-panel-3 text-text"
              : activeCount > 0
                ? "bg-[color-mix(in_oklch,var(--color-accent)_14%,transparent)] text-[var(--color-accent)]"
                : "bg-panel-2 text-text-secondary hover:bg-panel-3 hover:text-text",
          ].join(" ")}
        >
          <Filter className="h-3.5 w-3.5" aria-hidden />
          <span>More filters</span>
          {activeCount > 0 && !expanded && (
            <span className="rounded-sm bg-[var(--color-accent)] px-1 py-px text-[10px] nums text-bg">
              {activeCount}
            </span>
          )}
          <ChevronDown
            aria-hidden
            className={[
              "h-3 w-3 transition-transform",
              expanded ? "rotate-180" : "",
            ].join(" ")}
          />
        </button>

        <div className="ml-auto flex items-center gap-3">
          <ResultCount
            result={resultCount}
            total={totalCount}
            dirty={dirty}
            onClear={() => onFiltersChange(emptyFilters())}
          />
          {onViewChange && <ViewToggle value={view} onChange={onViewChange} />}
          {view === "grid" && (
            <SizeControl cols={cols} onColsChange={onColsChange} compact />
          )}
        </div>
      </div>

      <div
        className={[
          "transition-[grid-template-rows] duration-200 ease-out grid",
          expanded ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
          allowOverflow ? "overflow-visible" : "overflow-hidden",
        ].join(" ")}
      >
        <div className={allowOverflow ? "min-h-0" : "min-h-0 overflow-hidden"}>
          <div className="flex flex-wrap items-center gap-2 border-t border-border/70 px-3 py-2.5">
            <RarityFilter
              value={filters.rarities}
              onChange={(rarities) => update({ rarities })}
            />
            <SetFilter
              value={filters.setIds}
              onChange={(setIds) => update({ setIds })}
            />
            <ArtistFilter
              value={filters.artist}
              onChange={(artist) => update({ artist })}
              options={artists}
            />
            <TypeFilter
              types={types}
              value={filters.types}
              onChange={(next) => update({ types: next })}
            />
            <DexFilter
              from={filters.dexFrom}
              to={filters.dexTo}
              onChange={(dexFrom, dexTo) => update({ dexFrom, dexTo })}
            />
            {features.showPrice && (
              <PriceFilter
                value={filters.priceBuckets}
                onChange={(priceBuckets) => update({ priceBuckets })}
                currencySymbol={currencySymbol}
              />
            )}
            {features.showGeneration && (
              <RegionFilter
                value={filters.generations}
                onChange={(generations) => update({ generations })}
              />
            )}
            {features.showRegionalForm && (
              <FormFilter
                value={filters.regionalForms}
                onChange={(regionalForms) => update({ regionalForms })}
              />
            )}
            {features.showFavorites && (
              <button
                type="button"
                onClick={() => update({ favoritesOnly: !filters.favoritesOnly })}
                aria-pressed={filters.favoritesOnly}
                className={[
                  "inline-flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-xs transition outline-none",
                  "focus-visible:ring-2 focus-visible:ring-accent/60",
                  filters.favoritesOnly
                    ? "border-favorite/70 bg-favorite/15 text-favorite-dark dark:text-favorite"
                    : "border-border bg-panel-2 text-text-secondary hover:border-border-strong hover:text-text",
                ].join(" ")}
              >
                <Star
                  className="h-3.5 w-3.5"
                  fill={filters.favoritesOnly ? "currentColor" : "none"}
                  strokeWidth={2}
                  aria-hidden
                />
                <span>Favorites</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function ViewToggle({
  value,
  onChange,
}: {
  value: CardView;
  onChange: (next: CardView) => void;
}) {
  const options = [
    { value: "grid" as const, Icon: LayoutGrid, label: "Grid" },
    { value: "list" as const, Icon: Rows3, label: "List" },
  ];
  return (
    <div
      role="radiogroup"
      aria-label="View"
      className="inline-flex h-10 md:h-8 items-center rounded-md bg-panel-2 p-0.5"
    >
      {options.map(({ value: v, Icon, label }) => {
        const active = value === v;
        return (
          <button
            key={v}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={label}
            onClick={() => onChange(v)}
            className={[
              "inline-flex h-10 w-10 md:h-7 md:w-7 items-center justify-center rounded transition outline-none",
              "focus-visible:ring-2 focus-visible:ring-accent/60",
              active
                ? "bg-panel-3 text-text shadow-[inset_0_0_0_1px_var(--color-border)]"
                : "text-text-secondary hover:text-text",
            ].join(" ")}
          >
            <Icon className="h-3.5 w-3.5" aria-hidden />
          </button>
        );
      })}
    </div>
  );
}
