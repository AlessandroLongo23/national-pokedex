import { describe, it, expect } from "vitest";
import {
  filterByScope,
  filterCardsByIds,
  distinctArtists,
  pokedexCoverage,
} from "@/lib/data/binder-scope";
import type { CardEntry } from "@/lib/data/types";

function card(overrides: Partial<CardEntry>): CardEntry {
  return {
    id: "x-1",
    name: "Card",
    setId: "x",
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
