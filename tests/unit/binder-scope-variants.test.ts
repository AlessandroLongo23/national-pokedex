import { describe, it, expect } from "vitest";
import { pokedexCoverage, pickDisplayCardId } from "@/lib/data/binder-scope";
import type { CardEntry, RegionalVariant } from "@/lib/data/types";

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
    subtypes: ["Basic"],
    artist: "Alpha",
    imageSmall: "",
    imageLarge: "",
    ...overrides,
  };
}

// Alolan Vulpix #37 variant card; base Vulpix #37 card; region-exclusive
// Clodsire #980 card (region-prefixed name in real data but NO variantFormKey,
// per the orphan-card invariant) credits its base dex like any ordinary card.
const baseVulpix = card({ id: "set-37base", dex: [37] });
const alolanVulpix = card({ id: "set-37alola", dex: [37], variantFormKey: "alola-vulpix" });
const clodsire = card({ id: "set-980", dex: [980] }); // region-exclusive: no variantFormKey

const variants: RegionalVariant[] = [
  { variantKey: "alola-vulpix", displayName: "Alolan Vulpix", region: "alola", baseDex: 37, gen: 1 },
];

describe("pokedexCoverage — variant awareness", () => {
  it("variant card still credits base dex when toggle is OFF", () => {
    const owned = new Set(["set-37alola"]);
    const cov = pokedexCoverage(
      { dexFrom: 1, dexTo: 50 },
      owned,
      [baseVulpix, alolanVulpix],
    );
    expect(cov.covered.has(37)).toBe(true);
    expect(cov.variantForms).toEqual([]);
    expect(cov.coveredVariantForms.size).toBe(0);
  });

  it("variant card is excluded from dex contribution when toggle is ON", () => {
    const owned = new Set(["set-37alola"]); // only the Alolan card owned
    const cov = pokedexCoverage(
      { dexFrom: 1, dexTo: 50 },
      owned,
      [baseVulpix, alolanVulpix],
      undefined,
      { treatVariantsAsSeparate: true, variantPlacement: "appended", variants },
    );
    // #37 NOT covered: the only owned #37 card is a variant.
    expect(cov.covered.has(37)).toBe(false);
    // The variant form is surfaced and counted as covered.
    expect(cov.variantForms.map((f) => f.variantKey)).toEqual(["alola-vulpix"]);
    expect([...cov.coveredVariantForms]).toEqual(["alola-vulpix"]);
  });

  it("base card still credits #37 when only the base print is owned and toggle ON", () => {
    const owned = new Set(["set-37base"]);
    const cov = pokedexCoverage(
      { dexFrom: 1, dexTo: 50 },
      owned,
      [baseVulpix, alolanVulpix],
      undefined,
      { treatVariantsAsSeparate: true, variantPlacement: "inline", variants },
    );
    expect(cov.covered.has(37)).toBe(true);
    expect(cov.variantForms.map((f) => f.variantKey)).toEqual(["alola-vulpix"]);
    expect(cov.coveredVariantForms.size).toBe(0); // variant form not owned
  });

  it("placement 'separate' yields no variantForms in the binder", () => {
    const owned = new Set(["set-37alola"]);
    const cov = pokedexCoverage(
      { dexFrom: 1, dexTo: 50 },
      owned,
      [baseVulpix, alolanVulpix],
      undefined,
      { treatVariantsAsSeparate: true, variantPlacement: "separate", variants },
    );
    expect(cov.covered.has(37)).toBe(false); // variant card still excluded from dex
    expect(cov.variantForms).toEqual([]);
    expect(cov.coveredVariantForms.size).toBe(0);
  });

  it("variantForms are filtered to forms whose baseDex is in range", () => {
    const owned = new Set<string>();
    const cov = pokedexCoverage(
      { dexFrom: 1, dexTo: 30 }, // #37 out of range
      owned,
      [baseVulpix, alolanVulpix],
      undefined,
      { treatVariantsAsSeparate: true, variantPlacement: "appended", variants },
    );
    expect(cov.variantForms).toEqual([]);
  });

  it("region-exclusive (no variantFormKey) card credits its base dex with toggle ON", () => {
    const owned = new Set(["set-980"]);
    const cov = pokedexCoverage(
      { dexFrom: 950, dexTo: 1000 },
      owned,
      [clodsire],
      undefined,
      { treatVariantsAsSeparate: true, variantPlacement: "appended", variants },
    );
    expect(cov.covered.has(980)).toBe(true);
    expect(cov.variantForms).toEqual([]);
  });

  it("megas and variants compose: both excluded from dex, both surfaced", () => {
    const megaCharizard = card({ id: "set-6mega", dex: [6], megaFormKey: "mega-charizard-x" });
    const alolanVulpix2 = card({ id: "set-37alola", dex: [37], variantFormKey: "alola-vulpix" });
    const owned = new Set(["set-6mega", "set-37alola"]);
    const cov = pokedexCoverage(
      { dexFrom: 1, dexTo: 50 },
      owned,
      [megaCharizard, alolanVulpix2],
      {
        treatMegasAsSeparate: true,
        megaPlacement: "appended",
        megas: [
          { formKey: "mega-charizard-x", displayName: "Mega Charizard X", baseDex: 6, gen: 1, isPrimal: false },
        ],
      },
      { treatVariantsAsSeparate: true, variantPlacement: "appended", variants },
    );
    expect(cov.covered.has(6)).toBe(false);
    expect(cov.covered.has(37)).toBe(false);
    expect([...cov.coveredMegaForms]).toEqual(["mega-charizard-x"]);
    expect([...cov.coveredVariantForms]).toEqual(["alola-vulpix"]);
  });
});

describe("pickDisplayCardId — excludeVariants", () => {
  it("filters out variant cards when excludeVariants is true", () => {
    const base = card({ id: "set-37base", dex: [37], rarity: "Rare" });
    const variant = card({ id: "set-37alola", dex: [37], rarity: "UltraRare", variantFormKey: "alola-vulpix" });
    // Without exclusion the higher-rarity variant would win.
    expect(pickDisplayCardId(undefined, [base, variant], false, false)).toBe("set-37alola");
    // With exclusion the variant drops out and the base print represents #37.
    expect(pickDisplayCardId(undefined, [base, variant], false, true)).toBe("set-37base");
  });

  it("a stale override pointing at a variant card falls through when excludeVariants is true", () => {
    const base = card({ id: "set-37base", dex: [37], rarity: "Rare" });
    const variant = card({ id: "set-37alola", dex: [37], rarity: "UltraRare", variantFormKey: "alola-vulpix" });
    expect(pickDisplayCardId("set-37alola", [base, variant], false, true)).toBe("set-37base");
  });

  it("excludeMegas and excludeVariants compose", () => {
    const base = card({ id: "set-6base", dex: [6], rarity: "Rare" });
    const mega = card({ id: "set-6mega", dex: [6], rarity: "UltraRare", megaFormKey: "mega-charizard-x" });
    const variant = card({ id: "set-6var", dex: [6], rarity: "SecretRare", variantFormKey: "galar-something" });
    expect(pickDisplayCardId(undefined, [base, mega, variant], true, true)).toBe("set-6base");
  });
});
