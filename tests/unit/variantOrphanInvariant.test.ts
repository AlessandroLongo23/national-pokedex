import { describe, it, expect } from "vitest";
import { applyVariantFormKeys } from "@/scripts/ingest/parseVariants";
import type { CardEntry, VariantIndex } from "@/lib/data/types";

function card(id: string, name: string, dex: number): CardEntry {
  return {
    id,
    name,
    setId: "test",
    supertype: "Pokémon",
    number: "1",
    numberInt: 1,
    rarity: "Rare",
    rarityRaw: "Rare",
    dex: [dex],
    types: [],
    subtypes: [],
    imageSmall: "",
    imageLarge: "",
  };
}

describe("applyVariantFormKeys (orphan-card invariant)", () => {
  it("assigns variantFormKey ONLY from the resolved cardIndexByVariant", () => {
    const cardsBySet = {
      a: [
        card("a-1", "Alolan Vulpix", 37), // resolved variant
        card("a-2", "Paldean Clodsire", 980), // region-exclusive → dropped
        card("a-3", "Vulpix", 37), // ordinary base card
      ],
    };
    // Resolver kept only alola-vulpix; clodsire never made it into the index.
    const cardIndexByVariant: VariantIndex = { "alola-vulpix": ["a-1"] };

    applyVariantFormKeys(cardsBySet, cardIndexByVariant);

    expect(cardsBySet.a[0]!.variantFormKey).toBe("alola-vulpix");
    // Region-exclusive region-prefixed card carries NO variantFormKey.
    expect(cardsBySet.a[1]!.variantFormKey).toBeUndefined();
    // Ordinary base card unaffected.
    expect(cardsBySet.a[2]!.variantFormKey).toBeUndefined();
  });

  it("every assigned variantFormKey exists as a key in the index", () => {
    const cardsBySet = {
      a: [card("a-1", "Galarian Meowth", 52), card("a-2", "Alolan Meowth", 52)],
    };
    const cardIndexByVariant: VariantIndex = {
      "alola-meowth": ["a-2"],
      "galar-meowth": ["a-1"],
    };
    applyVariantFormKeys(cardsBySet, cardIndexByVariant);
    for (const cards of Object.values(cardsBySet)) {
      for (const c of cards) {
        if (c.variantFormKey !== undefined) {
          expect(cardIndexByVariant[c.variantFormKey]).toBeDefined();
        }
      }
    }
  });
});
