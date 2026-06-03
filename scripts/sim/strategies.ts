// The three pack-buying strategies under test, plus the mutable per-trial state
// they read. A picker is a pure function of (state, candidates, rng) → chosen
// set; trial.ts owns the state and updates it after each realized pack.

import type { SetInfo } from "@/lib/data/types";
import type { ExpectedNewModel } from "./analytic";

export interface SimState {
  // Distinct National Dex numbers collected so far.
  owned: Set<number>;
  // setId → number of packs opened of that set.
  packsBySet: Map<string, number>;
  // setId → Σ pSet(species) over species still unowned. Maintained incrementally
  // by trial.ts: when a species is first acquired, its pSet is subtracted from
  // every set that can yield it.
  expectedNewRemaining: Map<string, number>;
}

export type Picker = (state: SimState, candidates: SetInfo[], rng: () => number) => SetInfo;

function pickUniform<T>(items: T[], rng: () => number): T {
  return items[Math.floor(rng() * items.length)]!;
}

function unownedCount(set: SetInfo, owned: Set<number>): number {
  let n = 0;
  for (const d of set.dexNumbers) if (!owned.has(d)) n++;
  return n;
}

// (A) Always open the set with the highest expected number of NEW species per
// pack. Tie-breaks mirror lib/packs/rank.ts: expectedNew desc → unownedInSet
// desc → releaseDate desc, then a random pick among any exact ties.
export const bestPack: Picker = (state, candidates, rng) => {
  const EPS = 1e-9;
  let max = -Infinity;
  for (const s of candidates) {
    const r = state.expectedNewRemaining.get(s.id) ?? 0;
    if (r > max) max = r;
  }
  let top = candidates.filter((s) => (state.expectedNewRemaining.get(s.id) ?? 0) >= max - EPS);
  if (top.length === 1) return top[0]!;

  let maxU = -Infinity;
  for (const s of top) maxU = Math.max(maxU, unownedCount(s, state.owned));
  top = top.filter((s) => unownedCount(s, state.owned) === maxU);
  if (top.length === 1) return top[0]!;

  let maxDate = "";
  for (const s of top) if (s.releaseDate > maxDate) maxDate = s.releaseDate;
  top = top.filter((s) => s.releaseDate === maxDate);
  if (top.length === 1) return top[0]!;

  return pickUniform(top, rng);
};

// (B) Open a pack from a uniformly random set.
export const uniform: Picker = (_state, candidates, rng) => pickUniform(candidates, rng);

// (C) Open a pack from the set you've opened the FEWEST packs of so far; ties
// broken at random. A balanced round-robin that ignores collection value.
export const leastOpened: Picker = (state, candidates, rng) => {
  let min = Infinity;
  for (const s of candidates) min = Math.min(min, state.packsBySet.get(s.id) ?? 0);
  const tied = candidates.filter((s) => (state.packsBySet.get(s.id) ?? 0) === min);
  return pickUniform(tied, rng);
};

export function createInitialState(model: ExpectedNewModel): SimState {
  const packsBySet = new Map<string, number>();
  const expectedNewRemaining = new Map<string, number>();
  for (const set of model.candidateSets) {
    packsBySet.set(set.id, 0);
    let sum = 0;
    const pmap = model.pSetBySet.get(set.id)!;
    for (const p of pmap.values()) sum += p;
    expectedNewRemaining.set(set.id, sum);
  }
  return { owned: new Set<number>(), packsBySet, expectedNewRemaining };
}
