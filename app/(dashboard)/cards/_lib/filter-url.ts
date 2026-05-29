import {
  RARITY_ORDER,
  type Generation,
  type Rarity,
  type Supertype,
} from "@/lib/data/types";
import type { CardSort } from "../../_lib/card-sort";
import {
  GENERATIONS,
  PRICE_BUCKETS,
  REGIONAL_FORMS,
  type PriceBucket,
  type RegionalForm,
} from "../../_lib/card-filters";
import {
  emptyFilters,
  type CardsFilterState,
  type SupertypeFilter,
} from "../../_components/CardFiltersToolbar";

type ParamsLike = {
  get(name: string): string | null;
};

const SUPERTYPE_BY_TOKEN: Record<string, Supertype> = {
  pokemon: "Pokémon",
  trainer: "Trainer",
  energy: "Energy",
};

const TOKEN_BY_SUPERTYPE: Record<Supertype, string> = {
  "Pokémon": "pokemon",
  Trainer: "trainer",
  Energy: "energy",
};

const RARITY_SET: ReadonlySet<Rarity> = new Set(RARITY_ORDER);
const PRICE_BUCKET_SET: ReadonlySet<PriceBucket> = new Set(PRICE_BUCKETS);
const REGIONAL_FORM_SET: ReadonlySet<RegionalForm> = new Set(REGIONAL_FORMS);
const GENERATION_SET: ReadonlySet<Generation> = new Set(GENERATIONS);
const SORT_VALUES: ReadonlySet<CardSort> = new Set([
  "number",
  "rarity",
  "pokemon",
  "set",
]);

function splitCsv(raw: string | null): string[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

function parseIntOrNull(raw: string | null, min: number, max: number): number | null {
  if (raw === null || raw.trim() === "") return null;
  const n = parseInt(raw, 10);
  if (!Number.isFinite(n)) return null;
  return Math.max(min, Math.min(max, n));
}

function parseStringSet(raw: string | null): Set<string> {
  return new Set(splitCsv(raw));
}

function parseAllowedSet<T extends string>(
  raw: string | null,
  allowed: ReadonlySet<T>,
): Set<T> {
  const out = new Set<T>();
  for (const tok of splitCsv(raw)) {
    if ((allowed as ReadonlySet<string>).has(tok)) out.add(tok as T);
  }
  return out;
}

function parseGenerationSet(raw: string | null): Set<Generation> {
  const out = new Set<Generation>();
  for (const tok of splitCsv(raw)) {
    const n = parseInt(tok, 10);
    if (Number.isFinite(n) && GENERATION_SET.has(n as Generation)) {
      out.add(n as Generation);
    }
  }
  return out;
}

function parseSupertype(raw: string | null): SupertypeFilter {
  if (!raw) return "all";
  const key = raw.toLowerCase();
  return SUPERTYPE_BY_TOKEN[key] ?? "all";
}

function parseSort(raw: string | null): CardSort {
  if (raw && SORT_VALUES.has(raw as CardSort)) return raw as CardSort;
  return "number";
}

function joinSorted(values: Iterable<string>): string {
  return [...values].sort().join(",");
}

function joinSortedNumbers(values: Iterable<number>): string {
  return [...values]
    .sort((a, b) => a - b)
    .map((n) => String(n))
    .join(",");
}

export function parseFiltersFromSearchParams(sp: ParamsLike): {
  filters: CardsFilterState;
  sort: CardSort;
} {
  const filters: CardsFilterState = {
    ...emptyFilters(),
    search: sp.get("q") ?? "",
    supertype: parseSupertype(sp.get("supertype")),
    setIds: parseStringSet(sp.get("sets")),
    rarities: parseAllowedSet(sp.get("rarities"), RARITY_SET),
    types: parseStringSet(sp.get("types")),
    artist: sp.get("artist"),
    dexFrom: parseIntOrNull(sp.get("dexFrom"), 1, 1025),
    dexTo: parseIntOrNull(sp.get("dexTo"), 1, 1025),
    priceBuckets: parseAllowedSet(sp.get("priceBuckets"), PRICE_BUCKET_SET),
    generations: parseGenerationSet(sp.get("generations")),
    regionalForms: parseAllowedSet(sp.get("regionalForms"), REGIONAL_FORM_SET),
  };
  return { filters, sort: parseSort(sp.get("sort")) };
}

export function serializeFiltersToSearchParams(
  filters: CardsFilterState,
  sort: CardSort = "number",
): URLSearchParams {
  const params = new URLSearchParams();
  if (filters.search.trim()) params.set("q", filters.search.trim());
  if (filters.supertype !== "all") {
    params.set("supertype", TOKEN_BY_SUPERTYPE[filters.supertype]);
  }
  if (filters.setIds.size > 0) params.set("sets", joinSorted(filters.setIds));
  if (filters.rarities.size > 0) params.set("rarities", joinSorted(filters.rarities));
  if (filters.types.size > 0) params.set("types", joinSorted(filters.types));
  if (filters.artist) params.set("artist", filters.artist);
  if (filters.dexFrom !== null) params.set("dexFrom", String(filters.dexFrom));
  if (filters.dexTo !== null) params.set("dexTo", String(filters.dexTo));
  if (filters.priceBuckets.size > 0) {
    params.set("priceBuckets", joinSorted(filters.priceBuckets));
  }
  if (filters.generations.size > 0) {
    params.set("generations", joinSortedNumbers(filters.generations));
  }
  if (filters.regionalForms.size > 0) {
    params.set("regionalForms", joinSorted(filters.regionalForms));
  }
  if (sort !== "number") params.set("sort", sort);
  return params;
}

export function buildCardsHref(
  partial: Partial<CardsFilterState> & { sort?: CardSort } = {},
): string {
  const { sort, ...filterPatch } = partial;
  const filters: CardsFilterState = { ...emptyFilters(), ...filterPatch };
  const qs = serializeFiltersToSearchParams(filters, sort ?? "number").toString();
  return qs ? `/cards?${qs}` : "/cards";
}
