// "Buy these as singles" ranking — the complement of rank.ts's "best pack".
//
// Some missing species are so unlikely to drop from the packs you'd actually
// open that you're better off buying them as cheap singles. This module ranks
// the still-missing species by how HARD they are to pull (lowest per-pack
// appearance probability across your candidate sets) and points at the cheapest
// place to buy each one.
//
// The per-species probability math is the closed form from scripts/sim/
// analytic.ts (validated there against the Monte-Carlo simulator), ported here
// because the app cannot import from scripts/. It mirrors lib/packs/simulator.ts
// exactly, including the empty-bucket → Rare fallback.

import { POKEDEX, SETS, SET_POOLS } from "@/lib/data";
import type {
  Generation,
  RarityBucket,
  RarityPoolCard,
  SetRarityPool,
} from "@/lib/data/types";
import { genOf } from "@/lib/data/types";
import { slotsForSeries, type PackSlot } from "./pack-structure";

// ── Per-species appearance probability (closed form) ────────────────────────

// Promo / energy-box sets have empty C/U pools and don't follow the standard
// booster layout — they aren't "openable" and are excluded from pull-hardness.
export function hasOpenablePack(pool: SetRarityPool | undefined): boolean {
  if (!pool) return false;
  return pool.Common.length > 0 && pool.Uncommon.length > 0;
}

// Species (by dex) reachable from a pool — union of dex over its Pokémon cards.
export function speciesUniverse(pool: SetRarityPool): Set<number> {
  const out = new Set<number>();
  for (const bucket of Object.values(pool)) {
    for (const card of bucket) {
      if (card.supertype !== "Pokémon") continue;
      for (const d of card.dex) out.add(d);
    }
  }
  return out;
}

function countWithSpecies(cards: RarityPoolCard[], species: number): number {
  let n = 0;
  for (const card of cards) {
    if (card.supertype !== "Pokémon") continue;
    if (card.dex.includes(species)) n++;
  }
  return n;
}

// Probability a single draw from `bucket` yields `species`. The denominator is
// the full bucket length (incl. Trainer/Energy). Empty buckets fall back to
// plain Rare, matching simulatePack (lib/packs/simulator.ts lines 83-85).
function qBucket(pool: SetRarityPool, bucket: RarityBucket, species: number): number {
  const cards = pool[bucket];
  if (cards.length === 0) {
    const rare = pool.Rare;
    if (rare.length === 0) return 0;
    return countWithSpecies(rare, species) / rare.length;
  }
  return countWithSpecies(cards, species) / cards.length;
}

function pSlotDraw(pool: SetRarityPool, slot: PackSlot, species: number): number {
  if (slot.kind === "uniform") {
    return qBucket(pool, slot.from, species);
  }
  if (slot.kind === "weighted") {
    let total = 0;
    for (const w of Object.values(slot.weights)) total += w ?? 0;
    if (total === 0) return 0;
    let p = 0;
    for (const [bucket, w] of Object.entries(slot.weights)) {
      const weight = w ?? 0;
      if (weight === 0) continue;
      p += (weight / total) * qBucket(pool, bucket as RarityBucket, species);
    }
    return p;
  }
  // reverse: flatten the eligible buckets and pick uniformly across all of them.
  let denom = 0;
  let num = 0;
  for (const bucket of slot.pool) {
    const cards = pool[bucket];
    denom += cards.length;
    num += countWithSpecies(cards, species);
  }
  return denom === 0 ? 0 : num / denom;
}

// Probability `species` appears at least once in one pack of this set.
export function pSetSpecies(pool: SetRarityPool, slots: PackSlot[], species: number): number {
  let pNever = 1;
  for (const slot of slots) {
    pNever *= Math.pow(1 - pSlotDraw(pool, slot, species), slot.count);
  }
  return 1 - pNever;
}

// For each species, the subset of `buckets` it is printed at (as a Pokémon
// card) across the supplied pools, in the order the buckets were requested.
export function obtainableBucketsFromPools(
  pools: SetRarityPool[],
  buckets: RarityBucket[],
): Map<number, RarityBucket[]> {
  const sets = new Map<number, Set<RarityBucket>>();
  for (const pool of pools) {
    for (const b of buckets) {
      for (const card of pool[b]) {
        if (card.supertype !== "Pokémon") continue;
        for (const d of card.dex) {
          let s = sets.get(d);
          if (!s) sets.set(d, (s = new Set()));
          s.add(b);
        }
      }
    }
  }
  const out = new Map<number, RarityBucket[]>();
  for (const [dex, has] of sets) out.set(dex, buckets.filter((b) => has.has(b)));
  return out;
}

// ── Ranking ─────────────────────────────────────────────────────────────────

export interface CheapestPrinting {
  rarity: RarityBucket;
  setId: string;
  setName: string;
}

