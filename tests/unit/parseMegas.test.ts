import { describe, it, expect } from "vitest";
import { normalizeMegaName, discoverMegas } from "@/scripts/ingest/parseMegas";
import type { CardEntry } from "@/lib/data/types";

describe("normalizeMegaName", () => {
  it("normalises legacy 'M Name-EX' to the generic Mega form", () => {
    expect(normalizeMegaName("M Charizard-EX")).toEqual({
      formKey: "mega-charizard",
      displayName: "Mega Charizard",
      isPrimal: false,
    });
  });

  it("preserves the X/Y suffix in modern Mega Evolutions printings", () => {
    expect(normalizeMegaName("Mega Charizard X ex")).toEqual({
      formKey: "mega-charizard-x",
      displayName: "Mega Charizard X",
      isPrimal: false,
    });
    expect(normalizeMegaName("Mega Mewtwo Y ex")).toEqual({
      formKey: "mega-mewtwo-y",
      displayName: "Mega Mewtwo Y",
      isPrimal: false,
    });
  });

  it("tags Primal forms with isPrimal", () => {
    expect(normalizeMegaName("Primal Kyogre-EX")).toEqual({
      formKey: "primal-kyogre",
      displayName: "Primal Kyogre",
      isPrimal: true,
    });
    expect(normalizeMegaName("Primal Groudon-EX")).toEqual({
      formKey: "primal-groudon",
      displayName: "Primal Groudon",
      isPrimal: true,
    });
  });

  it("rejects tag-team / dual-Pokémon Mega cards", () => {
    expect(normalizeMegaName("Mega Sableye & Tyranitar-GX")).toBeNull();
    expect(normalizeMegaName("Mega Lopunny & Jigglypuff-GX")).toBeNull();
  });

  it("rejects MEGA-subtype cards whose name lacks a recognised prefix", () => {
    expect(normalizeMegaName("Charizard")).toBeNull();
    expect(normalizeMegaName("Mystery Pokémon")).toBeNull();
  });

  it("handles names without a product suffix", () => {
    expect(normalizeMegaName("Mega Lucario")).toEqual({
      formKey: "mega-lucario",
      displayName: "Mega Lucario",
      isPrimal: false,
    });
  });

  it("strips a variety of product suffixes (EX, GX, V, VMAX, VSTAR, lowercase ex)", () => {
    expect(normalizeMegaName("M Lucario-EX")?.formKey).toBe("mega-lucario");
    expect(normalizeMegaName("Mega Lucario GX")?.formKey).toBe("mega-lucario");
    expect(normalizeMegaName("Mega Lucario V")?.formKey).toBe("mega-lucario");
    expect(normalizeMegaName("Mega Lucario VMAX")?.formKey).toBe("mega-lucario");
    expect(normalizeMegaName("Mega Lucario VSTAR")?.formKey).toBe("mega-lucario");
    expect(normalizeMegaName("Mega Lucario ex")?.formKey).toBe("mega-lucario");
  });
});

function megaCard(id: string, name: string, dex: number, formKey: string): CardEntry {
  return {
    id,
    name,
    setId: "test",
    supertype: "Pokémon",
    number: "1",
    numberInt: 1,
    rarity: "DoubleRare",
    rarityRaw: "Double Rare",
    dex: [dex],
    types: [],
    subtypes: ["MEGA"],
    imageSmall: "",
    imageLarge: "",
    megaFormKey: formKey,
  };
}

describe("discoverMegas", () => {
  it("groups cards by formKey, captures baseDex from card.dex[0], and sorts by baseDex", () => {
    const cardsBySet = {
      me1: [
        megaCard("me1-1", "Mega Charizard X ex", 6, "mega-charizard-x"),
        megaCard("me1-2", "Mega Charizard Y ex", 6, "mega-charizard-y"),
        megaCard("me1-3", "Mega Charizard X ex", 6, "mega-charizard-x"),
      ],
      xy5: [
        megaCard("xy5-1", "Primal Kyogre-EX", 382, "primal-kyogre"),
        megaCard("xy1-1", "M Venusaur-EX", 3, "mega-venusaur"),
      ],
    };
    const { megas, cardIndexByMega } = discoverMegas(cardsBySet);

    expect(megas.map((m) => m.formKey)).toEqual([
      "mega-venusaur",
      "mega-charizard-x",
      "mega-charizard-y",
      "primal-kyogre",
    ]);
    expect(megas.find((m) => m.formKey === "primal-kyogre")?.isPrimal).toBe(true);
    expect(cardIndexByMega["mega-charizard-x"]).toEqual(["me1-1", "me1-3"]);
    expect(cardIndexByMega["mega-charizard-y"]).toEqual(["me1-2"]);
  });

  it("skips cards without a megaFormKey", () => {
    const cardsBySet = {
      sv1: [
        {
          ...megaCard("sv1-1", "Charizard", 6, ""),
          megaFormKey: undefined,
          subtypes: [],
        } as CardEntry,
      ],
    };
    const { megas } = discoverMegas(cardsBySet);
    expect(megas).toEqual([]);
  });

  it("derives generation from baseDex", () => {
    const cardsBySet = {
      me1: [megaCard("me1-1", "Mega Lucario ex", 448, "mega-lucario")],
    };
    const { megas } = discoverMegas(cardsBySet);
    expect(megas[0]?.gen).toBe(4);
  });
});
