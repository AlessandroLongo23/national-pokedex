import { describe, it, expect } from "vitest";
import { sortCards } from "@/app/(dashboard)/_lib/card-sort";
import type { CardEntry } from "@/lib/data/types";

function card(overrides: Partial<CardEntry>): CardEntry {
  return {
    id: "x-1",
    name: "Card",
    setId: "x",
    supertype: "Pokémon",
    number: "1",
    numberInt: 1,
    rarity: "Common",
    rarityRaw: "Common",
    dex: [1],
    types: ["Grass"],
    subtypes: [],
    artist: undefined,
    imageSmall: "",
    imageLarge: "",
    ...overrides,
  };
}

describe("sortCards", () => {
  it("number sort: ascending by setId then numberInt", () => {
    const cards = [
      card({ id: "b-3", setId: "b", numberInt: 3 }),
      card({ id: "a-2", setId: "a", numberInt: 2 }),
      card({ id: "a-1", setId: "a", numberInt: 1 }),
      card({ id: "b-1", setId: "b", numberInt: 1 }),
    ];
    const ids = sortCards(cards, "number").map((c) => c.id);
    expect(ids).toEqual(["a-1", "a-2", "b-1", "b-3"]);
  });

  it("rarity sort: rarer cards come later, ties break on set+number", () => {
    const cards = [
      card({ id: "a-2", setId: "a", numberInt: 2, rarity: "UltraRare" }),
      card({ id: "a-1", setId: "a", numberInt: 1, rarity: "Common" }),
      card({ id: "b-1", setId: "b", numberInt: 1, rarity: "Rare" }),
      card({ id: "a-3", setId: "a", numberInt: 3, rarity: "Common" }),
    ];
    const ids = sortCards(cards, "rarity").map((c) => c.id);
    expect(ids).toEqual(["a-1", "a-3", "b-1", "a-2"]);
  });

  it("pokemon sort: by first dex#, then setId+number; cards with empty dex sink to bottom", () => {
    const cards = [
      card({ id: "a-2", setId: "a", numberInt: 2, dex: [25] }),
      card({ id: "tr-1", setId: "tr", numberInt: 1, dex: [], supertype: "Trainer" }),
      card({ id: "a-1", setId: "a", numberInt: 1, dex: [4] }),
      card({ id: "b-9", setId: "b", numberInt: 9, dex: [25] }),
    ];
    const ids = sortCards(cards, "pokemon").map((c) => c.id);
    expect(ids).toEqual(["a-1", "a-2", "b-9", "tr-1"]);
  });

  it("returns a new array (does not mutate input)", () => {
    const input = [
      card({ id: "b-1", setId: "b", numberInt: 1 }),
      card({ id: "a-1", setId: "a", numberInt: 1 }),
    ];
    const before = input.map((c) => c.id);
    sortCards(input, "number");
    expect(input.map((c) => c.id)).toEqual(before);
  });
});
