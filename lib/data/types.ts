export type Generation = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9;

export interface PokedexEntry {
  dex: number;
  name: string;
  gen: Generation;
}

export interface SetInfo {
  id: string;
  name: string;
  series: string;
  releaseDate: string;
  dexNumbers: number[];
  uniqueCount: number;
  distinctPokemonCount: number;
  cardCount: number;
  ptcgoCode?: string;
  logoUrl?: string;
  symbolUrl?: string;
}

export interface Coverage {
  totalCovered: number;
  totalMissing: number;
  byGen: Record<Generation, { covered: number; total: number }>;
  missingDex: number[];
}

export interface GreedyEntry {
  rank: number;
  setId: string;
  setName: string;
  newCount: number;
  cumulative: number;
  releaseDate: string;
}

export type RarityBucket =
  | "Common"
  | "Uncommon"
  | "Rare"
  | "DoubleRare"
  | "UltraRare"
  | "IllustrationRare"
  | "SpecialIllustrationRare"
  | "HyperRare";

export type Rarity = RarityBucket | "Promo" | "Unknown";

export type Supertype = "Pokémon" | "Trainer" | "Energy";

export interface RarityPoolCard {
  supertype: Supertype;
  dex: number[];
}

export type SetRarityPool = Record<RarityBucket, RarityPoolCard[]>;

export type SetPools = Record<string, SetRarityPool>;

export interface BoosterWrapper {
  title: string;
  name: string;
  url: string;
  width: number;
  height: number;
}

export type BoosterManifest = Record<string, BoosterWrapper[]>;

// Maps from pokemontcg.io identifiers to TCGplayer identifiers, harvested
// from tcgcsv.com. Used at runtime as a TCGplayer-price fallback for sets
// where pokemontcg.io's nightly price snapshot is empty (typically new
// releases).
export interface TcgCsvMap {
  // pokemontcg.io setId → tcgcsv groupId
  groups: Record<string, number>;
  // pokemontcg.io cardId → tcgplayer productId
  products: Record<string, number>;
}

export interface CardEntry {
  id: string;
  name: string;
  setId: string;
  supertype: Supertype;
  number: string;
  numberInt: number;
  rarity: Rarity;
  rarityRaw: string;
  dex: number[];
  types: string[];
  hp?: number;
  subtypes: string[];
  evolvesFrom?: string;
  artist?: string;
  regulationMark?: string;
  imageSmall: string;
  imageLarge: string;
  // Set for Pokémon cards whose `subtypes` includes "MEGA" and whose name
  // resolves to a known single-Pokémon Mega/Primal form. Tag-team cards
  // (names containing " & ") never get a megaFormKey even though they carry
  // the MEGA subtype.
  megaFormKey?: string;
  // Set for Pokémon cards whose name carries a regional prefix (Alolan /
  // Galarian / Hisuian / Paldean) AND whose (region, baseDex) resolved to a
  // true variant in variants.json. Assigned ONLY from the resolved
  // cardIndexByVariant during ingest (never from the name prefix alone), so
  // region-exclusive region-prefixed cards (e.g. Paldean Clodsire) carry no
  // variantFormKey and remain ordinary base-dex cards. A card has at most one
  // of megaFormKey / variantFormKey, or neither.
  variantFormKey?: string;
}

export type CardIndex = Record<number, string[]>;

export interface MegaForm {
  formKey: string;
  displayName: string;
  baseDex: number;
  gen: Generation;
  isPrimal: boolean;
  /** PokeAPI "form id" for this Mega/Primal's official artwork sprite
   * (`/official-artwork/{id}.png`) — e.g. 10034 for Mega Charizard X, 10282
   * for Mega Meganium. Resolved during ingest by `resolveMegaArtwork`; absent
   * for any form PokeAPI doesn't list yet, in which case the cell falls back
   * to the base species art. */
  artworkId?: number;
}

export type MegaIndex = Record<string, string[]>;

export type VariantRegion = "alola" | "galar" | "hisui" | "paldea";

export interface RegionalVariant {
  variantKey: string; // "alola-vulpix", "galar-darmanitan", "hisui-basculin"
  displayName: string; // "Alolan Vulpix", "Galarian Darmanitan"
  region: VariantRegion;
  baseDex: number; // 37
  gen: Generation; // genOf(baseDex)
  /** The variant's OWN types, captured from its PokeAPI form at ingest — NOT
   * the base species' types. A regional variant is usually re-typed (Galarian
   * Zapdos is Fighting/Flying, not the base Zapdos's Electric/Flying; Alolan
   * Vulpix is Ice, not Fire). Capitalised, e.g. ["Fighting", "Flying"]. */
  types: string[];
  /** PokeAPI "form id" for THIS form's official-artwork sprite
   * (`/official-artwork/{id}.png`) — e.g. 10103 for Alolan Vulpix. Resolved
   * during ingest by `resolveVariantArtwork`; absent only for a form PokeAPI
   * doesn't list, in which case the cell falls back to the base species art. */
  artworkId?: number;
}

export type VariantIndex = Record<string, string[]>; // variantKey → cardId[]

export interface SpeciesEntry {
  dex: number;
  name: string;
  genus: string;
  heightDm: number;
  weightHg: number;
  types: string[];
  abilities: { name: string; hidden: boolean }[];
  evolutionChain: number[][];
  flavorText: string;
  generation: number;
  artworkUrl: string;
}

export type SpeciesIndex = Record<number, SpeciesEntry>;

export const RARITY_ORDER: Rarity[] = [
  "Common",
  "Uncommon",
  "Rare",
  "DoubleRare",
  "UltraRare",
  "IllustrationRare",
  "SpecialIllustrationRare",
  "HyperRare",
  "Promo",
  "Unknown",
];

export const RARITY_LABEL: Record<Rarity, string> = {
  Common: "Common",
  Uncommon: "Uncommon",
  Rare: "Rare",
  DoubleRare: "Double Rare",
  UltraRare: "Ultra Rare",
  IllustrationRare: "Illustration Rare",
  SpecialIllustrationRare: "Special Illustration Rare",
  HyperRare: "Hyper Rare",
  Promo: "Promo",
  Unknown: "Other",
};

export function genOf(dex: number): Generation {
  if (dex <= 151) return 1;
  if (dex <= 251) return 2;
  if (dex <= 386) return 3;
  if (dex <= 493) return 4;
  if (dex <= 649) return 5;
  if (dex <= 721) return 6;
  if (dex <= 809) return 7;
  if (dex <= 905) return 8;
  if (dex <= 1025) return 9;
  throw new Error(`Dex number out of range: ${dex}`);
}

export const GEN_NAMES: Record<Generation, string> = {
  1: "Kanto",
  2: "Johto",
  3: "Hoenn",
  4: "Sinnoh",
  5: "Unova",
  6: "Kalos",
  7: "Alola",
  8: "Galar",
  9: "Paldea",
};

export const GEN_RANGES: Record<Generation, [number, number]> = {
  1: [1, 151],
  2: [152, 251],
  3: [252, 386],
  4: [387, 493],
  5: [494, 649],
  6: [650, 721],
  7: [722, 809],
  8: [810, 905],
  9: [906, 1025],
};
