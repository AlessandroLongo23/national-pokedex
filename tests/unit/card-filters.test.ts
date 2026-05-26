import { describe, it, expect } from "vitest";
import {
  priceBucketOf,
  regionalFormOf,
} from "@/app/(dashboard)/_lib/card-filters";
import type { CardEntry } from "@/lib/data/types";

function card(overrides: Partial<CardEntry>): CardEntry {
  return {
    id: "x-1",
    name: "Pikachu",
    setId: "x",
    supertype: "Pokémon",
    number: "1",
    numberInt: 1,
    rarity: "Common",
    rarityRaw: "Common",
    dex: [25],
    types: ["Lightning"],
    subtypes: [],
    artist: undefined,
    imageSmall: "",
    imageLarge: "",
    ...overrides,
  };
}

describe("regionalFormOf", () => {
  it("returns the form for a card whose name starts with a region prefix", () => {
    expect(regionalFormOf(card({ name: "Alolan Vulpix" }))).toBe("Alolan");
    expect(regionalFormOf(card({ name: "Galarian Rapidash" }))).toBe("Galarian");
    expect(regionalFormOf(card({ name: "Hisuian Zoroark" }))).toBe("Hisuian");
    expect(regionalFormOf(card({ name: "Paldean Tauros" }))).toBe("Paldean");
  });

  it("returns null for non-regional cards", () => {
    expect(regionalFormOf(card({ name: "Pikachu" }))).toBeNull();
    expect(regionalFormOf(card({ name: "Mega Charizard ex" }))).toBeNull();
    expect(regionalFormOf(card({ name: "Vulpix" }))).toBeNull();
  });

  it("does not match when the region word is part of a longer token", () => {
    // No space after the region prefix → not a regional form
    expect(regionalFormOf(card({ name: "Alolans" }))).toBeNull();
  });
});

describe("priceBucketOf", () => {
  it("maps undefined and non-positive prices to 'none'", () => {
    expect(priceBucketOf(undefined)).toBe("none");
    expect(priceBucketOf(0)).toBe("none");
    expect(priceBucketOf(-1)).toBe("none");
  });

  it("respects the < 1 boundary", () => {
    expect(priceBucketOf(0.01)).toBe("lt1");
    expect(priceBucketOf(0.99)).toBe("lt1");
    expect(priceBucketOf(1)).toBe("1to5");
  });

  it("respects the 1..5 boundary", () => {
    expect(priceBucketOf(4.99)).toBe("1to5");
    expect(priceBucketOf(5)).toBe("5to20");
  });

  it("respects the 5..20 boundary", () => {
    expect(priceBucketOf(19.99)).toBe("5to20");
    expect(priceBucketOf(20)).toBe("gte20");
  });

  it("maps large values to 'gte20'", () => {
    expect(priceBucketOf(123.45)).toBe("gte20");
    expect(priceBucketOf(9999)).toBe("gte20");
  });
});
