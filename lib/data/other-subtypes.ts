import type { CardEntry } from "./types";

export type OtherSubtype = "items" | "supporters" | "stadiums" | "tools" | "energies";

export const OTHER_SUBTYPES: readonly OtherSubtype[] = [
  "items",
  "supporters",
  "stadiums",
  "tools",
  "energies",
] as const;

export interface OtherSubtypeMeta {
  slug: OtherSubtype;
  label: string;
  blurb: string;
}

export const OTHER_SUBTYPE_META: Record<OtherSubtype, OtherSubtypeMeta> = {
  items: {
    slug: "items",
    label: "Items",
    blurb: "One-shot effects you discard after use.",
  },
  supporters: {
    slug: "supporters",
    label: "Supporters",
    blurb: "Once-per-turn cards featuring people from the world of Pokémon.",
  },
  stadiums: {
    slug: "stadiums",
    label: "Stadiums",
    blurb: "Persistent locations that change the rules of the field.",
  },
  tools: {
    slug: "tools",
    label: "Pokémon Tools",
    blurb: "Attach to a Pokémon to grant ongoing effects.",
  },
  energies: {
    slug: "energies",
    label: "Energies",
    blurb: "Basic and Special Energy cards across every set.",
  },
};

// pokemon-tcg-data uses both "Pokémon Tool" (modern) and "Tool" (legacy) — check both.
export const OTHER_SUBTYPE_PREDICATES: Record<OtherSubtype, (c: CardEntry) => boolean> = {
  items: (c) => c.supertype === "Trainer" && c.subtypes.includes("Item"),
  supporters: (c) => c.supertype === "Trainer" && c.subtypes.includes("Supporter"),
  stadiums: (c) => c.supertype === "Trainer" && c.subtypes.includes("Stadium"),
  tools: (c) =>
    c.supertype === "Trainer" &&
    (c.subtypes.includes("Pokémon Tool") || c.subtypes.includes("Tool")),
  energies: (c) => c.supertype === "Energy",
};

export type OtherCardsBySubtype = Record<OtherSubtype, CardEntry[]>;
