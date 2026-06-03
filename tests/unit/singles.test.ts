import { describe, it, expect } from "vitest";
import type { PackSlot } from "@/lib/packs/pack-structure";
import { slotsForSeries } from "@/lib/packs/pack-structure";
import type { RarityBucket, SetRarityPool } from "@/lib/data/types";
import {
  pSetSpecies,
  obtainableBucketsFromPools,
  rankBuyable,
  oneInNPacks,
  type CheapestPrinting,
} from "@/lib/packs/singles";

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

describe("pSetSpecies", () => {
  it("matches the closed-form appearance probability for a Scarlet & Violet pack", () => {
    // Common has two species (#1, #2); the rare line only has #3.
    const pool = emptyPool();
    pool.Common = [
      { supertype: "Pokémon", dex: [1] },
      { supertype: "Pokémon", dex: [2] },
    ];
    pool.Uncommon = [{ supertype: "Pokémon", dex: [3] }];
    pool.Rare = [{ supertype: "Pokémon", dex: [3] }];
    const slots = slotsForSeries("Scarlet & Violet"); // 4×Common, 3×Uncommon, 1×rare, 2×reverse

    // #1 only escapes via the 4 Common slots (q=1/2) and the 2 reverse slots
    // (q=1/4 over the flattened C+U+R = 4 cards). The Uncommon and weighted
    // rare slots can never yield it.
    // pSet = 1 − (1/2)^4 · (3/4)^2 = 1 − 9/256.
    expect(pSetSpecies(pool, slots, 1)).toBeCloseTo(1 - 9 / 256, 10);
  });

  it("routes empty weighted-slot buckets to Rare (the simulator's fallback)", () => {
    const pool = emptyPool();
    pool.Common = [{ supertype: "Pokémon", dex: [1] }];
    pool.Uncommon = [{ supertype: "Pokémon", dex: [2] }];
    pool.Rare = [{ supertype: "Pokémon", dex: [3] }];
    // DoubleRare is empty; with the fallback its weight mass routes to Rare,
    // so #3 is pulled with probability 1. Without the fallback it would be 0.5.
    const slots: PackSlot[] = [
      { kind: "weighted", weights: { Rare: 0.5, DoubleRare: 0.5 }, count: 1 },
    ];
    expect(pSetSpecies(pool, slots, 3)).toBeCloseTo(1, 10);
    // A species printed nowhere stays at 0 even through the fallback.
    expect(pSetSpecies(pool, slots, 99)).toBe(0);
  });
});

describe("obtainableBucketsFromPools", () => {
  it("maps each species to the C/U/R buckets it is printed at (input order)", () => {
    const pool = emptyPool();
    pool.Common = [
      { supertype: "Pokémon", dex: [1] },
      { supertype: "Trainer", dex: [] },
    ];
    pool.Uncommon = [
      { supertype: "Pokémon", dex: [1] },
      { supertype: "Pokémon", dex: [2] },
    ];
    pool.Rare = [{ supertype: "Pokémon", dex: [3] }];
    pool.DoubleRare = [{ supertype: "Pokémon", dex: [4] }];
    const m = obtainableBucketsFromPools([pool], ["Common", "Uncommon", "Rare"]);
    expect(m.get(1)).toEqual(["Common", "Uncommon"]);
    expect(m.get(2)).toEqual(["Uncommon"]);
    expect(m.get(3)).toEqual(["Rare"]);
    expect(m.has(4)).toBe(false); // DoubleRare not requested
  });
});

describe("rankBuyable", () => {
  const printing = (): CheapestPrinting => ({
    rarity: "Common",
    setId: "x",
    setName: "X",
  });
  const catalogue = new Map<number, CheapestPrinting>([
    [1, printing()],
    [2, printing()],
    [3, printing()],
    [4, printing()],
    [5, printing()],
  ]);

  it("orders missing species hardest-first, with unreachable (p=0) at the top", () => {
    const pBest = new Map<number, number>([
      [1, 0.5],
      [2, 0.1],
      [4, 0.3],
      [5, 0.2],
      // #3 absent → treated as 0 (unreachable from candidate packs)
    ]);
    const owned = new Set<number>([5]); // already collected → dropped
    const rows = rankBuyable(owned, pBest, catalogue, 10);
    expect(rows.map((r) => r.dex)).toEqual([3, 2, 4, 1]);
    expect(rows.find((r) => r.dex === 3)!.pBest).toBe(0);
    expect(rows.every((r) => r.cheapestRarity === "Common")).toBe(true);
  });

  it("respects the limit", () => {
    const pBest = new Map<number, number>([
      [1, 0.5],
      [2, 0.1],
      [3, 0.0],
      [4, 0.3],
      [5, 0.2],
    ]);
    const rows = rankBuyable(new Set(), pBest, catalogue, 2);
    expect(rows.map((r) => r.dex)).toEqual([3, 2]); // p=0 first, then the lowest non-zero
  });
});

describe("oneInNPacks", () => {
  it("inverts a probability into 1-in-N, null at zero", () => {
    expect(oneInNPacks(0)).toBeNull();
    expect(oneInNPacks(0.25)).toBe(4);
    expect(oneInNPacks(0.5)).toBe(2);
  });
});
