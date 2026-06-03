import { describe, it, expect } from "vitest";
import type { SetInfo } from "@/lib/data/types";
import { mulberry32 } from "@/scripts/sim/rng";
import {
  bestPack,
  uniform,
  leastOpened,
  createInitialState,
  type SimState,
} from "@/scripts/sim/strategies";
import type { ExpectedNewModel } from "@/scripts/sim/analytic";

function mkSet(id: string, opts: Partial<SetInfo> = {}): SetInfo {
  return {
    id,
    name: id,
    series: "Scarlet & Violet",
    releaseDate: "2023-01-01",
    dexNumbers: [],
    uniqueCount: 0,
    distinctPokemonCount: 0,
    cardCount: 0,
    ...opts,
  };
}

function mkState(over: Partial<SimState>): SimState {
  return {
    owned: new Set<number>(),
    packsBySet: new Map<string, number>(),
    expectedNewRemaining: new Map<string, number>(),
    ...over,
  };
}

describe("uniform picker", () => {
  it("indexes candidates by floor(rng * n)", () => {
    const cands = [mkSet("a"), mkSet("b"), mkSet("c")];
    const state = mkState({});
    expect(uniform(state, cands, () => 0).id).toBe("a");
    expect(uniform(state, cands, () => 0.5).id).toBe("b");
    expect(uniform(state, cands, () => 0.999).id).toBe("c");
  });

  it("covers all candidates roughly uniformly over many draws", () => {
    const cands = [mkSet("a"), mkSet("b"), mkSet("c"), mkSet("d")];
    const rng = mulberry32(42);
    const counts = new Map<string, number>();
    for (let i = 0; i < 40_000; i++) {
      const s = uniform(mkState({}), cands, rng);
      counts.set(s.id, (counts.get(s.id) ?? 0) + 1);
    }
    for (const c of cands) {
      expect(counts.get(c.id)! / 40_000).toBeGreaterThan(0.22);
      expect(counts.get(c.id)! / 40_000).toBeLessThan(0.28);
    }
  });
});

describe("leastOpened picker", () => {
  it("chooses the set with the fewest packs opened", () => {
    const cands = [mkSet("a"), mkSet("b"), mkSet("c")];
    const state = mkState({
      packsBySet: new Map([
        ["a", 5],
        ["b", 1],
        ["c", 9],
      ]),
    });
    expect(leastOpened(state, cands, () => 0.5).id).toBe("b");
  });

  it("breaks ties at random among the least-opened sets", () => {
    const cands = [mkSet("a"), mkSet("b"), mkSet("c")];
    const state = mkState({
      packsBySet: new Map([
        ["a", 2],
        ["b", 2],
        ["c", 9],
      ]),
    });
    // Among {a, b} (both 2), index 0 -> a, near-1 -> b.
    expect(leastOpened(state, cands, () => 0).id).toBe("a");
    expect(leastOpened(state, cands, () => 0.99).id).toBe("b");
  });
});

describe("bestPack picker", () => {
  it("chooses the set with the highest expected-new remaining", () => {
    const cands = [mkSet("a"), mkSet("b"), mkSet("c")];
    const state = mkState({
      expectedNewRemaining: new Map([
        ["a", 1.2],
        ["b", 5.7],
        ["c", 0.3],
      ]),
    });
    expect(bestPack(state, cands, () => 0.5).id).toBe("b");
  });

  it("breaks ties on expected-new by unowned-in-set (via dexNumbers) descending", () => {
    const cands = [
      mkSet("a", { dexNumbers: [1, 2] }),
      mkSet("b", { dexNumbers: [1, 2, 3, 4, 5] }),
    ];
    const state = mkState({
      owned: new Set<number>(),
      expectedNewRemaining: new Map([
        ["a", 2.0],
        ["b", 2.0],
      ]),
    });
    expect(bestPack(state, cands, () => 0.5).id).toBe("b"); // 5 unowned > 2
  });

  it("breaks remaining+unowned ties by newer release date", () => {
    const cands = [
      mkSet("a", { dexNumbers: [1, 2], releaseDate: "2023-01-01" }),
      mkSet("b", { dexNumbers: [3, 4], releaseDate: "2025-09-26" }),
    ];
    const state = mkState({
      expectedNewRemaining: new Map([
        ["a", 2.0],
        ["b", 2.0],
      ]),
    });
    expect(bestPack(state, cands, () => 0.5).id).toBe("b");
  });
});

describe("createInitialState", () => {
  it("starts with zero packs, empty collection, and remaining = sum of pSet", () => {
    const model: ExpectedNewModel = {
      candidateSets: [mkSet("a"), mkSet("b")],
      pSetBySet: new Map([
        [
          "a",
          new Map([
            [1, 0.4],
            [2, 0.1],
          ]),
        ],
        ["b", new Map([[3, 0.9]])],
      ]),
      speciesToSets: new Map(),
      achievableCeiling: 3,
      catalogCeiling: 3,
    };
    const state = createInitialState(model);
    expect(state.owned.size).toBe(0);
    expect(state.packsBySet.get("a")).toBe(0);
    expect(state.packsBySet.get("b")).toBe(0);
    expect(state.expectedNewRemaining.get("a")).toBeCloseTo(0.5, 12);
    expect(state.expectedNewRemaining.get("b")).toBeCloseTo(0.9, 12);
  });
});
