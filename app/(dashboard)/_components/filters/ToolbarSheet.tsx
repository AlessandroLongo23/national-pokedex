"use client";

/* Variant A — "Sheet"
   Always visible: search, supertype tabs, sort, result count, size.
   Everything else (rarity/set/artist/type/dex/price/region/form) lives behind
   one entry point: a [Filters · N] button that opens a side sheet. */

import { useEffect, useState } from "react";
import { SlidersHorizontal, X } from "lucide-react";
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
import type { ToolbarProps } from "./ToolbarShared";

export function ToolbarSheet({
  filters,
  onFiltersChange,
  sort,
  onSortChange,
  cols,
  onColsChange,
  resultCount,
  totalCount,
  artists,
  types,
  features = {},
}: ToolbarProps) {
  const [sheetOpen, setSheetOpen] = useState(false);
  const { priceSource } = useUser();
  const currencySymbol = PRICE_SOURCE_CURRENCY[priceSource] === "EUR" ? "€" : "$";

  const update = (patch: Partial<typeof filters>) =>
    onFiltersChange({ ...filters, ...patch });

  const activeCount = countActiveFilters(filters);
  const dirty = isFiltersDirty(filters);

  useEffect(() => {
    if (!sheetOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSheetOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.documentElement.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.documentElement.style.overflow = "";
    };
  }, [sheetOpen]);

  return (
    <>
      <div className="sticky top-2 z-10 rounded-lg border border-border bg-panel/85 backdrop-blur-md">
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

          <button
            type="button"
            onClick={() => setSheetOpen(true)}
            className={[
              "inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-xs transition outline-none",
              "focus-visible:ring-2 focus-visible:ring-accent/60",
              activeCount > 0
                ? "bg-[color-mix(in_oklch,var(--color-accent)_14%,transparent)] text-[var(--color-accent)]"
                : "bg-panel-2 text-muted hover:bg-panel-3 hover:text-text",
            ].join(" ")}
          >
            <SlidersHorizontal className="h-3.5 w-3.5" aria-hidden />
            <span>Filters</span>
            {activeCount > 0 && (
              <span className="ml-0.5 rounded-sm bg-[var(--color-accent)] px-1 py-px text-[10px] nums text-bg">
                {activeCount}
              </span>
            )}
          </button>

          <SortControl value={sort} onChange={onSortChange} />

          <div className="ml-auto flex items-center gap-3">
            <ResultCount
              result={resultCount}
              total={totalCount}
              dirty={dirty}
              onClear={() => onFiltersChange(emptyFilters())}
            />
            <SizeControl cols={cols} onColsChange={onColsChange} compact />
          </div>
        </div>
      </div>

      {sheetOpen && (
        <Sheet onClose={() => setSheetOpen(false)}>
          <div className="flex items-center justify-between border-b border-border px-5 py-4">
            <div>
              <h2 className="text-sm font-semibold text-text">Filters</h2>
              <p className="text-[11px] text-muted">
                {activeCount === 0
                  ? "Refine the wishlist by rarity, set, artist, or more."
                  : `${activeCount} active`}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setSheetOpen(false)}
              aria-label="Close filters"
              className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted transition hover:bg-panel-2 hover:text-text"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="space-y-6 overflow-y-auto px-5 py-5">
            <Section title="Rarity">
              <RarityFilter
                inline
                value={filters.rarities}
                onChange={(rarities) => update({ rarities })}
              />
            </Section>

            <Section title="Set">
              <SetFilter
                value={filters.setIds}
                onChange={(setIds) => update({ setIds })}
              />
            </Section>

            <Section title="Artist">
              <ArtistFilter
                value={filters.artist}
                onChange={(artist) => update({ artist })}
                options={artists}
              />
            </Section>

            {types.length > 0 && (
              <Section title="Energy type">
                <TypeFilter
                  inline
                  types={types}
                  value={filters.types}
                  onChange={(next) => update({ types: next })}
                />
              </Section>
            )}

            <Section title="Pokédex range">
              <DexFilter
                inline
                from={filters.dexFrom}
                to={filters.dexTo}
                onChange={(dexFrom, dexTo) => update({ dexFrom, dexTo })}
              />
            </Section>

            {features.showPrice && (
              <Section title="Price">
                <PriceFilter
                  inline
                  value={filters.priceBuckets}
                  onChange={(priceBuckets) => update({ priceBuckets })}
                  currencySymbol={currencySymbol}
                />
              </Section>
            )}

            {features.showGeneration && (
              <Section title="Region">
                <RegionFilter
                  inline
                  value={filters.generations}
                  onChange={(generations) => update({ generations })}
                />
              </Section>
            )}

            {features.showRegionalForm && (
              <Section title="Regional form">
                <FormFilter
                  inline
                  value={filters.regionalForms}
                  onChange={(regionalForms) => update({ regionalForms })}
                />
              </Section>
            )}
          </div>

          <div className="flex items-center justify-between gap-3 border-t border-border bg-panel-2/40 px-5 py-3">
            <button
              type="button"
              onClick={() => onFiltersChange(emptyFilters())}
              disabled={!dirty}
              className={[
                "text-[11px] uppercase tracking-[0.16em] transition",
                dirty
                  ? "text-muted hover:text-text"
                  : "text-muted/40 cursor-not-allowed",
              ].join(" ")}
            >
              Reset all
            </button>
            <button
              type="button"
              onClick={() => setSheetOpen(false)}
              className="inline-flex h-8 items-center rounded-md bg-[var(--color-accent)] px-4 text-xs font-medium text-bg transition hover:bg-[var(--color-accent-dark)] hover:text-text"
            >
              Show {resultCount.toLocaleString()}{" "}
              {resultCount === 1 ? "card" : "cards"}
            </button>
          </div>
        </Sheet>
      )}
    </>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted">
        {title}
      </div>
      {children}
    </div>
  );
}

function Sheet({
  onClose,
  children,
}: {
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-40">
      <div
        className="absolute inset-0 bg-bg/70 backdrop-blur-sm animate-[sheet-fade_140ms_ease-out]"
        onClick={onClose}
      />
      <aside
        className={[
          "absolute right-0 top-0 flex h-full w-[min(420px,92vw)] flex-col border-l border-border bg-panel shadow-[-12px_0_32px_-12px_rgb(0_0_0/0.6)]",
          "animate-[sheet-slide_220ms_cubic-bezier(0.16,1,0.3,1)]",
        ].join(" ")}
        role="dialog"
        aria-modal="true"
        aria-label="Filters"
      >
        {children}
      </aside>
    </div>
  );
}
