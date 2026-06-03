// Expected cost to COMPLETE the National Pokédex (collect every achievable
// species), under different buying strategies.
//
// Two cost levers: packs (€10 each) and singles (€0.50 each, = "5€ for 10"),
// where a species is single-buyable only if it appears in an allowed rarity
// bucket (e.g. Common/Uncommon, optionally Rare) in some set. The "alternating"
// strategy opens one pack then buys 10 targeted singles — the still-missing
// single-buyable species that are HARDEST to pull — repeating until complete.

import { SET_POOLS } from "@/lib/data";
import type { RarityBucket, SetInfo, SetRarityPool } from "@/lib/data/types";
import { simulatePack } from "@/lib/packs/simulator";
import type { ExpectedNewModel } from "./analytic";
import { simulatePackDetailed } from "./pulls";
import { createInitialState, type Picker } from "./strategies";
import type { SetEngine } from "./trial";

// Species that appear as a Pokémon card in any of the given rarity buckets,
// across the supplied pools — i.e. species you could buy as a single.
export function speciesBuyableFromPools(
  pools: SetRarityPool[],
  buckets: RarityBucket[],
): Set<number> {
  const out = new Set<number>();
  for (const pool of pools) {
    for (const b of buckets) {
      for (const card of pool[b]) {
        if (card.supertype !== "Pokémon") continue;
        for (const d of card.dex) out.add(d);
      }
    }
  }
  return out;
}

export function getBuyableSpecies(cands: SetInfo[], buckets: RarityBucket[]): Set<number> {
  return speciesBuyableFromPools(
    cands.map((s) => SET_POOLS[s.id]!),
    buckets,
  );
}

// For each species, the subset of `buckets` it is printed at (as a Pokémon card)
// somewhere in the supplied pools — i.e. the rarities at which you could acquire
// it as a single or by trading a same-rarity duplicate. Buckets are returned in
// the order they were requested (so Common < Uncommon < Rare).
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

// p_best(s): the highest per-pack appearance probability of species s across all
// candidate sets — the rate you'd get by always opening the single best set for it.
export function pBestBySpecies(model: ExpectedNewModel): Map<number, number> {
  const pBest = new Map<number, number>();
  for (const pmap of model.pSetBySet.values()) {
    for (const [dex, p] of pmap) pBest.set(dex, Math.max(pBest.get(dex) ?? 0, p));
  }
  return pBest;
}

// Buyable species ordered hardest-to-pull first (lowest p_best), restricted to
// species that are actually achievable (present in p_best).
export function buyableSortedByHardness(
  buyable: Set<number>,
  pBest: Map<number, number>,
): number[] {
  return [...buyable].filter((s) => pBest.has(s)).sort((a, b) => pBest.get(a)! - pBest.get(b)!);
}

export interface CompletionResult {
  packs: number;
  singles: number;
  completed: boolean;
}

export interface CompletionOpts {
  // Hardest-first list of single-buyable species. null/undefined → packs only.
  buyableSorted?: number[] | null;
  cap?: number;
}

export function runToCompletion(
  picker: Picker,
  model: ExpectedNewModel,
  engines: Map<string, SetEngine>,
  rng: () => number,
  opts: CompletionOpts = {},
): CompletionResult {
  const buyableSorted = opts.buyableSorted ?? null;
  const cap = opts.cap ?? 5_000_000;
  const target = model.achievableCeiling;
  const state = createInitialState(model);
  const candidates = model.candidateSets;

  const acquire = (dex: number): boolean => {
    if (state.owned.has(dex)) return false;
    state.owned.add(dex);
    for (const sid of model.speciesToSets.get(dex) ?? []) {
      const contrib = model.pSetBySet.get(sid)!.get(dex) ?? 0;
      state.expectedNewRemaining.set(sid, (state.expectedNewRemaining.get(sid) ?? 0) - contrib);
    }
    return true;
  };

  let packs = 0;
  let singles = 0;
  let cursor = 0;

  while (state.owned.size < target && packs < cap) {
    // One pack, chosen by the strategy.
    const set = picker(state, candidates, rng);
    const eng = engines.get(set.id)!;
    for (const d of simulatePack(eng.pool, eng.slots, rng)) acquire(d);
    state.packsBySet.set(set.id, (state.packsBySet.get(set.id) ?? 0) + 1);
    packs++;

    // Then ten targeted singles (hardest-to-pull, still-missing, buyable).
    if (buyableSorted) {
      let bought = 0;
      while (bought < 10 && cursor < buyableSorted.length) {
        const dex = buyableSorted[cursor++]!;
        if (acquire(dex)) {
          singles++;
          bought++;
        }
      }
    }
  }

  return { packs, singles, completed: state.owned.size >= target };
}

// Rarities a duplicate can be traded at. A species reachable as Common/Uncommon/
// Rare somewhere is exactly the C/U/R-buyable universe (all 1025 in practice),
// so spares at higher tiers can never fill a still-needed slot and are ignored.
const TRADE_BUCKETS: RarityBucket[] = ["Common", "Uncommon", "Rare"];

