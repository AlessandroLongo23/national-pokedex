import { describe, it, expect } from "vitest";
import type { RarityBucket, SetInfo, SetRarityPool } from "@/lib/data/types";
import { slotsForSeries } from "@/lib/packs/pack-structure";
import { mulberry32 } from "@/scripts/sim/rng";
import { bestPack, uniform } from "@/scripts/sim/strategies";
import type { ExpectedNewModel } from "@/scripts/sim/analytic";
import type { SetEngine } from "@/scripts/sim/trial";
import {
  speciesBuyableFromPools,
  obtainableBucketsFromPools,
  pBestBySpecies,
  buyableSortedByHardness,
  runToCompletion,
  runWeeklyPlan,
} from "@/scripts/sim/cost";

function mkSet(id: string, dexNumbers: number[]): SetInfo {
  return {
    id,
    name: id,
    series: "Scarlet & Violet",
    releaseDate: "2023-01-01",
    dexNumbers,
    uniqueCount: 0,
    distinctPokemonCount: dexNumbers.length,
    cardCount: 0,
  };
}

function tinyWorld(): { model: ExpectedNewModel; engines: Map<string, SetEngine>; pool: SetRarityPool } {
  const pool: SetRarityPool = {
    Common: [{ supertype: "Pokémon", dex: [1] }, { supertype: "Pokémon", dex: [2] }],
    Uncommon: [{ supertype: "Pokémon", dex: [3] }],
    Rare: [{ supertype: "Pokémon", dex: [3] }],
    DoubleRare: [],
    UltraRare: [],
    IllustrationRare: [],
    SpecialIllustrationRare: [],
    HyperRare: [],
  };
  const slots = slotsForSeries("Scarlet & Violet");
  const set = mkSet("x", [1, 2, 3]);
  const model: ExpectedNewModel = {
    candidateSets: [set],
    pSetBySet: new Map([["x", new Map([[1, 0.4], [2, 0.4], [3, 0.9]])]]),
    speciesToSets: new Map([[1, ["x"]], [2, ["x"]], [3, ["x"]]]),
    achievableCeiling: 3,
    catalogCeiling: 3,
  };
  const engines = new Map<string, SetEngine>([["x", { pool, slots }]]);
  return { model, engines, pool };
}

describe("speciesBuyableFromPools", () => {
  it("collects species from the requested rarity buckets only", () => {
    const pool: SetRarityPool = {
      Common: [{ supertype: "Pokémon", dex: [1] }, { supertype: "Trainer", dex: [] }],
      Uncommon: [{ supertype: "Pokémon", dex: [2] }],
      Rare: [{ supertype: "Pokémon", dex: [3] }],
      DoubleRare: [{ supertype: "Pokémon", dex: [4] }],
      UltraRare: [],
      IllustrationRare: [],
      SpecialIllustrationRare: [],
      HyperRare: [],
    };
    expect([...speciesBuyableFromPools([pool], ["Common", "Uncommon"])].sort()).toEqual([1, 2]);
    expect([...speciesBuyableFromPools([pool], ["Common", "Uncommon", "Rare"])].sort()).toEqual([1, 2, 3]);
    // species 4 (DoubleRare) is never buyable under either rule
  });
});

describe("buyableSortedByHardness", () => {
  it("orders buyable species hardest-first (lowest p_best) and drops unreachable ones", () => {
    const pBest = new Map([[1, 0.4], [2, 0.05], [3, 0.9]]);
    const sorted = buyableSortedByHardness(new Set([1, 2, 3, 99]), pBest);
    expect(sorted).toEqual([2, 1, 3]); // 99 not in pBest → dropped
  });
});

describe("pBestBySpecies", () => {
  it("is the max per-pack pull probability across sets", () => {
    const { model } = tinyWorld();
    const pb = pBestBySpecies(model);
    expect(pb.get(3)).toBeCloseTo(0.9, 12);
    expect(pb.get(1)).toBeCloseTo(0.4, 12);
  });
});

describe("runToCompletion", () => {
  it("packs-only run collects every achievable species", () => {
    const { model, engines } = tinyWorld();
    const r = runToCompletion(uniform, model, engines, mulberry32(1), { buyableSorted: null });
    expect(r.completed).toBe(true);
    expect(r.singles).toBe(0);
    expect(r.packs).toBeGreaterThan(0);
  });

  it("with all species buyable, singles finish it in the first round", () => {
    const { model, engines } = tinyWorld();
    const r = runToCompletion(bestPack, model, engines, mulberry32(2), { buyableSorted: [3, 1, 2] });
    expect(r.completed).toBe(true);
    expect(r.packs).toBe(1); // one pack, then ≤10 singles complete the 3-species dex
    expect(r.singles).toBeLessThanOrEqual(3);
  });

  it("is reproducible for the same seed", () => {
    const { model, engines } = tinyWorld();
    const a = runToCompletion(uniform, model, engines, mulberry32(7), { buyableSorted: null });
    const b = runToCompletion(uniform, model, engines, mulberry32(7), { buyableSorted: null });
    expect(a).toEqual(b);
  });

  it("respects the safety cap and reports completed=false if exceeded", () => {
    const { model, engines } = tinyWorld();
    const r = runToCompletion(uniform, model, engines, mulberry32(3), { buyableSorted: null, cap: 0 });
    expect(r.completed).toBe(false);
    expect(r.packs).toBe(0);
  });
});

