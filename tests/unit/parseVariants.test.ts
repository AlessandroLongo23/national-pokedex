import { describe, it, expect } from "vitest";
import {
  normalizeVariantName,
  chooseVariantVariety,
  discoverVariants,
} from "@/scripts/ingest/parseVariants";
import type { CardEntry } from "@/lib/data/types";

describe("normalizeVariantName", () => {
  it("normalises a plain regional-prefixed name", () => {
    expect(normalizeVariantName("Alolan Vulpix")).toEqual({
      region: "alola",
      baseName: "Vulpix",
    });
    expect(normalizeVariantName("Galarian Moltres")).toEqual({
      region: "galar",
      baseName: "Moltres",
    });
    expect(normalizeVariantName("Hisuian Zoroark")).toEqual({
      region: "hisui",
      baseName: "Zoroark",
    });
    expect(normalizeVariantName("Paldean Tauros")).toEqual({
      region: "paldea",
      baseName: "Tauros",
    });
  });

  it("strips trailing product suffixes (EX, GX, V, VMAX, VSTAR, lowercase ex)", () => {
    expect(normalizeVariantName("Alolan Ninetales-GX")).toEqual({
      region: "alola",
      baseName: "Ninetales",
    });
    expect(normalizeVariantName("Hisuian Zoroark VSTAR")).toEqual({
      region: "hisui",
      baseName: "Zoroark",
    });
    expect(normalizeVariantName("Alolan Raichu-EX")).toEqual({
      region: "alola",
      baseName: "Raichu",
    });
    expect(normalizeVariantName("Galarian Obstagoon ex")).toEqual({
      region: "galar",
      baseName: "Obstagoon",
    });
  });

  it("rejects tag-team / dual-Pokémon cards", () => {
    expect(
      normalizeVariantName("Alolan Ninetales & Vulpix-GX"),
    ).toBeNull();
  });

  it("rejects names without a recognised regional prefix", () => {
    expect(normalizeVariantName("Vulpix")).toBeNull();
    expect(normalizeVariantName("Mega Charizard X")).toBeNull();
    expect(normalizeVariantName("Mr. Mime")).toBeNull();
  });
});

