"use client";

/* Variant B — "Inline + active chips"
   One quiet row of dropdown triggers. Selected values become removable chips
   in a strip below — visible state, no hidden filters. Dense but disciplined:
   every trigger is the same shape, every active state is the same accent dot. */

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
import { ActiveFilters } from "./ActiveFilters";
import { ResultCount } from "./primitives";
import { emptyFilters, isFiltersDirty } from "./types";
import type { ToolbarProps } from "./ToolbarShared";

export function ToolbarInline({
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
  const { priceSource } = useUser();
  const currencySymbol =
    PRICE_SOURCE_CURRENCY[priceSource] === "EUR" ? "€" : "$";

  const update = (patch: Partial<typeof filters>) =>
    onFiltersChange({ ...filters, ...patch });

  const dirty = isFiltersDirty(filters);

  return (
    <div className="sticky top-2 z-10 rounded-lg border border-border bg-panel/85 backdrop-blur-md">
      {/* Row 1: search · supertype · sort · result · size */}
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

      {/* Row 2: filter triggers — all the same shape */}
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
      </div>

      {/* Row 3: active filter chips — appears only when something is selected */}
      <ActiveFiltersStrip
        filters={filters}
        onChange={onFiltersChange}
        currencySymbol={currencySymbol}
      />
    </div>
  );
}

function ActiveFiltersStrip({
  filters,
  onChange,
  currencySymbol,
}: {
  filters: Parameters<typeof ActiveFilters>[0]["filters"];
  onChange: Parameters<typeof ActiveFilters>[0]["onChange"];
  currencySymbol: string;
}) {
  const dirty = isFiltersDirty(filters);
  if (!dirty) return null;
  return (
    <div className="flex flex-wrap items-center gap-1.5 border-t border-border/70 px-3 py-2">
      <ActiveFilters
        filters={filters}
        onChange={onChange}
        currencySymbol={currencySymbol}
      />
    </div>
  );
}
