import { describe, it, expect } from "vitest";
import { selectWishlistCards } from "@/app/(dashboard)/_lib/wishlist-select";
import type { CardEntry } from "@/lib/data/types";

function card(id: string): CardEntry {
  return {
    id,
    name: "Pikachu",
    setId: "sv1",
    supertype: "Pokémon",
    number: "1",
    numberInt: 1,
    rarity: "Common",
    rarityRaw: "Common",
    dex: [25],
    types: ["Lightning"],
    subtypes: [],
    artist: "Ken Sugimori",
    imageSmall: "",
    imageLarge: "",
  } as CardEntry;
}

const cards = [card("sv1-1"), card("sv1-2"), card("sv1-3")];

describe("selectWishlistCards", () => {
  it("keeps cards that are wishlisted and not owned", () => {
    const result = selectWishlistCards(
      cards,
      new Set(["sv1-1", "sv1-2"]),
      new Set(),
    );
    expect(result.map((c) => c.id)).toEqual(["sv1-1", "sv1-2"]);
  });

  it("excludes a wishlisted card once it is owned", () => {
    const result = selectWishlistCards(
      cards,
      new Set(["sv1-1", "sv1-2"]),
      new Set(["sv1-1"]),
    );
    expect(result.map((c) => c.id)).toEqual(["sv1-2"]);
  });

  it("excludes cards that are not on the wishlist", () => {
    const result = selectWishlistCards(cards, new Set(["sv1-3"]), new Set());
    expect(result.map((c) => c.id)).toEqual(["sv1-3"]);
  });

  it("returns nothing when every wishlisted card is owned", () => {
    const result = selectWishlistCards(
      cards,
      new Set(["sv1-1", "sv1-2"]),
      new Set(["sv1-1", "sv1-2"]),
    );
    expect(result).toEqual([]);
  });
});
