import { describe, it, expect } from "vitest";
import {
  buildPrintItems,
  printDefaultStyle,
  type BuildPrintItemsArgs,
} from "@/lib/placeholders/build-print-items";
import type { CardEntry, MegaForm } from "@/lib/data/types";

function card(overrides: Partial<CardEntry>): CardEntry {
  return {
    id: "x-1",
    name: "Card",
    setId: "sv1",
    supertype: "Pokémon",
    number: "1",
    numberInt: 1,
    rarity: "Common",
    rarityRaw: "Common",
    dex: [1],
    types: ["Grass"],
    subtypes: [],
    imageSmall: "https://images.pokemontcg.io/sv1/1.png",
    imageLarge: "https://images.pokemontcg.io/sv1/1_hires.png",
    ...overrides,
  };
}

function args(overrides: Partial<BuildPrintItemsArgs>): BuildPrintItemsArgs {
  return {
    scopeType: "pokedex",
    cards: [],
    ownedCardIds: new Set(),
    ownedSpecies: new Set(),
    ownedMegaForms: new Set(),
    treatMegasAsSeparate: false,
    ...overrides,
  };
}

describe("printDefaultStyle", () => {
  it("defaults species-based scopes to artwork", () => {
    expect(printDefaultStyle("pokedex")).toBe("artwork");
    expect(printDefaultStyle("pokemon")).toBe("artwork");
  });

  it("defaults card-list scopes to scan", () => {
    expect(printDefaultStyle("master_set")).toBe("scan");
    expect(printDefaultStyle("custom")).toBe("scan");
    expect(printDefaultStyle("artist")).toBe("scan");
  });
});

describe("buildPrintItems — pokedex scope", () => {
  it("emits one item per dex in range, in order, keyed by dex", () => {
    const items = buildPrintItems(
      args({ scopeType: "pokedex", dexRange: { from: 1, to: 3 } }),
    );
    expect(items.map((i) => i.key)).toEqual(["dex:1", "dex:2", "dex:3"]);
  });

  it("builds the species payload from real species data with unit conversions", () => {
    const [bulba] = buildPrintItems(
      args({ scopeType: "pokedex", dexRange: { from: 1, to: 1 } }),
    );
    expect(bulba!.species).toMatchObject({
      dex: 1,
      name: "Bulbasaur",
      gen: 1,
      genus: "Seed Pokémon",
      heightM: 0.7, // heightDm 7 / 10
      weightKg: 6.9, // weightHg 69 / 10
      types: ["grass", "poison"], // lowercased
    });
    expect(bulba!.species!.artworkUrl).toContain("/official-artwork/1.png");
  });

  it("marks a slot owned when its dex is in ownedSpecies", () => {
    const items = buildPrintItems(
      args({
        scopeType: "pokedex",
        dexRange: { from: 1, to: 3 },
        ownedSpecies: new Set([2]),
      }),
    );
    expect(items.find((i) => i.key === "dex:2")!.owned).toBe(true);
    expect(items.find((i) => i.key === "dex:1")!.owned).toBe(false);
  });

  it("picks the highest-rarity variant as the representative card regardless of ownership", () => {
    const common = card({ id: "a-1", rarity: "Common", dex: [1] });
    const rare = card({ id: "a-2", rarity: "DoubleRare", dex: [1] });
    const [item] = buildPrintItems(
      args({
        scopeType: "pokedex",
        dexRange: { from: 1, to: 1 },
        cards: [common, rare],
      }),
    );
    expect(item!.card?.id).toBe("a-2");
  });

  it("honors a cell override when that card is owned", () => {
    const common = card({ id: "a-1", rarity: "Common", dex: [1] });
    const rare = card({ id: "a-2", rarity: "DoubleRare", dex: [1] });
    const [item] = buildPrintItems(
      args({
        scopeType: "pokedex",
        dexRange: { from: 1, to: 1 },
        cards: [common, rare],
        ownedCardIds: new Set(["a-1"]),
        ownedSpecies: new Set([1]),
        overrides: { 1: "a-1" },
      }),
    );
    expect(item!.card?.id).toBe("a-1");
  });

  it("falls through a stale (unowned) override to the highest-rarity variant", () => {
    const common = card({ id: "a-1", rarity: "Common", dex: [1] });
    const rare = card({ id: "a-2", rarity: "DoubleRare", dex: [1] });
    const [item] = buildPrintItems(
      args({
        scopeType: "pokedex",
        dexRange: { from: 1, to: 1 },
        cards: [common, rare],
        overrides: { 1: "a-1" }, // a-1 not owned
      }),
    );
    expect(item!.card?.id).toBe("a-2");
  });

  it("leaves card undefined when no variant exists in scope for that dex", () => {
    const [item] = buildPrintItems(
      args({ scopeType: "pokedex", dexRange: { from: 1, to: 1 }, cards: [] }),
    );
    expect(item!.card).toBeUndefined();
    expect(item!.species).toBeDefined(); // artwork still available
  });

  it("appends mega slots only when treatMegasAsSeparate and megasInRange are provided", () => {
    const megas: MegaForm[] = [
      {
        formKey: "mega-venusaur",
        displayName: "Mega Venusaur",
        baseDex: 3,
        gen: 1,
        isPrimal: false,
        artworkId: 10033,
      },
    ];
    const off = buildPrintItems(
      args({ scopeType: "pokedex", dexRange: { from: 1, to: 3 }, megasInRange: megas }),
    );
    expect(off.some((i) => i.key.startsWith("mega:"))).toBe(false);

    const on = buildPrintItems(
      args({
        scopeType: "pokedex",
        dexRange: { from: 1, to: 3 },
        megasInRange: megas,
        treatMegasAsSeparate: true,
        ownedMegaForms: new Set(["mega-venusaur"]),
      }),
    );
    const mega = on.find((i) => i.key === "mega:mega-venusaur");
    expect(mega).toBeDefined();
    expect(mega!.owned).toBe(true);
    expect(mega!.species!.name).toBe("Mega Venusaur");
    expect(mega!.species!.artworkUrl).toContain("/official-artwork/10033.png");
  });
});

