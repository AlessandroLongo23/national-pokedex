import type { Rarity } from "@/lib/data/types";

// Per-rarity accent used on card captions and list rows. Shared so the grid
// tile and the wishlist list row stay in lockstep.
export const RARITY_COLOR: Record<Rarity, string> = {
  Common: "text-muted",
  Uncommon: "text-[#86efac]",
  Rare: "text-[#93c5fd]",
  DoubleRare: "text-[#60a5fa]",
  UltraRare: "text-[#c4b5fd]",
  IllustrationRare: "text-[#f0abfc]",
  SpecialIllustrationRare: "text-[#fda4af]",
  HyperRare: "text-[#fcd34d]",
  Promo: "text-muted",
  Unknown: "text-muted",
};

export const RARITY_ABBR: Record<Rarity, string> = {
  Common: "C",
  Uncommon: "U",
  Rare: "R",
  DoubleRare: "DR",
  UltraRare: "UR",
  IllustrationRare: "IR",
  SpecialIllustrationRare: "SIR",
  HyperRare: "HR",
  Promo: "PR",
  Unknown: "—",
};
