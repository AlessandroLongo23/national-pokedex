import { describe, it, expect } from "vitest";
import { SET_POOLS } from "@/lib/data";
import type { SetRarityPool } from "@/lib/data/types";
import { slotsForSeries, type PackSlot } from "@/lib/packs/pack-structure";
import { simulateSet } from "@/lib/packs/simulator";
import {
  hasOpenablePack,
  speciesUniverse,
  pSetSpecies,
  expectedNewForSet,
  buildExpectedNewModel,
  getCandidateSets,
} from "@/scripts/sim/analytic";

function emptyPool(): SetRarityPool {
  return {
    Common: [],
    Uncommon: [],
    Rare: [],
    DoubleRare: [],
    UltraRare: [],
    IllustrationRare: [],
    SpecialIllustrationRare: [],
    HyperRare: [],
  };
}

describe("hasOpenablePack", () => {
  it("requires non-empty Common and Uncommon buckets", () => {
    const pool = emptyPool();
    expect(hasOpenablePack(pool)).toBe(false);
    pool.Common.push({ supertype: "Pokémon", dex: [1] });
    expect(hasOpenablePack(pool)).toBe(false);
    pool.Uncommon.push({ supertype: "Pokémon", dex: [2] });
    expect(hasOpenablePack(pool)).toBe(true);
  });
  it("is false for undefined", () => {
    expect(hasOpenablePack(undefined)).toBe(false);
  });
});

describe("speciesUniverse", () => {
  it("is the union of dex across all Pokémon cards in every bucket", () => {
    const pool = emptyPool();
    pool.Common.push({ supertype: "Pokémon", dex: [1] });
    pool.Common.push({ supertype: "Trainer", dex: [] });
    pool.Rare.push({ supertype: "Pokémon", dex: [25, 26] }); // multi-dex card
    pool.HyperRare.push({ supertype: "Pokémon", dex: [1] }); // duplicate species
    expect([...speciesUniverse(pool)].sort((a, b) => a - b)).toEqual([1, 25, 26]);
  });
});

describe("pSetSpecies", () => {
  it("returns a probability in [0,1]", () => {
    const pool = emptyPool();
    pool.Common.push({ supertype: "Pokémon", dex: [1] });
    pool.Common.push({ supertype: "Pokémon", dex: [2] });
    pool.Uncommon.push({ supertype: "Pokémon", dex: [3] });
    const slots: PackSlot[] = [{ kind: "uniform", from: "Common", count: 4 }];
    const p = pSetSpecies(pool, slots, 1);
    expect(p).toBeGreaterThan(0);
    expect(p).toBeLessThanOrEqual(1);
  });

  it("a single-card bucket drawn once gives probability 1", () => {
    const pool = emptyPool();
    pool.Common.push({ supertype: "Pokémon", dex: [7] });
    const slots: PackSlot[] = [{ kind: "uniform", from: "Common", count: 1 }];
    expect(pSetSpecies(pool, slots, 7)).toBeCloseTo(1, 10);
  });

  it("counts a non-Pokémon card in the denominator (a wasted draw)", () => {
    const pool = emptyPool();
    pool.Common.push({ supertype: "Pokémon", dex: [7] });
    pool.Common.push({ supertype: "Trainer", dex: [] });
    // Two equally-likely cards, only one is species 7, drawn once:
    const slots: PackSlot[] = [{ kind: "uniform", from: "Common", count: 1 }];
    expect(pSetSpecies(pool, slots, 7)).toBeCloseTo(0.5, 10);
  });

  it("routes weighted-slot mass to Rare when the chosen bucket is empty (the fallback)", () => {
    const pool = emptyPool();
    pool.Rare.push({ supertype: "Pokémon", dex: [9] }); // the only rare card
    // DoubleRare is empty, so its weight must fall back to Rare.
    const slots: PackSlot[] = [
      { kind: "weighted", weights: { Rare: 0.5, DoubleRare: 0.5 }, count: 1 },
    ];
    // Both halves of the weight resolve to the single Rare card → p = 1.
    expect(pSetSpecies(pool, slots, 9)).toBeCloseTo(1, 10);
  });

  it("a multi-dex card gives every species on it the same probability", () => {
    const pool = emptyPool();
    pool.Common.push({ supertype: "Pokémon", dex: [25, 26] });
    const slots: PackSlot[] = [{ kind: "uniform", from: "Common", count: 1 }];
    expect(pSetSpecies(pool, slots, 25)).toBeCloseTo(pSetSpecies(pool, slots, 26), 12);
  });
});

