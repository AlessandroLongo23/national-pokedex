// Analytic "expected new species per pack" model.
//
// This mirrors lib/packs/simulator.ts `simulatePack` EXACTLY, but computes the
// expectation in closed form instead of by Monte Carlo. Because draws are
// independent across slots and across the `count` repetitions within a slot
// (effectively with replacement), the probability a species never appears is
// the product over slots of (1 - p_slot)^count. By linearity of expectation,
// the expected number of distinct NEW species per pack is the sum of each
// unowned species' appearance probability — exact, and independent of `owned`.
//
// Validated against simulateSet(40k) in tests/unit/sim-analytic.test.ts.

import { SETS, SET_POOLS } from "@/lib/data";
import type { RarityBucket, RarityPoolCard, SetInfo, SetRarityPool } from "@/lib/data/types";
import type { PackSlot } from "@/lib/packs/pack-structure";
import { slotsForSeries } from "@/lib/packs/pack-structure";

// Mirror of rank.ts: promo/energy box sets have empty C/U pools and don't
// follow the standard booster layout, so they aren't openable.
export function hasOpenablePack(pool: SetRarityPool | undefined): boolean {
  if (!pool) return false;
  return pool.Common.length > 0 && pool.Uncommon.length > 0;
}

// Candidate sets = openable sets, optionally restricted to a list of series.
export function getCandidateSets(seriesFilter?: string[]): SetInfo[] {
  const allowed = seriesFilter ? new Set(seriesFilter) : null;
  return SETS.filter((s) => {
    if (allowed && !allowed.has(s.series)) return false;
    return hasOpenablePack(SET_POOLS[s.id]);
  });
}

// Pool-reachable species: the union of dex over Pokémon cards in every bucket.
// This is the set of species you can actually pull from packs — distinct from
// set.dexNumbers, which also lists secret/special cards outside the C/U/R pools.
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

// Count Pokémon cards in a bucket whose dex array includes `species`. The
// denominator is always the FULL bucket length (incl. Trainer/Energy), because
// simulatePack draws uniformly over the whole bucket then skips non-Pokémon —
// a non-Pokémon draw is a wasted slot whose probability mass must remain.
function countWithSpecies(cards: RarityPoolCard[], species: number): number {
  let n = 0;
  for (const card of cards) {
    if (card.supertype !== "Pokémon") continue;
    if (card.dex.includes(species)) n++;
  }
  return n;
}

function qBucket(pool: SetRarityPool, bucket: RarityBucket, species: number): number {
  const cards = pool[bucket];
  if (cards.length === 0) {
    // Fallback to plain Rare, matching simulatePack lines 83-85.
    const rare = pool.Rare;
    if (rare.length === 0) return 0;
    return countWithSpecies(rare, species) / rare.length;
  }
  return countWithSpecies(cards, species) / cards.length;
}

// Probability a single draw from one slot yields `species`.
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
  if (denom === 0) return 0;
  return num / denom;
}

// Probability `species` appears at least once in one pack of this set.
export function pSetSpecies(pool: SetRarityPool, slots: PackSlot[], species: number): number {
  let pNever = 1;
  for (const slot of slots) {
    const pDraw = pSlotDraw(pool, slot, species);
    pNever *= Math.pow(1 - pDraw, slot.count);
  }
  return 1 - pNever;
}

// Expected number of distinct NEW species from one pack, given current `owned`.
export function expectedNewForSet(
  pool: SetRarityPool,
  slots: PackSlot[],
  owned: Set<number>,
): number {
  let sum = 0;
  for (const species of speciesUniverse(pool)) {
    if (owned.has(species)) continue;
    sum += pSetSpecies(pool, slots, species);
  }
  return sum;
}

export interface ExpectedNewModel {
  candidateSets: SetInfo[];
  // setId -> (species -> P(appears in one pack)). Independent of ownership.
  pSetBySet: Map<string, Map<number, number>>;
  // species -> the candidate setIds whose pool can yield it.
  speciesToSets: Map<number, string[]>;
  // |union of pool-reachable species| — the true asymptote of every strategy.
  achievableCeiling: number;
  // |union of set.dexNumbers| — the catalog's listed coverage (>= achievable).
  catalogCeiling: number;
}

export function buildExpectedNewModel(candidateSets: SetInfo[]): ExpectedNewModel {
  const pSetBySet = new Map<string, Map<number, number>>();
  const speciesToSets = new Map<number, string[]>();
  const achievable = new Set<number>();
  const catalog = new Set<number>();

  for (const set of candidateSets) {
    const pool = SET_POOLS[set.id]!;
    const slots = slotsForSeries(set.series);
    const pmap = new Map<number, number>();
    for (const species of speciesUniverse(pool)) {
      pmap.set(species, pSetSpecies(pool, slots, species));
      achievable.add(species);
      const arr = speciesToSets.get(species);
      if (arr) arr.push(set.id);
      else speciesToSets.set(species, [set.id]);
    }
    pSetBySet.set(set.id, pmap);
    for (const d of set.dexNumbers) catalog.add(d);
  }

  return {
    candidateSets,
    pSetBySet,
    speciesToSets,
    achievableCeiling: achievable.size,
    catalogCeiling: catalog.size,
  };
}
