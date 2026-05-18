import { describe, it, expect } from "vitest";
import { parseSetCards, type RawCard } from "@/scripts/ingest/parseCards";
import sv from "@/tests/fixtures/set-sv-fixture.json";
import me from "@/tests/fixtures/set-me-fixture.json";

describe("parseSetCards", () => {
  it("collects union of nationalPokedexNumbers for Pokémon supertype only", () => {
    const result = parseSetCards("sv1", sv as RawCard[]);
    expect(result.dexNumbers.sort((a, b) => a - b)).toEqual([1, 2, 25]);
    expect(result.distinctPokemonCount).toBe(3);
  });

  it("emits Trainer cards alongside Pokémon", () => {
    const result = parseSetCards("sv1", sv as RawCard[]);
    const trainers = result.cards.filter((c) => c.supertype === "Trainer");
    expect(trainers).toHaveLength(1);
    expect(trainers[0]?.name).toBe("Professor's Research");
    expect(trainers[0]?.dex).toEqual([]);
  });

  it("excludes non-Pokémon supertypes from dexNumbers", () => {
    const result = parseSetCards("sv1", sv as RawCard[]);
    expect(result.dexNumbers).not.toContain(undefined);
    expect(result.dexNumbers.length).toBe(3);
  });

  it("dedupes when multiple cards share a dex number", () => {
    const result = parseSetCards("me1", me as RawCard[]);
    expect(result.dexNumbers.sort((a, b) => a - b)).toEqual([2, 382, 818]);
  });

  it("emits a Pokémon card without nationalPokedexNumbers but contributes nothing to dexNumbers", () => {
    const result = parseSetCards("x", [
      { id: "x-1", name: "Mystery", supertype: "Pokémon", number: "1" } as RawCard,
    ]);
    expect(result.dexNumbers).toEqual([]);
    expect(result.cards).toHaveLength(1);
    expect(result.cards[0]?.supertype).toBe("Pokémon");
  });

  it("emits Energy supertype cards with empty dex", () => {
    const result = parseSetCards("x", [
      {
        id: "x-50",
        name: "Basic Fire Energy",
        supertype: "Energy",
        number: "50",
      } as RawCard,
    ]);
    expect(result.cards).toHaveLength(1);
    expect(result.cards[0]?.supertype).toBe("Energy");
    expect(result.cards[0]?.dex).toEqual([]);
  });

  it("cardCount reflects total cards across all supertypes", () => {
    const result = parseSetCards("sv1", sv as RawCard[]);
    expect(result.cardCount).toBe(4); // 3 Pokémon + 1 Trainer
    expect(result.distinctPokemonCount).toBe(3);
  });
});
