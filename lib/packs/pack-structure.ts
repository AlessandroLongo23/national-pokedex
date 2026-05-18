import type { RarityBucket } from "@/lib/data/types";

export type SlotKind = "uniform" | "weighted" | "reverse";

export interface UniformSlot {
  kind: "uniform";
  from: RarityBucket;
  count: number;
}

export interface WeightedSlot {
  kind: "weighted";
  weights: Partial<Record<RarityBucket, number>>;
  count: number;
}

export interface ReverseSlot {
  kind: "reverse";
  pool: ReadonlyArray<RarityBucket>;
  count: number;
}

export type PackSlot = UniformSlot | WeightedSlot | ReverseSlot;

// SV/ME-era "rare slot" weights — community sources (DigitalTQ, TCGPlayer,
// PokéBeach). These are estimates; pixel-perfect tuning is deferred.
const SV_RARE_SLOT_WEIGHTS: WeightedSlot["weights"] = {
  Rare: 0.553,
  DoubleRare: 0.2,
  UltraRare: 0.067,
  IllustrationRare: 0.077,
  SpecialIllustrationRare: 0.031,
  HyperRare: 0.012,
};

const REVERSE_POOL: ReverseSlot["pool"] = ["Common", "Uncommon", "Rare"];

export const SV_PACK_SLOTS: PackSlot[] = [
  { kind: "uniform", from: "Common", count: 4 },
  { kind: "uniform", from: "Uncommon", count: 3 },
  { kind: "weighted", weights: SV_RARE_SLOT_WEIGHTS, count: 1 },
  { kind: "reverse", pool: REVERSE_POOL, count: 2 },
];

// Sword & Shield: same shape as SV but V/VMAX/VSTAR live in their mapped
// buckets; weights tilt slightly more toward Double Rare since V was very
// common in that era.
const SS_RARE_SLOT_WEIGHTS: WeightedSlot["weights"] = {
  Rare: 0.55,
  DoubleRare: 0.25,
  UltraRare: 0.08,
  IllustrationRare: 0.05,
  SpecialIllustrationRare: 0.02,
  HyperRare: 0.01,
};

export const SS_PACK_SLOTS: PackSlot[] = [
  { kind: "uniform", from: "Common", count: 4 },
  { kind: "uniform", from: "Uncommon", count: 3 },
  { kind: "weighted", weights: SS_RARE_SLOT_WEIGHTS, count: 1 },
  { kind: "reverse", pool: REVERSE_POOL, count: 2 },
];

// Sun & Moon: pre-SV booster shape — 6 commons, 3 uncommons, 1 rare slot,
// 1 reverse holo. GX-era weights consolidate to Double Rare for GX, Ultra
// Rare for tag teams and shinies.
const SM_RARE_SLOT_WEIGHTS: WeightedSlot["weights"] = {
  Rare: 0.6,
  DoubleRare: 0.22,
  UltraRare: 0.12,
  IllustrationRare: 0.04,
  HyperRare: 0.02,
};

export const SM_PACK_SLOTS: PackSlot[] = [
  { kind: "uniform", from: "Common", count: 6 },
  { kind: "uniform", from: "Uncommon", count: 3 },
  { kind: "weighted", weights: SM_RARE_SLOT_WEIGHTS, count: 1 },
  { kind: "reverse", pool: REVERSE_POOL, count: 1 },
];

// Legacy generic (XY and earlier): 5 commons, 3 uncommons, 1 rare slot
// (mostly plain Rare, some EX/BREAK), 1 reverse-holo parallel.
const LEGACY_RARE_SLOT_WEIGHTS: WeightedSlot["weights"] = {
  Rare: 0.78,
  DoubleRare: 0.15,
  UltraRare: 0.06,
  HyperRare: 0.01,
};

export const LEGACY_PACK_SLOTS: PackSlot[] = [
  { kind: "uniform", from: "Common", count: 5 },
  { kind: "uniform", from: "Uncommon", count: 3 },
  { kind: "weighted", weights: LEGACY_RARE_SLOT_WEIGHTS, count: 1 },
  { kind: "reverse", pool: REVERSE_POOL, count: 1 },
];

const SERIES_SLOTS: Record<string, PackSlot[]> = {
  "Scarlet & Violet": SV_PACK_SLOTS,
  "Mega Evolution": SV_PACK_SLOTS,
  "Sword & Shield": SS_PACK_SLOTS,
  "Sun & Moon": SM_PACK_SLOTS,
};

export function slotsForSeries(series: string): PackSlot[] {
  return SERIES_SLOTS[series] ?? LEGACY_PACK_SLOTS;
}