export interface WeeklyOpts {
  // Distinct species you must own to be "done".
  target: number;
  // Hardest-to-pull-first species you can acquire from the single-channel
  // (buyable as a single, catalogue-wide). Used to order purchases.
  buyOrder: number[];
  // species → the C/U/R buckets it is printed at, catalogue-wide. Gates trades.
  obtainable: Map<number, RarityBucket[]>;
  // false → never trade (pure buy baseline); true → trade matching dupes first.
  trade: boolean;
  // Single-channel acquisitions per week (trades + buys). Default 10.
  singlesPerWeek?: number;
  // Optional hardness map; trade candidates are ordered most-constrained then
  // hardest within each bucket, so scarce Rare dupes go to Rare-only species.
  pBest?: Map<number, number>;
  weekCap?: number;
}

export interface WeeklyResult {
  weeks: number; // one pack per week, so weeks === packs
  packs: number;
  trades: number; // single-channel slots filled by trading a duplicate (free)
  buys: number; // single-channel slots filled by buying (€)
  singlesChannel: number; // trades + buys
  packNew: number; // distinct species first obtained from a pack
  completed: boolean;
}

// Simulate the weekly routine: each week open ONE pack (chosen by `picker`), then
// fill up to `singlesPerWeek` single-channel slots — trading same-rarity spares
// first (free), then buying the hardest still-missing species — until the dex is
// complete. Packs come from the picker's universe; trades and buys are catalogue-
// wide via `obtainable` / `buyOrder`.
export function runWeeklyPlan(
  picker: Picker,
  model: ExpectedNewModel,
  engines: Map<string, SetEngine>,
  rng: () => number,
  opts: WeeklyOpts,
): WeeklyResult {
  const perWeek = opts.singlesPerWeek ?? 10;
  const weekCap = opts.weekCap ?? 1_000_000;
  const { target, buyOrder, obtainable, trade, pBest } = opts;
  const state = createInitialState(model);
  const candidates = model.candidateSets;

  const acquire = (dex: number): boolean => {
    if (state.owned.has(dex)) return false;
    state.owned.add(dex);
    for (const sid of model.speciesToSets.get(dex) ?? []) {
      const contrib = model.pSetBySet.get(sid)!.get(dex) ?? 0;
      state.expectedNewRemaining.set(sid, (state.expectedNewRemaining.get(sid) ?? 0) - contrib);
    }
    return true;
  };

  // Per-bucket trade-candidate lists: species obtainable at that bucket, ordered
  // most-constrained-first (fewest obtainable buckets) then hardest, so a Rare
  // spare is spent on a Rare-only species before a species you could also trade
  // a Common for.
  const cand: Record<string, number[]> = { Common: [], Uncommon: [], Rare: [] };
  for (const s of buyOrder) {
    for (const b of obtainable.get(s) ?? []) if (b in cand) cand[b]!.push(s);
  }
  for (const b of TRADE_BUCKETS) {
    cand[b]!.sort((a, c) => {
      const la = (obtainable.get(a) ?? []).length;
      const lc = (obtainable.get(c) ?? []).length;
      if (la !== lc) return la - lc;
      return (pBest?.get(a) ?? 0) - (pBest?.get(c) ?? 0);
    });
  }
  const cursor: Record<string, number> = { Common: 0, Uncommon: 0, Rare: 0 };
  const nextCand = (b: RarityBucket): number | null => {
    const list = cand[b]!;
    let i = cursor[b]!;
    while (i < list.length && state.owned.has(list[i]!)) i++;
    cursor[b] = i;
    if (i >= list.length) return null;
    cursor[b] = i + 1;
    return list[i]!;
  };

  const dup: Record<string, number> = { Common: 0, Uncommon: 0, Rare: 0 };
  let buyCursor = 0;
  let packs = 0;
  let trades = 0;
  let buys = 0;
  let packNew = 0;

  while (state.owned.size < target && packs < weekCap) {
    let acquiredThisWeek = 0;

    // One pack from the strategy's universe; record dupes by rarity.
    const set = picker(state, candidates, rng);
    const eng = engines.get(set.id)!;
    for (const card of simulatePackDetailed(eng.pool, eng.slots, rng)) {
      if (card.supertype !== "Pokémon") continue;
      let gotNew = false;
      for (const d of card.dex) if (acquire(d)) (packNew++, (gotNew = true), acquiredThisWeek++);
      if (!gotNew && trade && card.bucket in dup) dup[card.bucket]!++;
    }
    state.packsBySet.set(set.id, (state.packsBySet.get(set.id) ?? 0) + 1);
    packs++;

    let slots = perWeek;
    // Trade first: spend scarce dupes (Rare → Uncommon → Common) on matching
    // still-missing species.
    if (trade) {
      for (const b of ["Rare", "Uncommon", "Common"] as RarityBucket[]) {
        while (dup[b]! > 0 && slots > 0) {
          const y = nextCand(b);
          if (y === null) break;
          acquire(y);
          dup[b]!--;
          trades++;
          slots--;
          acquiredThisWeek++;
        }
      }
    }
    // Then buy the hardest still-missing species for the remaining slots.
    while (slots > 0) {
      while (buyCursor < buyOrder.length && state.owned.has(buyOrder[buyCursor]!)) buyCursor++;
      if (buyCursor >= buyOrder.length) break;
      acquire(buyOrder[buyCursor++]!);
      buys++;
      slots--;
      acquiredThisWeek++;
    }

    if (acquiredThisWeek === 0) break; // no reachable progress — avoid spinning
  }

  return {
    weeks: packs,
    packs,
    trades,
    buys,
    singlesChannel: trades + buys,
    packNew,
    completed: state.owned.size >= target,
  };
}