describe("obtainableBucketsFromPools", () => {
  it("maps each species to the C/U/R buckets it is printed at (input order)", () => {
    const pool: SetRarityPool = {
      Common: [{ supertype: "Pokémon", dex: [1] }, { supertype: "Trainer", dex: [] }],
      Uncommon: [{ supertype: "Pokémon", dex: [1] }, { supertype: "Pokémon", dex: [2] }],
      Rare: [{ supertype: "Pokémon", dex: [3] }],
      DoubleRare: [{ supertype: "Pokémon", dex: [4] }],
      UltraRare: [],
      IllustrationRare: [],
      SpecialIllustrationRare: [],
      HyperRare: [],
    };
    const m = obtainableBucketsFromPools([pool], ["Common", "Uncommon", "Rare"]);
    expect(m.get(1)).toEqual(["Common", "Uncommon"]);
    expect(m.get(2)).toEqual(["Uncommon"]);
    expect(m.get(3)).toEqual(["Rare"]);
    expect(m.has(4)).toBe(false); // DoubleRare not in the requested buckets
  });
});

// A world whose packs reliably yield species 1 (Common) + 2 (Uncommon/Rare) and
// pile up Common duplicates of #1; species 3/4/5 are off-pack and only obtainable
// as singles/trades at Common.
function weeklyWorld(): { model: ExpectedNewModel; engines: Map<string, SetEngine> } {
  const pool: SetRarityPool = {
    Common: [{ supertype: "Pokémon", dex: [1] }],
    Uncommon: [{ supertype: "Pokémon", dex: [2] }],
    Rare: [{ supertype: "Pokémon", dex: [2] }],
    DoubleRare: [],
    UltraRare: [],
    IllustrationRare: [],
    SpecialIllustrationRare: [],
    HyperRare: [],
  };
  const slots = slotsForSeries("Scarlet & Violet");
  const set = mkSet("x", [1, 2]);
  const model: ExpectedNewModel = {
    candidateSets: [set],
    pSetBySet: new Map([["x", new Map([[1, 0.9], [2, 0.6]])]]),
    speciesToSets: new Map([[1, ["x"]], [2, ["x"]]]),
    achievableCeiling: 2,
    catalogCeiling: 2,
  };
  const engines = new Map<string, SetEngine>([["x", { pool, slots }]]);
  return { model, engines };
}

const WEEKLY_OBTAINABLE = new Map<number, RarityBucket[]>([
  [1, ["Common"]],
  [2, ["Uncommon", "Rare"]],
  [3, ["Common"]],
  [4, ["Common"]],
  [5, ["Common"]],
]);
const WEEKLY_BUY_ORDER = [3, 4, 5]; // the off-pack species, "hardest" first

describe("runWeeklyPlan", () => {
  it("buy-only baseline: never trades, and packNew + buys == target", () => {
    const { model, engines } = weeklyWorld();
    const r = runWeeklyPlan(bestPack, model, engines, mulberry32(11), {
      target: 5,
      buyOrder: WEEKLY_BUY_ORDER,
      obtainable: WEEKLY_OBTAINABLE,
      trade: false,
    });
    expect(r.completed).toBe(true);
    expect(r.trades).toBe(0);
    expect(r.buys).toBe(3); // species 3,4,5 bought
    expect(r.packNew).toBe(2); // species 1,2 from the first pack
    expect(r.packNew + r.buys).toBe(5);
    expect(r.weeks).toBe(1); // 3 single-channel acquisitions ≤ 10 → done in week 1
    expect(r.weeks).toBe(r.packs);
  });

  it("trade-first spends Common duplicates instead of buying, finishing the same week", () => {
    const { model, engines } = weeklyWorld();
    const r = runWeeklyPlan(bestPack, model, engines, mulberry32(11), {
      target: 5,
      buyOrder: WEEKLY_BUY_ORDER,
      obtainable: WEEKLY_OBTAINABLE,
      trade: true,
    });
    expect(r.completed).toBe(true);
    expect(r.trades).toBeGreaterThan(0); // pack #1 yields ≥3 Common dupes of #1
    expect(r.buys).toBeLessThan(3); // some buys replaced by trades
    expect(r.trades + r.buys).toBe(3); // same single-channel acquisitions either way
    expect(r.packNew + r.trades + r.buys).toBe(5);
    expect(r.weeks).toBe(1);
  });

  it("is reproducible for the same seed", () => {
    const { model, engines } = weeklyWorld();
    const opts = { target: 5, buyOrder: WEEKLY_BUY_ORDER, obtainable: WEEKLY_OBTAINABLE, trade: true };
    const a = runWeeklyPlan(bestPack, model, engines, mulberry32(7), opts);
    const b = runWeeklyPlan(bestPack, model, engines, mulberry32(7), opts);
    expect(a).toEqual(b);
  });

  it("respects the week cap and reports completed=false if exceeded", () => {
    const { model, engines } = weeklyWorld();
    const r = runWeeklyPlan(bestPack, model, engines, mulberry32(3), {
      target: 5,
      buyOrder: WEEKLY_BUY_ORDER,
      obtainable: WEEKLY_OBTAINABLE,
      trade: true,
      weekCap: 0,
    });
    expect(r.completed).toBe(false);
    expect(r.weeks).toBe(0);
  });
});
