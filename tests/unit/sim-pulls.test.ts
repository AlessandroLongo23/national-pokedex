import { describe, it, expect } from "vitest";
import { SET_POOLS } from "@/lib/data";
import { slotsForSeries } from "@/lib/packs/pack-structure";
import { simulatePack } from "@/lib/packs/simulator";
import { mulberry32 } from "@/scripts/sim/rng";
import { simulatePackDetailed, runPullCensus, RARITY_BUCKETS } from "@/scripts/sim/pulls";
import { buildExpectedNewModel, getCandidateSets } from "@/scripts/sim/analytic";
import { buildEngines } from "@/scripts/sim/trial";
import { bestPack } from "@/scripts/sim/strategies";

// THE FAITHFULNESS GATE: the detailed opener must consume the RNG in exactly
// the same order as simulatePack, so the distinct Pokémon species it yields are
// identical for the same seed.
describe("simulatePackDetailed matches simulatePack", () => {
  const sets: { id: string; series: string }[] = [
    { id: "sv1", series: "Scarlet & Violet" },
    { id: "me1", series: "Mega Evolution" },
    { id: "swsh1", series: "Sword & Shield" },
    { id: "sm1", series: "Sun & Moon" },
    { id: "base1", series: "Base" },
  ];
  for (const { id, series } of sets) {
    it(`${id}: same seed → same distinct Pokémon dex`, () => {
      const pool = SET_POOLS[id]!;
      const slots = slotsForSeries(series);
      for (const seed of [1, 2, 99, 12345]) {
        const detailed = simulatePackDetailed(pool, slots, mulberry32(seed));
        const dexFromDetailed = new Set(
          detailed.filter((c) => c.supertype === "Pokémon").flatMap((c) => c.dex),
        );
        const setDex = simulatePack(pool, slots, mulberry32(seed));
        expect([...dexFromDetailed].sort((a, b) => a - b)).toEqual(
          [...setDex].sort((a, b) => a - b),
        );
      }
    });
  }

  it("returns one card per slot draw (all slots fill for openable sets)", () => {
    const slots = slotsForSeries("Scarlet & Violet");
    const total = slots.reduce((a, s) => a + s.count, 0);
    const detailed = simulatePackDetailed(SET_POOLS["sv1"]!, slots, mulberry32(7));
    expect(detailed.length).toBe(total);
  });

  it("tags each card with a known rarity bucket and slot kind", () => {
    const slots = slotsForSeries("Scarlet & Violet");
    const detailed = simulatePackDetailed(SET_POOLS["sv1"]!, slots, mulberry32(7));
    for (const c of detailed) {
      expect(RARITY_BUCKETS).toContain(c.bucket);
      expect(["uniform", "weighted", "reverse"]).toContain(c.slotKind);
    }
    // SV packs have exactly one weighted "rare slot" per pack.
    expect(detailed.filter((c) => c.slotKind === "weighted").length).toBe(1);
  });
});

describe("runPullCensus", () => {
  const cands = getCandidateSets(["Scarlet & Violet", "Mega Evolution"]);
  const model = buildExpectedNewModel(cands);
  const engines = buildEngines(cands);
  const universe = new Set<number>([...model.pSetBySet.values()].flatMap((m) => [...m.keys()]));

  it("rarity counts sum to total cards (Pokémon + Trainer + Energy)", () => {
    const c = runPullCensus(bestPack, model, engines, mulberry32(3), {
      budget: 200,
      checkpoints: [50, 200],
    });
    const last = c.checkpoints[c.checkpoints.length - 1]!;
    const rarSum = last.rarity.reduce((a, b) => a + b, 0);
    expect(rarSum).toBe(last.pokemon + last.trainer + last.energy);
  });

  it("distinct species is non-decreasing across checkpoints", () => {
    const c = runPullCensus(bestPack, model, engines, mulberry32(5), {
      budget: 200,
      checkpoints: [10, 50, 200],
    });
    for (let i = 1; i < c.checkpoints.length; i++) {
      expect(c.checkpoints[i]!.distinctSpecies).toBeGreaterThanOrEqual(
        c.checkpoints[i - 1]!.distinctSpecies,
      );
    }
  });

  it("rare-slot pulls total one per pack (SV/ME structure)", () => {
    const budget = 150;
    const c = runPullCensus(bestPack, model, engines, mulberry32(8), { budget, checkpoints: [budget] });
    const rareSlotTotal = c.rareSlot.reduce((a, b) => a + b, 0);
    expect(rareSlotTotal).toBe(budget);
  });

  it("only records pulls for species that live in the universe", () => {
    const c = runPullCensus(bestPack, model, engines, mulberry32(2), { budget: 100, checkpoints: [100] });
    c.speciesPulls.forEach((copies, dex) => {
      if (copies > 0) expect(universe.has(dex)).toBe(true);
    });
  });

  it("is reproducible for the same seed", () => {
    const a = runPullCensus(bestPack, model, engines, mulberry32(123), { budget: 120, checkpoints: [120] });
    const b = runPullCensus(bestPack, model, engines, mulberry32(123), { budget: 120, checkpoints: [120] });
    expect(a.speciesPulls).toEqual(b.speciesPulls);
    expect(a.rareSlot).toEqual(b.rareSlot);
  });
});
