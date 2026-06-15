import { describe, it, expect } from "vitest";
import { computeCheapestSingles } from "@/scripts/ingest/cheapestSingles";
import type { CardEntry, Rarity, SetInfo } from "@/lib/data/types";

const sets: SetInfo[] = [
  {
    id: "old",
    name: "Old Set",
    series: "Scarlet & Violet",
    releaseDate: "2023-01-01",
    dexNumbers: [25],
    uniqueCount: 0,
    distinctPokemonCount: 1,
    cardCount: 10,
  },
  {
    id: "new",
    name: "New Set",
    series: "Scarlet & Violet",
    releaseDate: "2024-06-01",
    dexNumbers: [25],
    uniqueCount: 0,
    distinctPokemonCount: 1,
    cardCount: 10,
  },
];

function card(partial: Partial<CardEntry> & { id: string; setId: string }): CardEntry {
  return {
    name: "Pikachu",
    supertype: "Pokémon",
    number: "1",
    numberInt: 1,
    rarity: "Common",
    rarityRaw: "Common",
    dex: [25],
    types: ["Lightning"],
    subtypes: ["Basic"],
    imageSmall: `https://img/${partial.id}.png`,
    imageLarge: `https://img/${partial.id}_hires.png`,
    ...partial,
  };
}

describe("computeCheapestSingles", () => {
  it("ranks printings by rarity tier, cheapest first", () => {
    const cards = {
      new: [
        card({ id: "new-r", setId: "new", rarity: "Rare", number: "3", numberInt: 3 }),
        card({ id: "new-u", setId: "new", rarity: "Uncommon", number: "2", numberInt: 2 }),
        card({ id: "new-c", setId: "new", rarity: "Common", number: "1", numberInt: 1 }),
      ],
    };
    const out = computeCheapestSingles(sets, cards);
    expect(out[25]?.map((c) => c.id)).toEqual(["new-c", "new-u", "new-r"]);
    expect(out[25]?.[0]?.rarity).toBe<Rarity>("Common");
  });

  it("breaks rarity ties by newest set first", () => {
    const cards = {
      old: [card({ id: "old-c", setId: "old", rarity: "Common" })],
      new: [card({ id: "new-c", setId: "new", rarity: "Common" })],
    };
    const out = computeCheapestSingles(sets, cards);
    expect(out[25]?.map((c) => c.id)).toEqual(["new-c", "old-c"]);
    expect(out[25]?.[0]?.setName).toBe("New Set");
  });

  it("caps each species at the limit (default 3)", () => {
    const cards = {
      new: Array.from({ length: 6 }, (_, i) =>
        card({ id: `new-${i}`, setId: "new", number: String(i + 1), numberInt: i + 1 }),
      ),
    };
    const out = computeCheapestSingles(sets, cards);
    expect(out[25]).toHaveLength(3);
  });

  it("excludes Trainer and Energy cards", () => {
    const cards = {
      new: [
        card({ id: "trainer", setId: "new", supertype: "Trainer", dex: [], name: "Potion" }),
        card({ id: "mon", setId: "new", rarity: "Rare" }),
      ],
    };
    const out = computeCheapestSingles(sets, cards);
    expect(out[25]?.map((c) => c.id)).toEqual(["mon"]);
  });

  it("indexes a multi-dex card under every dex it represents", () => {
    const cards = {
      new: [card({ id: "duo", setId: "new", dex: [25, 26], name: "Pikachu & Raichu" })],
    };
    const out = computeCheapestSingles(sets, cards);
    expect(out[25]?.[0]?.id).toBe("duo");
    expect(out[26]?.[0]?.id).toBe("duo");
  });

  it("breaks same-set rarity ties by card number", () => {
    const cards = {
      new: [
        card({ id: "n10", setId: "new", number: "10", numberInt: 10 }),
        card({ id: "n2", setId: "new", number: "2", numberInt: 2 }),
      ],
    };
    const out = computeCheapestSingles(sets, cards);
    expect(out[25]?.map((c) => c.id)).toEqual(["n2", "n10"]);
  });
});
