import type { CardEntry, Generation } from "@/lib/data/types";

export type RegionalForm = "Alolan" | "Galarian" | "Hisuian" | "Paldean";

export const REGIONAL_FORMS: readonly RegionalForm[] = [
  "Alolan",
  "Galarian",
  "Hisuian",
  "Paldean",
];

export function regionalFormOf(card: CardEntry): RegionalForm | null {
  const name = card.name;
  for (const form of REGIONAL_FORMS) {
    if (name.startsWith(`${form} `)) return form;
  }
  return null;
}

export const GENERATION_LABEL: Record<Generation, string> = {
  1: "Kanto",
  2: "Johto",
  3: "Hoenn",
  4: "Sinnoh",
  5: "Unova",
  6: "Kalos",
  7: "Alola",
  8: "Galar / Hisui",
  9: "Paldea",
};

export const GENERATIONS: readonly Generation[] = [1, 2, 3, 4, 5, 6, 7, 8, 9];

export type PriceBucket = "lt1" | "1to5" | "5to20" | "gte20" | "none";

export const PRICE_BUCKETS: readonly PriceBucket[] = [
  "lt1",
  "1to5",
  "5to20",
  "gte20",
  "none",
];

export function priceBucketLabel(bucket: PriceBucket, currencySymbol: string): string {
  switch (bucket) {
    case "lt1":
      return `< ${currencySymbol}1`;
    case "1to5":
      return `${currencySymbol}1–5`;
    case "5to20":
      return `${currencySymbol}5–20`;
    case "gte20":
      return `${currencySymbol}20+`;
    case "none":
      return "No price";
  }
}

// Maps a numeric price (or undefined) to its bucket. undefined → "none";
// 0 and negative are treated as "none" too — the price source has no real
// reading for the card. Boundaries: 1, 5, 20 (inclusive on the low side).
export function priceBucketOf(price: number | undefined): PriceBucket {
  if (price == null || price <= 0) return "none";
  if (price < 1) return "lt1";
  if (price < 5) return "1to5";
  if (price < 20) return "5to20";
  return "gte20";
}