export interface RankedSingle {
  dex: number;
  name: string;
  gen: Generation;
  // Highest P(appears in one pack) over the candidate (filtered) sets; 0 if the
  // species isn't reachable from any of them.
  pBest: number;
  cheapestRarity: RarityBucket;
  cheapestSetId: string;
  cheapestSetName: string;
}

export interface SinglesOptions {
  // Restrict the candidate sets used to judge pull-hardness (same prop as
  // rankSets). Omit to consider every openable set.
  filter?: Set<string>;
  limit?: number;
}

// A single is buyable at Common/Uncommon/Rare; the cheapest printing is the
// lowest of those tiers it appears at, anywhere in the catalogue.
const CATALOGUE_BUCKETS: RarityBucket[] = ["Common", "Uncommon", "Rare"];

const POKEDEX_BY_DEX: Map<number, { name: string; gen: Generation }> = new Map(
  POKEDEX.map((p) => [p.dex, { name: p.name, gen: p.gen }]),
);

function safeGen(dex: number): Generation {
  return dex >= 1 && dex <= 1025 ? genOf(dex) : 9;
}

// dex → cheapest C/U/R printing across ALL sets. Owned- and filter-independent,
// so it's built once. Buckets are the OUTER loop so the lowest rarity tier always
// wins (that's the cheapness signal); within a tier we walk sets NEWEST-first so
// the chosen printing is the easiest to actually source today, not an antique.
let catalogueTable: Map<number, CheapestPrinting> | null = null;

function getCatalogueTable(): Map<number, CheapestPrinting> {
  if (catalogueTable) return catalogueTable;
  const table = new Map<number, CheapestPrinting>();
  const newestFirst = [...SETS].sort((a, b) => b.releaseDate.localeCompare(a.releaseDate));
  for (const bucket of CATALOGUE_BUCKETS) {
    for (const set of newestFirst) {
      const pool = SET_POOLS[set.id];
      if (!pool) continue;
      for (const card of pool[bucket]) {
        if (card.supertype !== "Pokémon") continue;
        for (const d of card.dex) {
          if (!table.has(d)) table.set(d, { rarity: bucket, setId: set.id, setName: set.name });
        }
      }
    }
  }
  catalogueTable = table;
  return table;
}

function filterKey(filter: Set<string> | undefined): string {
  if (!filter) return "*";
  return [...filter].sort().join(",");
}

// dex → max P(appears in one pack) over the candidate sets. Depends only on the
// filter, not on what's owned, so a single-entry cache keyed by filterKey is
// enough (the page's toggle flips between two filter values).
let pBestCacheKey = "";
let pBestCache: Map<number, number> = new Map();

function getPBest(filter: Set<string> | undefined): Map<number, number> {
  const key = filterKey(filter);
  if (key === pBestCacheKey && pBestCache.size) return pBestCache;
  const pBest = new Map<number, number>();
  for (const set of SETS) {
    if (filter && !filter.has(set.id)) continue;
    const pool = SET_POOLS[set.id];
    if (!pool || !hasOpenablePack(pool)) continue;
    const slots = slotsForSeries(set.series);
    for (const species of speciesUniverse(pool)) {
      const p = pSetSpecies(pool, slots, species);
      const prev = pBest.get(species);
      if (prev === undefined || p > prev) pBest.set(species, p);
    }
  }
  pBestCacheKey = key;
  pBestCache = pBest;
  return pBest;
}

// Pure ranker over injected tables — missing, single-buyable species ordered
// hardest-first (lowest pBest, unreachable p=0 at the top).
export function rankBuyable(
  owned: Set<number>,
  pBest: Map<number, number>,
  catalogue: Map<number, CheapestPrinting>,
  limit: number,
): RankedSingle[] {
  const rows: RankedSingle[] = [];
  for (const [dex, printing] of catalogue) {
    if (owned.has(dex)) continue;
    const entry = POKEDEX_BY_DEX.get(dex);
    rows.push({
      dex,
      name: entry?.name ?? `#${dex}`,
      gen: entry?.gen ?? safeGen(dex),
      pBest: pBest.get(dex) ?? 0,
      cheapestRarity: printing.rarity,
      cheapestSetId: printing.setId,
      cheapestSetName: printing.setName,
    });
  }
  rows.sort((a, b) => (a.pBest !== b.pBest ? a.pBest - b.pBest : a.dex - b.dex));
  return rows.slice(0, limit);
}

// Top single-buyable missing species, hardest-to-pull first.
export function rankSinglesToBuy(owned: Set<number>, opts: SinglesOptions = {}): RankedSingle[] {
  return rankBuyable(owned, getPBest(opts.filter), getCatalogueTable(), opts.limit ?? 10);
}

// Turn a per-pack probability into "≈1 in N packs"; null when unreachable.
export function oneInNPacks(p: number): number | null {
  return p > 0 ? 1 / p : null;
}
