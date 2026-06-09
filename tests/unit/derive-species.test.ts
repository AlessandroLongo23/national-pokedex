import { describe, it, expect } from "vitest";
import { computeSpecies } from "../../app/(dashboard)/_lib/OwnedCardsContext";

// Fixture maps mirror the real module shape:
//   cardToDex:     card-id -> dex[]
//   cardToMega:    card-id -> mega formKey (only mega cards present)
//   cardToVariant: card-id -> variant variantKey (only variant cards present)
const cardToDex: Record<string, number[]> = {
  "plain-25": [25], // Pikachu, ordinary
  "mega-65": [65], // Alakazam, a Mega card
  "var-37": [37], // Alolan Vulpix card -> Vulpix #37
  "megavar-80": [80], // hypothetical card that is BOTH (defensive; never happens in data)
};
const cardToMega: Record<string, string> = {
  "mega-65": "mega-alakazam",
  "megavar-80": "mega-slowbro",
};
const cardToVariant: Record<string, string> = {
  "var-37": "alola-vulpix",
  "megavar-80": "galar-slowbro",
};

function opts(treatMegasAsSeparate: boolean, treatVariantsAsSeparate: boolean) {
  return { cardToDex, cardToMega, cardToVariant, treatMegasAsSeparate, treatVariantsAsSeparate };
}

function owned(...ids: string[]): Map<string, number> {
  return new Map(ids.map((id) => [id, 1]));
}

describe("computeSpecies", () => {
  it("both toggles off: every owned card credits its base dex", () => {
    const s = computeSpecies(owned("plain-25", "mega-65", "var-37"), opts(false, false));
    expect(s).toEqual(new Set([25, 65, 37]));
  });

  it("mega toggle on, variant toggle off: only mega card is skipped", () => {
    const s = computeSpecies(owned("plain-25", "mega-65", "var-37"), opts(true, false));
    expect(s).toEqual(new Set([25, 37])); // 65 dropped, 37 (variant) still credits base
  });

  it("variant toggle on, mega toggle off: only variant card is skipped", () => {
    const s = computeSpecies(owned("plain-25", "mega-65", "var-37"), opts(false, true));
    expect(s).toEqual(new Set([25, 65])); // 37 dropped, 65 (mega) still credits base
  });

  it("both toggles on: mega and variant skips compose", () => {
    const s = computeSpecies(owned("plain-25", "mega-65", "var-37"), opts(true, true));
    expect(s).toEqual(new Set([25])); // both 65 and 37 dropped
  });

  it("a card that is both mega and variant is skipped if either applicable toggle is on", () => {
    expect(computeSpecies(owned("megavar-80"), opts(true, false))).toEqual(new Set());
    expect(computeSpecies(owned("megavar-80"), opts(false, true))).toEqual(new Set());
    expect(computeSpecies(owned("megavar-80"), opts(false, false))).toEqual(new Set([80]));
  });
});
