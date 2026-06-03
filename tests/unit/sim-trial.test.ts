import { describe, it, expect } from "vitest";
import type { SetInfo, SetRarityPool } from "@/lib/data/types";
import { slotsForSeries } from "@/lib/packs/pack-structure";
import { mulberry32 } from "@/scripts/sim/rng";
import { bestPack, uniform, leastOpened } from "@/scripts/sim/strategies";
import { buildExpectedNewModel, getCandidateSets, type ExpectedNewModel } from "@/scripts/sim/analytic";
import { runTrajectory, buildEngines, type SetEngine } from "@/scripts/sim/trial";

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

// A tiny one-set world with three pullable species {1,2,3}.
function tinyWorld(): { model: ExpectedNewModel; engines: Map<string, SetEngine> } {
  const pool: SetRarityPool = {
    Common: [
      { supertype: "Pokémon", dex: [1] },
      { supertype: "Pokémon", dex: [2] },
    ],
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
    pSetBySet: new Map([
      [
        "x",
        new Map([
          [1, 0.4],
          [2, 0.4],
          [3, 0.9],
        ]),
      ],
    ]),
    speciesToSets: new Map([
      [1, ["x"]],
      [2, ["x"]],
      [3, ["x"]],
    ]),
    achievableCeiling: 3,
    catalogCeiling: 3,
  };
  const engines = new Map<string, SetEngine>([["x", { pool, slots }]]);
  return { model, engines };
}

describe("runTrajectory mechanics", () => {
  it("produces a curve of length = budget", () => {
    const { model, engines } = tinyWorld();
    const res = runTrajectory(uniform, model, engines, mulberry32(1), {
      budget: 50,
      checkpoints: [10, 50],
    });
    expect(res.curve.length).toBe(50);
  });

  it("the species curve is non-decreasing", () => {
    const { model, engines } = tinyWorld();
    const res = runTrajectory(uniform, model, engines, mulberry32(3), { budget: 100 });
    for (let i = 1; i < res.curve.length; i++) {
      expect(res.curve[i]!).toBeGreaterThanOrEqual(res.curve[i - 1]!);
    }
  });

  it("checkpoint values equal the curve at those pack indices and are ordered", () => {
    const { model, engines } = tinyWorld();
    const checkpoints = [10, 50, 100];
    const res = runTrajectory(uniform, model, engines, mulberry32(5), {
      budget: 100,
      checkpoints,
    });
    expect(res.checkpoints).toEqual(checkpoints);
    for (let k = 0; k < checkpoints.length; k++) {
      expect(res.speciesAt[k]).toBe(res.curve[checkpoints[k]! - 1]);
    }
    expect(res.speciesAt[0]!).toBeLessThanOrEqual(res.speciesAt[1]!);
    expect(res.speciesAt[1]!).toBeLessThanOrEqual(res.speciesAt[2]!);
  });

  it("is reproducible — same seed yields identical results", () => {
    const { model, engines } = tinyWorld();
    const a = runTrajectory(bestPack, model, engines, mulberry32(777), { budget: 200 });
    const b = runTrajectory(bestPack, model, engines, mulberry32(777), { budget: 200 });
    expect(a.speciesAt).toEqual(b.speciesAt);
    expect(a.curve).toEqual(b.curve);
    expect(a.wastedAt).toEqual(b.wastedAt);
  });

  it("never collects more than the achievable ceiling, and saturates there", () => {
    const { model, engines } = tinyWorld();
    const res = runTrajectory(leastOpened, model, engines, mulberry32(9), { budget: 300 });
    expect(Math.max(...res.curve)).toBeLessThanOrEqual(model.achievableCeiling);
    // 300 packs of a 3-species set is virtually certain to find all three.
    expect(res.curve[res.curve.length - 1]).toBe(3);
  });

  it("counts wasted packs (zero new species) once the set saturates", () => {
    const { model, engines } = tinyWorld();
    const res = runTrajectory(leastOpened, model, engines, mulberry32(11), {
      budget: 300,
      checkpoints: [3, 300],
    });
    // By 300 packs the set is exhausted, so most packs late are wasted.
    const wastedTotal = res.wastedAt[res.wastedAt.length - 1]!;
    expect(wastedTotal).toBeGreaterThan(0);
    expect(wastedTotal).toBeLessThan(300);
  });

  it("records a cumulative, non-decreasing wasted-pack curve of length budget", () => {
    const { model, engines } = tinyWorld();
    const res = runTrajectory(leastOpened, model, engines, mulberry32(11), {
      budget: 300,
      checkpoints: [3, 300],
    });
    expect(res.wastedCurve.length).toBe(300);
    for (let i = 1; i < res.wastedCurve.length; i++) {
      expect(res.wastedCurve[i]!).toBeGreaterThanOrEqual(res.wastedCurve[i - 1]!);
    }
    // Final cumulative value agrees with the checkpoint snapshot at pack 300.
    expect(res.wastedCurve[299]).toBe(res.wastedAt[res.wastedAt.length - 1]);
  });

  it("honors the full budget even after best-pack expected-new hits ~0", () => {
    const { model, engines } = tinyWorld();
    const res = runTrajectory(bestPack, model, engines, mulberry32(13), { budget: 120 });
    // It keeps opening: curve has full length, collection capped at ceiling.
    expect(res.curve.length).toBe(120);
    expect(res.curve[119]).toBe(3);
  });
});

describe("buildEngines (real data)", () => {
  it("returns a pool + matching slots for every candidate set", () => {
    const cands = getCandidateSets(["Scarlet & Violet", "Mega Evolution"]);
    const engines = buildEngines(cands);
    expect(engines.size).toBe(cands.length);
    for (const set of cands) {
      const eng = engines.get(set.id);
      expect(eng).toBeTruthy();
      expect(eng!.slots).toEqual(slotsForSeries(set.series));
      expect(eng!.pool.Common.length).toBeGreaterThan(0);
    }
  });

  it("integrates with the analytic model end-to-end on SV+ME", () => {
    const cands = getCandidateSets(["Scarlet & Violet", "Mega Evolution"]);
    const model = buildExpectedNewModel(cands);
    const engines = buildEngines(cands);
    const res = runTrajectory(bestPack, model, engines, mulberry32(2024), {
      budget: 200,
      checkpoints: [10, 50, 200],
    });
    // Best-pack from empty should collect a healthy number of species fast.
    expect(res.speciesAt[2]!).toBeGreaterThan(res.speciesAt[0]!);
    expect(res.speciesAt[2]!).toBeLessThanOrEqual(model.achievableCeiling);
  });
});
