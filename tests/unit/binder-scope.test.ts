import { describe, it, expect } from "vitest";
import {
  filterByScope,
  filterCardsByIds,
  distinctArtists,
  pokedexCoverage,
  pickDisplayCardId,
  ownedCardsByDex,
} from "@/lib/data/binder-scope";
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
    subtypes: ["Basic"],
    artist: "Alpha",
    imageSmall: "",
    imageLarge: "",
    ...overrides,
  };
}

const c1 = card({ id: "a-1", setId: "a", number: "1", dex: [25], types: ["Lightning"], artist: "Ken Sugimori" });
const c2 = card({ id: "a-1a", setId: "a", number: "1a", dex: [25, 26], types: ["Lightning"], artist: "ken sugimori" }); // case differs
const c3 = card({ id: "a-2", setId: "a", number: "2", dex: [4], types: ["Fire", "Colorless"], artist: "Mitsuhiro Arita" });
const c4 = card({ id: "b-1", setId: "b", number: "1", dex: [25], types: ["Lightning"], artist: "Ken Sugimori" });
const c5 = card({ id: "b-3", setId: "b", number: "3", dex: [382], types: ["Water"], artist: undefined });
const cards = [c1, c2, c3, c4, c5];

describe("filterByScope", () => {
  it("master_set returns only cards in the given set", () => {
    const r = filterByScope(cards, "master_set", { setId: "a" });
    expect(r.map((c) => c.id).sort()).toEqual(["a-1", "a-1a", "a-2"]);
  });

  it("pokemon matches both single-dex and shared-dex cards", () => {
    const r = filterByScope(cards, "pokemon", { dex: 25 });
    expect(r.map((c) => c.id).sort()).toEqual(["a-1", "a-1a", "b-1"]);
    // shared-dex card a-1a (dex [25,26]) is also matched by dex: 26
    const r26 = filterByScope(cards, "pokemon", { dex: 26 });
    expect(r26.map((c) => c.id)).toEqual(["a-1a"]);
  });

  it("artist is a case-sensitive exact match", () => {
    const r = filterByScope(cards, "artist", { artist: "Ken Sugimori" });
    expect(r.map((c) => c.id).sort()).toEqual(["a-1", "b-1"]);
    // lower-case doesn't collapse
    const rLower = filterByScope(cards, "artist", { artist: "ken sugimori" });
    expect(rLower.map((c) => c.id)).toEqual(["a-1a"]);
    // trailing space doesn't match
    const rSpace = filterByScope(cards, "artist", { artist: "Ken Sugimori " });
    expect(rSpace).toEqual([]);
  });

  it("type matches dual-type cards", () => {
    const r = filterByScope(cards, "type", { type: "Fire" });
    expect(r.map((c) => c.id)).toEqual(["a-2"]);
    const rC = filterByScope(cards, "type", { type: "Colorless" });
    expect(rC.map((c) => c.id)).toEqual(["a-2"]);
    const rL = filterByScope(cards, "type", { type: "Lightning" });
    expect(rL.map((c) => c.id).sort()).toEqual(["a-1", "a-1a", "b-1"]);
  });

  it("position matches the exact card number string", () => {
    const r1 = filterByScope(cards, "position", { number: "1" });
    expect(r1.map((c) => c.id).sort()).toEqual(["a-1", "b-1"]);
    // "1a" must not match "1"
    const r1a = filterByScope(cards, "position", { number: "1a" });
    expect(r1a.map((c) => c.id)).toEqual(["a-1a"]);
    // missing position returns []
    const rMiss = filterByScope(cards, "position", { number: "999" });
    expect(rMiss).toEqual([]);
  });

  it("custom returns [] regardless of scope params", () => {
    expect(filterByScope(cards, "custom", {})).toEqual([]);
  });

  it("pokedex returns cards whose dex intersects the range", () => {
    // c1, c2 dex 25 (a-1a is 25,26); c3 dex 4; c4 dex 25; c5 dex 382.
    const r1to30 = filterByScope(cards, "pokedex", { dexFrom: 1, dexTo: 30 });
    expect(r1to30.map((c) => c.id).sort()).toEqual(["a-1", "a-1a", "a-2", "b-1"]);
    const rPaldea = filterByScope(cards, "pokedex", { dexFrom: 906, dexTo: 1025 });
    expect(rPaldea).toEqual([]);
  });

  it("pokedex tolerates dexFrom > dexTo by treating it as a range", () => {
    const r = filterByScope(cards, "pokedex", { dexFrom: 30, dexTo: 1 });
    expect(r.map((c) => c.id).sort()).toEqual(["a-1", "a-1a", "a-2", "b-1"]);
  });

  it("subtype 'trainers' returns every Trainer-supertype card", () => {
    const t1 = card({ id: "t-1", supertype: "Trainer", subtypes: ["Item"], dex: [] });
    const t2 = card({ id: "t-2", supertype: "Trainer", subtypes: ["Stadium"], dex: [] });
    const e1 = card({ id: "e-1", supertype: "Energy", subtypes: ["Basic"], dex: [] });
    const all = [...cards, t1, t2, e1];
    const r = filterByScope(all, "subtype", { subtype: "trainers" });
    expect(r.map((c) => c.id).sort()).toEqual(["t-1", "t-2"]);
  });

  it("subtype 'stadiums' returns only Stadium-subtype Trainer cards", () => {
    const item = card({ id: "i-1", supertype: "Trainer", subtypes: ["Item"], dex: [] });
    const stadium = card({ id: "s-1", supertype: "Trainer", subtypes: ["Stadium"], dex: [] });
    const all = [...cards, item, stadium];
    const r = filterByScope(all, "subtype", { subtype: "stadiums" });
    expect(r.map((c) => c.id)).toEqual(["s-1"]);
  });

  it("subtype 'energies' returns only Energy-supertype cards", () => {
    const e = card({ id: "e-1", supertype: "Energy", subtypes: ["Special"], dex: [] });
    const all = [...cards, e];
    const r = filterByScope(all, "subtype", { subtype: "energies" });
    expect(r.map((c) => c.id)).toEqual(["e-1"]);
  });

  it("named_card matches by exact name across reprints", () => {
    const pr1 = card({ id: "x-1", name: "Professor's Research", supertype: "Trainer", dex: [] });
    const pr2 = card({ id: "y-1", name: "Professor's Research", supertype: "Trainer", dex: [] });
    const other = card({ id: "z-1", name: "Boss's Orders", supertype: "Trainer", dex: [] });
    const all = [pr1, pr2, other];
    const r = filterByScope(all, "named_card", { name: "Professor's Research" });
    expect(r.map((c) => c.id).sort()).toEqual(["x-1", "y-1"]);
  });
});