describe("buildPrintItems — card-list scopes", () => {
  it("emits one item per card, keyed by card id, with a formatted set code and rarity label", () => {
    const c = card({
      id: "sv1-25",
      name: "Pikachu",
      setId: "sv1",
      number: "25",
      rarity: "IllustrationRare",
      dex: [25],
    });
    const [item] = buildPrintItems(
      args({ scopeType: "master_set", cards: [c] }),
    );
    expect(item!.key).toBe("card:sv1-25");
    expect(item!.card).toMatchObject({
      id: "sv1-25",
      name: "Pikachu",
      setCode: "SV1",
      number: "25",
      rarityLabel: "Illustration Rare",
    });
  });

  it("includes a species payload for Pokémon cards but not for Trainers", () => {
    const mon = card({ id: "sv1-1", supertype: "Pokémon", dex: [1] });
    const trainer = card({
      id: "sv1-200",
      name: "Professor's Research",
      supertype: "Trainer",
      dex: [],
    });
    const items = buildPrintItems(
      args({ scopeType: "master_set", cards: [mon, trainer] }),
    );
    expect(items[0]!.species).toBeDefined();
    expect(items[0]!.species!.name).toBe("Bulbasaur");
    expect(items[1]!.species).toBeUndefined();
  });

  it("marks a card owned when its id is in ownedCardIds", () => {
    const c = card({ id: "sv1-25", dex: [25] });
    const [item] = buildPrintItems(
      args({
        scopeType: "master_set",
        cards: [c],
        ownedCardIds: new Set(["sv1-25"]),
      }),
    );
    expect(item!.owned).toBe(true);
  });

  it("uses the Mega form's artwork and name for a card carrying a megaFormKey", () => {
    const megaCharizardX = card({
      id: "xy-1",
      name: "M Charizard-EX",
      dex: [6], // base dex — must NOT resolve to base Charizard art
      supertype: "Pokémon",
      megaFormKey: "mega-charizard-x",
    });
    const [item] = buildPrintItems(
      args({ scopeType: "custom", cards: [megaCharizardX] }),
    );
    expect(item!.species?.name).toBe("Mega Charizard X");
    expect(item!.species?.artworkUrl).toContain("/official-artwork/10034.png");
    expect(item!.species?.dex).toBe(6);
  });
});
