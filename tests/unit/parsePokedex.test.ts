import { describe, it, expect } from "vitest";
import { parsePokedex } from "@/scripts/ingest/parsePokedex";
import { fixture } from "@/tests/fixtures/pokedex-snippet";

describe("parsePokedex", () => {
  const result = parsePokedex(fixture);

  it("includes canonical species in [1, 1025]", () => {
    expect(result).toContainEqual({ dex: 1, name: "Bulbasaur", gen: 1 });
    expect(result).toContainEqual({ dex: 2, name: "Ivysaur", gen: 1 });
    expect(result).toContainEqual({ dex: 4, name: "Charmander", gen: 1 });
    expect(result).toContainEqual({ dex: 479, name: "Rotom", gen: 4 });
  });

  it("drops alt-forme entries (baseSpecies set)", () => {
    const rotomHeat = result.find((e) => e.name === "Rotom-Heat");
    expect(rotomHeat).toBeUndefined();
  });

  it("drops entries with dex > 1025", () => {
    const future = result.find((e) => e.name === "FutureMon");
    expect(future).toBeUndefined();
  });

  it("returns entries sorted by dex ascending", () => {
    const dexes = result.map((e) => e.dex);
    expect(dexes).toEqual([...dexes].sort((a, b) => a - b));
  });

  it("assigns correct generation", () => {
    expect(result.find((e) => e.dex === 1)?.gen).toBe(1);
    expect(result.find((e) => e.dex === 479)?.gen).toBe(4);
  });
});