describe("pokedexCoverage", () => {
  const owned = new Set(["a-1", "b-3"]); // covers dex 25 (a-1) and 382 (b-3)

  it("returns sequential dex numbers and the covered subset", () => {
    const cov = pokedexCoverage({ dexFrom: 1, dexTo: 30 }, owned, cards);
    expect(cov.dexNumbers.length).toBe(30);
    expect(cov.dexNumbers[0]).toBe(1);
    expect(cov.dexNumbers[29]).toBe(30);
    expect([...cov.covered].sort()).toEqual([25]);
  });

  it("doesn't credit cards outside the range", () => {
    // b-3 has dex 382; 1..30 excludes it.
    const cov = pokedexCoverage({ dexFrom: 1, dexTo: 30 }, owned, cards);
    expect(cov.covered.has(382)).toBe(false);
  });

  it("includes a multi-dex card under each of its dex numbers in range", () => {
    const ownedDual = new Set(["a-1a"]); // dex 25, 26
    const cov = pokedexCoverage({ dexFrom: 20, dexTo: 30 }, ownedDual, cards);
    expect([...cov.covered].sort()).toEqual([25, 26]);
  });

  it("normalises swapped from/to bounds", () => {
    const cov = pokedexCoverage({ dexFrom: 30, dexTo: 1 }, owned, cards);
    expect(cov.dexNumbers.length).toBe(30);
    expect([...cov.covered].sort()).toEqual([25]);
  });
});

describe("pickDisplayCardId", () => {
  const common = card({ id: "x-1", rarity: "Common" });
  const uncommon = card({ id: "x-2", rarity: "Uncommon" });
  const rare = card({ id: "x-3", rarity: "Rare" });
  const ultra = card({ id: "x-4", rarity: "UltraRare" });

  it("returns null when nothing is owned", () => {
    expect(pickDisplayCardId(undefined, [])).toBeNull();
  });

  it("returns the only card when one is owned", () => {
    expect(pickDisplayCardId(undefined, [common])).toBe("x-1");
  });

  it("returns the highest-rarity card by default", () => {
    expect(pickDisplayCardId(undefined, [common, uncommon, rare])).toBe("x-3");
    expect(pickDisplayCardId(undefined, [ultra, rare, common])).toBe("x-4");
  });

  it("respects override when the chosen card is still owned", () => {
    expect(pickDisplayCardId("x-1", [common, ultra])).toBe("x-1");
  });

  it("ignores override when the chosen card is no longer owned", () => {
    // ghost card-id not present in ownedCardsForDex — fall back to default.
    expect(pickDisplayCardId("ghost-99", [common, ultra])).toBe("x-4");
  });

  it("breaks rarity ties by lexical id (lower id wins)", () => {
    const a = card({ id: "a-1", rarity: "Rare" });
    const b = card({ id: "b-1", rarity: "Rare" });
    expect(pickDisplayCardId(undefined, [b, a])).toBe("a-1");
  });
});

describe("ownedCardsByDex", () => {
  it("groups owned cards by every dex# they belong to", () => {
    const owned = new Set(["a-1", "a-1a", "b-3"]);
    const m = ownedCardsByDex(cards, owned);
    expect(m.get(25)?.map((c) => c.id).sort()).toEqual(["a-1", "a-1a"]);
    expect(m.get(26)?.map((c) => c.id)).toEqual(["a-1a"]);
    expect(m.get(382)?.map((c) => c.id)).toEqual(["b-3"]);
    expect(m.has(4)).toBe(false); // c3 (dex 4) is not owned
  });

  it("returns an empty map when nothing is owned", () => {
    expect(ownedCardsByDex(cards, new Set()).size).toBe(0);
  });
});

describe("filterCardsByIds", () => {
  it("returns cards whose id is in the set, dropping unknowns silently", () => {
    const r = filterCardsByIds(cards, ["a-1", "ghost-99", "b-3"]);
    expect(r.map((c) => c.id).sort()).toEqual(["a-1", "b-3"]);
  });

  it("empty input returns []", () => {
    expect(filterCardsByIds(cards, [])).toEqual([]);
  });
});

describe("distinctArtists", () => {
  it("returns sorted distinct non-empty artist names", () => {
    expect(distinctArtists(cards)).toEqual([
      "ken sugimori",
      "Ken Sugimori",
      "Mitsuhiro Arita",
    ]);
  });

  it("skips undefined artist fields", () => {
    const r = distinctArtists([c5]); // c5.artist is undefined
    expect(r).toEqual([]);
  });
});
