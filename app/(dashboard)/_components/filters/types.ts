import type { Generation, Rarity, Supertype } from "@/lib/data/types";
import type {
  PriceBucket,
  RegionalForm,
} from "../../_lib/card-filters";

export type SupertypeFilter = "all" | Supertype;

export interface CardsFilterState {
  search: string;
  supertype: SupertypeFilter;
  setIds: Set<string>;
  rarities: Set<Rarity>;
  types: Set<string>;
  artist: string | null;
  dexFrom: number | null;
  dexTo: number | null;
  priceBuckets: Set<PriceBucket>;
  generations: Set<Generation>;
  regionalForms: Set<RegionalForm>;
  // Show only favorited cards. Applied against the user's favorites set by the
  // page (not derivable from a CardEntry), so the filter helpers below treat it
  // like any other dimension for dirty/active counting.
  favoritesOnly: boolean;
}

export interface CardFiltersFeatures {
  showPrice?: boolean;
  showGeneration?: boolean;
  showRegionalForm?: boolean;
  showFavorites?: boolean;
}

export function emptyFilters(): CardsFilterState {
  return {
    search: "",
    supertype: "all",
    setIds: new Set(),
    rarities: new Set(),
    types: new Set(),
    artist: null,
    dexFrom: null,
    dexTo: null,
    priceBuckets: new Set(),
    generations: new Set(),
    regionalForms: new Set(),
    favoritesOnly: false,
  };
}

export function isFiltersDirty(f: CardsFilterState): boolean {
  return (
    f.search.length > 0 ||
    f.supertype !== "all" ||
    f.setIds.size > 0 ||
    f.rarities.size > 0 ||
    f.types.size > 0 ||
    f.artist !== null ||
    f.dexFrom !== null ||
    f.dexTo !== null ||
    f.priceBuckets.size > 0 ||
    f.generations.size > 0 ||
    f.regionalForms.size > 0 ||
    f.favoritesOnly
  );
}

export function countActiveFilters(f: CardsFilterState): number {
  // Excludes search + supertype (always visible) — count only the "advanced"
  // dimensions that live behind the Filters sheet.
  return (
    f.setIds.size +
    f.rarities.size +
    f.types.size +
    (f.artist ? 1 : 0) +
    (f.dexFrom !== null || f.dexTo !== null ? 1 : 0) +
    f.priceBuckets.size +
    f.generations.size +
    f.regionalForms.size +
    (f.favoritesOnly ? 1 : 0)
  );
}