describe("expectedNewForSet", () => {
  it("subtracts owned species — owning everything gives 0 expected-new", () => {
    const pool = emptyPool();
    pool.Common.push({ supertype: "Pokémon", dex: [1] });
    pool.Uncommon.push({ supertype: "Pokémon", dex: [2] });
    const slots = slotsForSeries("Scarlet & Violet");
    const allOwned = new Set<number>([1, 2]);
    expect(expectedNewForSet(pool, slots, allOwned)).toBeCloseTo(0, 12);
  });
});

// THE CORRECTNESS GATE: the analytic expected-new must equal what the app's
// Monte-Carlo simulateSet estimates (it is deterministically seeded, so this is
// a fixed comparison). One representative set per era + sv4pt5 (fallback-heavy).
describe("analytic expectedNew matches simulateSet (empty collection)", () => {
  const cases: string[] = ["sv1", "me1", "swsh1", "sm1", "base1", "sv4pt5"];
  for (const setId of cases) {
    it(`${setId}: |analytic - MC(40k)| < 0.05`, () => {
      const pool = SET_POOLS[setId];
      expect(pool, `pool for ${setId} should exist`).toBeTruthy();
      // Series is needed for the slot layout; recover it from the candidate list.
      const set = getCandidateSets().find((s) => s.id === setId);
      expect(set, `${setId} should be an openable candidate set`).toBeTruthy();
      const slots = slotsForSeries(set!.series);
      const owned = new Set<number>();
      const analytic = expectedNewForSet(pool!, slots, owned);
      const mc = simulateSet(setId, pool!, slots, owned, 40000).expectedNew;
      expect(Math.abs(analytic - mc)).toBeLessThan(0.05);
    });
  }
});

describe("buildExpectedNewModel", () => {
  const model = buildExpectedNewModel(getCandidateSets(["Scarlet & Violet", "Mega Evolution"]));

  it("indexes a pSet map and a species→sets reverse index for every candidate", () => {
    expect(model.candidateSets.length).toBeGreaterThan(0);
    for (const set of model.candidateSets) {
      expect(model.pSetBySet.has(set.id)).toBe(true);
    }
    // Reverse index is consistent with the per-set species maps.
    for (const [setId, pmap] of model.pSetBySet) {
      for (const dex of pmap.keys()) {
        expect(model.speciesToSets.get(dex)).toContain(setId);
      }
    }
  });

  it("achievable ceiling = size of the union of pool-reachable species", () => {
    const union = new Set<number>();
    for (const pmap of model.pSetBySet.values()) {
      for (const dex of pmap.keys()) union.add(dex);
    }
    expect(model.achievableCeiling).toBe(union.size);
  });

  it("summing pSet over unowned species equals expectedNewForSet", () => {
    const set = model.candidateSets[0]!;
    const pmap = model.pSetBySet.get(set.id)!;
    const owned = new Set<number>([...pmap.keys()].slice(0, 3));
    let viaMap = 0;
    for (const [dex, p] of pmap) if (!owned.has(dex)) viaMap += p;
    const slots = slotsForSeries(set.series);
    const direct = expectedNewForSet(SET_POOLS[set.id]!, slots, owned);
    expect(viaMap).toBeCloseTo(direct, 9);
  });
});
