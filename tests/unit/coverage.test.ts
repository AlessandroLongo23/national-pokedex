import { describe, it, expect } from "vitest";
import { computeCoverage } from "@/scripts/ingest/coverage";
import type { SetInfo, PokedexEntry } from "@/lib/data/types";

const pokedex: PokedexEntry[] = [
  { dex: 1, name: "Bulbasaur", gen: 1 },
  { dex: 2, name: "Ivysaur", gen: 1 },
  { dex: 152, name: "Chikorita", gen: 2 },
  { dex: 382, name: "Kyogre", gen: 3 },
];

const sets: SetInfo[] = [
  {
    id: "sv1",
    name: "SV Base",
    series: "Scarlet & Violet",
    releaseDate: "2023-03-31",
    dexNumbers: [1, 2],
    uniqueCount: 2,
    distinctPokemonCount: 2,
  },
  {
    id: "me1",
    name: "ME Base",
    series: "Mega Evolution",
    releaseDate: "2025-09-26",
    dexNumbers: [2, 382],
    uniqueCount: 1,
    distinctPokemonCount: 2,
  },
];

describe("computeCoverage", () => {
  const cov = computeCoverage(pokedex, sets);

  it("totalCovered = size of union across all sets", () => {
    expect(cov.totalCovered).toBe(3);
  });

  it("totalMissing = pokedex.length - totalCovered", () => {
    expect(cov.totalMissing).toBe(1);
  });

  it("missingDex lists the missing entries", () => {
    expect(cov.missingDex).toEqual([152]);
  });

  it("meAdded = ME-union minus SV-union", () => {
    expect(cov.meAdded).toEqual([382]);
  });

  it("byGen counts covered vs total per generation", () => {
    expect(cov.byGen[1]).toEqual({ covered: 2, total: 2 });
    expect(cov.byGen[2]).toEqual({ covered: 0, total: 1 });
    expect(cov.byGen[3]).toEqual({ covered: 1, total: 1 });
  });
});