describe("chooseVariantVariety", () => {
  // PokeAPI lists each species' regional forms among `varieties`, each with
  // its own "form id" used in the official-artwork sprite path. Region tokens
  // appear in the variety name: -alola / -galar / -hisui / -paldea.
  it("selects the variety whose name contains the region token", () => {
    const vulpix = [
      { name: "vulpix", id: 37 },
      { name: "vulpix-alola", id: 10103 },
    ];
    expect(chooseVariantVariety("vulpix", vulpix, "alola")).toBe(10103);
  });

  it("returns null when no variety carries the region token (region-exclusive)", () => {
    // Perrserker #863 is Galar-only: its species has no non-Galar counterpart
    // listed as a region-tokened variety, so it must NOT become a variant.
    const perrserker = [{ name: "perrserker", id: 863 }];
    expect(chooseVariantVariety("perrserker", perrserker, "galar")).toBeNull();

    // Clodsire #980 — Paldea-only line, single bare variety, no region token.
    const clodsire = [{ name: "clodsire", id: 980 }];
    expect(chooseVariantVariety("clodsire", clodsire, "paldea")).toBeNull();

    // Sneasler #903 — Hisui-exclusive species, single bare variety.
    const sneasler = [{ name: "sneasler", id: 903 }];
    expect(chooseVariantVariety("sneasler", sneasler, "hisui")).toBeNull();

    // Basculegion #902 — has -male / -female varieties but NO region token,
    // so it is correctly rejected as a variant.
    const basculegion = [
      { name: "basculegion-male", id: 902 },
      { name: "basculegion-female", id: 10248 },
    ];
    expect(chooseVariantVariety("basculegion", basculegion, "hisui")).toBeNull();
  });

  it("applies the Hisuian Basculin override (basculin-white-striped)", () => {
    const basculin = [
      { name: "basculin-red-striped", id: 550 },
      { name: "basculin-blue-striped", id: 10016 },
      { name: "basculin-white-striped", id: 10247 },
    ];
    expect(chooseVariantVariety("basculin", basculin, "hisui")).toBe(10247);
  });

  it("picks a -standard form over -zen (Galarian Darmanitan)", () => {
    const darmanitan = [
      { name: "darmanitan-standard", id: 555 },
      { name: "darmanitan-zen", id: 10017 },
      { name: "darmanitan-galar-standard", id: 10018 },
      { name: "darmanitan-galar-zen", id: 10019 },
    ];
    expect(chooseVariantVariety("darmanitan", darmanitan, "galar")).toBe(10018);
  });

  it("picks the combat-breed Paldean Tauros over fire/water breeds", () => {
    const tauros = [
      { name: "tauros", id: 128 },
      { name: "tauros-paldea-combat-breed", id: 10250 },
      { name: "tauros-paldea-blaze-breed", id: 10251 },
      { name: "tauros-paldea-aqua-breed", id: 10252 },
    ];
    // The generic rule would pick the shortest (aqua-breed); the explicit
    // "tauros:paldea" override pins the canonical Combat Breed.
    expect(chooseVariantVariety("tauros", tauros, "paldea")).toBe(10250);
  });

  it("drops the -totem form for Alolan Raticate", () => {
    const raticate = [
      { name: "raticate", id: 20 },
      { name: "raticate-alola", id: 10092 },
      { name: "raticate-totem-alola", id: 10093 },
    ];
    expect(chooseVariantVariety("raticate", raticate, "alola")).toBe(10092);
  });
});

function variantCard(
  id: string,
  name: string,
  dex: number,
): CardEntry {
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

describe("discoverVariants", () => {
  it("groups region-prefixed Pokémon by (region, baseDex) with their cardIds", () => {
    const cardsBySet = {
      a: [
        variantCard("a-1", "Alolan Vulpix", 37),
        variantCard("a-2", "Alolan Vulpix-GX", 37),
        variantCard("a-3", "Galarian Moltres", 146),
      ],
      b: [
        variantCard("b-1", "Alolan Vulpix", 37),
        // Dual-region dex: Meowth #52 hosts both alola and galar.
        variantCard("b-2", "Alolan Meowth", 52),
        variantCard("b-3", "Galarian Meowth", 52),
      ],
    };
    const { candidates } = discoverVariants(cardsBySet);
    const byKey = Object.fromEntries(
      candidates.map((c) => [`${c.region}-${c.baseDex}`, c]),
    );

    expect(byKey["alola-37"]!.baseName).toBe("Vulpix");
    expect(byKey["alola-37"]!.cardIds.sort()).toEqual(["a-1", "a-2", "b-1"]);
    expect(byKey["galar-146"]!.cardIds).toEqual(["a-3"]);
    // Meowth #52 → two distinct candidates, same baseDex.
    expect(byKey["alola-52"]!.cardIds).toEqual(["b-2"]);
    expect(byKey["galar-52"]!.cardIds).toEqual(["b-3"]);
  });

  it("ignores non-Pokémon cards and cards without a regional prefix", () => {
    const cardsBySet = {
      a: [
        variantCard("a-1", "Vulpix", 37),
        { ...variantCard("a-2", "Alolan Vulpix", 37), supertype: "Trainer" as const },
      ],
    };
    const { candidates } = discoverVariants(cardsBySet);
    expect(candidates).toEqual([]);
  });

  it("ignores tag-team regional cards", () => {
    const cardsBySet = {
      a: [variantCard("a-1", "Alolan Ninetales & Vulpix-GX", 38)],
    };
    const { candidates } = discoverVariants(cardsBySet);
    expect(candidates).toEqual([]);
  });
});
