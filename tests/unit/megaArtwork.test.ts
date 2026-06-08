import { describe, it, expect } from "vitest";
import { chooseMegaVariety, type VarietyForm } from "@/scripts/ingest/fetchMegaArtwork";

// PokeAPI lists each species' alternate forms as `{slug}-mega[-x|-y|-z]` /
// `{slug}-primal`, each with its own "form id" used in the artwork sprite path.
describe("chooseMegaVariety", () => {
  const charizard: VarietyForm[] = [
    { name: "charizard", id: 6 },
    { name: "charizard-mega-x", id: 10034 },
    { name: "charizard-mega-y", id: 10035 },
  ];

  it("matches an explicit -x / -y formKey to the corresponding variety", () => {
    expect(chooseMegaVariety("charizard", charizard, "mega-charizard-x", false)).toBe(10034);
    expect(chooseMegaVariety("charizard", charizard, "mega-charizard-y", false)).toBe(10035);
  });

  it("defaults a plain Mega to X when only X/Y variants exist", () => {
    // "M Charizard-EX" cards collapse to the plain `mega-charizard` key.
    expect(chooseMegaVariety("charizard", charizard, "mega-charizard", false)).toBe(10034);
    const mewtwo: VarietyForm[] = [
      { name: "mewtwo", id: 150 },
      { name: "mewtwo-mega-x", id: 10043 },
      { name: "mewtwo-mega-y", id: 10044 },
    ];
    expect(chooseMegaVariety("mewtwo", mewtwo, "mega-mewtwo", false)).toBe(10043);
  });

  it("prefers the classic bare Mega over Z-A's -mega-z variant", () => {
    const absol: VarietyForm[] = [
      { name: "absol", id: 359 },
      { name: "absol-mega", id: 10057 },
      { name: "absol-mega-z", id: 10288 },
    ];
    expect(chooseMegaVariety("absol", absol, "mega-absol", false)).toBe(10057);
  });

  it("resolves a single Mega form (incl. Legends Z-A additions)", () => {
    const meganium: VarietyForm[] = [
      { name: "meganium", id: 154 },
      { name: "meganium-mega", id: 10282 },
    ];
    expect(chooseMegaVariety("meganium", meganium, "mega-meganium", false)).toBe(10282);
  });

  it("resolves Primal forms via the -primal suffix", () => {
    const kyogre: VarietyForm[] = [
      { name: "kyogre", id: 382 },
      { name: "kyogre-primal", id: 10077 },
    ];
    expect(chooseMegaVariety("kyogre", kyogre, "primal-kyogre", true)).toBe(10077);
  });

  it("returns null when PokeAPI lists no matching variety", () => {
    const plain: VarietyForm[] = [{ name: "ditto", id: 132 }];
    expect(chooseMegaVariety("ditto", plain, "mega-ditto", false)).toBeNull();
  });
});
