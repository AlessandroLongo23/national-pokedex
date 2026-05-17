import { describe, it, expect } from "vitest";
import { parseSetCards, type RawCard } from "@/scripts/ingest/parseCards";
import sv from "@/tests/fixtures/set-sv-fixture.json";
import me from "@/tests/fixtures/set-me-fixture.json";

describe("parseSetCards", () => {
  it("collects union of nationalPokedexNumbers for Pokémon supertype only", () => {
    const result = parseSetCards(sv as RawCard[]);
    expect(result.dexNumbers.sort((a, b) => a - b)).toEqual([1, 2, 25]);
    expect(result.distinctPokemonCount).toBe(3);
  });

  it("ignores Trainer/Energy/etc.", () => {
    const result = parseSetCards(sv as RawCard[]);
    expect(result.dexNumbers).not.toContain(undefined);
    expect(result.dexNumbers.length).toBe(3);
  });

  it("dedupes when multiple cards share a dex number", () => {
    const result = parseSetCards(me as RawCard[]);
    expect(result.dexNumbers.sort((a, b) => a - b)).toEqual([2, 382, 818]);
  });

  it("handles missing nationalPokedexNumbers gracefully", () => {
    const result = parseSetCards([{ id: "x-1", name: "Mystery", supertype: "Pokémon" }]);
    expect(result.dexNumbers).toEqual([]);
  });
});
