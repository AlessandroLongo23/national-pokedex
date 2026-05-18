import type {
  CardEntry,
  Rarity,
  RarityBucket,
  SetRarityPool,
  Supertype,
} from "@/lib/data/types";

export interface RawCard {
  id: string;
  name: string;
  supertype: string;
  rarity?: string;
  subtypes?: string[];
  hp?: string;
  types?: string[];
  evolvesFrom?: string;
  number: string;
  artist?: string;
  regulationMark?: string;
  nationalPokedexNumbers?: number[];
  images?: { small?: string; large?: string };
}

export interface SetCardSummary {
  cards: CardEntry[];
  dexNumbers: number[];
  distinctPokemonCount: number;
  cardCount: number;
  rarityPool: SetRarityPool;
}

const RARITY_MAP: Record<string, RarityBucket> = {
  Common: "Common",
  Uncommon: "Uncommon",
  Rare: "Rare",
  "Double Rare": "DoubleRare",
  "Ultra Rare": "UltraRare",
  "Illustration Rare": "IllustrationRare",
  "Special Illustration Rare": "SpecialIllustrationRare",
  "Hyper Rare": "HyperRare",
  // Legacy rarity strings — approximate mappings so the simulator still
  // has something to pull from. Pixel-perfect tuning is deferred.
  "Rare Holo": "Rare",
  "Rare Holo EX": "DoubleRare",
  "Rare Holo GX": "DoubleRare",
  "Rare Holo V": "DoubleRare",
  "Rare Holo VMAX": "UltraRare",
  "Rare Holo VSTAR": "UltraRare",
  "Rare Holo LV.X": "UltraRare",
  "Rare Holo Star": "UltraRare",
  "Rare BREAK": "DoubleRare",
  "Rare Prime": "Rare",
  "Rare ACE": "UltraRare",
  "Rare Prism Star": "UltraRare",
  "Rare Shiny": "IllustrationRare",
  "Rare Shiny GX": "SpecialIllustrationRare",
  "Rare Shining": "UltraRare",
  "Rare Ultra": "UltraRare",
  "Rare Secret": "HyperRare",
  "Rare Rainbow": "HyperRare",
  "Amazing Rare": "UltraRare",
  "Radiant Rare": "UltraRare",
  LEGEND: "UltraRare",
  "Trainer Gallery Rare Holo": "IllustrationRare",
};

function emptyPool(): SetRarityPool {
  return {
    Common: [],
    Uncommon: [],
    Rare: [],
    DoubleRare: [],
    UltraRare: [],
    IllustrationRare: [],
    SpecialIllustrationRare: [],
    HyperRare: [],
  };
}

function normaliseSupertype(s: string): Supertype {
  if (s === "Pokémon" || s === "Trainer" || s === "Energy") return s;
  return "Trainer";
}

function parseNumberInt(s: string): number {
  const plain = s.match(/^(\d+)$/);
  if (plain) return parseInt(plain[1]!, 10);
  const tg = s.match(/^TG(\d+)$/i);
  if (tg) return 1000 + parseInt(tg[1]!, 10);
  const gg = s.match(/^GG(\d+)$/i);
  if (gg) return 2000 + parseInt(gg[1]!, 10);
  const lead = s.match(/^(\d+)/);
  return lead ? 9000 + parseInt(lead[1]!, 10) : 9999;
}

function resolveRarity(raw: string | undefined, bucket: RarityBucket | undefined): Rarity {
  if (bucket) return bucket;
  if (raw === "Promo") return "Promo";
  return "Unknown";
}

export function parseSetCards(setId: string, cards: RawCard[]): SetCardSummary {
  const dexSet = new Set<number>();
  const pool = emptyPool();
  const out: CardEntry[] = [];

  for (const card of cards) {
    const dex = card.nationalPokedexNumbers ?? [];
    const supertype = normaliseSupertype(card.supertype);
    const rarityRaw = card.rarity ?? "";
    const bucket = card.rarity ? RARITY_MAP[card.rarity] : undefined;

    if (supertype === "Pokémon") {
      for (const n of dex) dexSet.add(n);
    }

    out.push({
      id: card.id,
      name: card.name,
      setId,
      supertype,
      number: card.number,
      numberInt: parseNumberInt(card.number),
      rarity: resolveRarity(card.rarity, bucket),
      rarityRaw,
      dex,
      types: card.types ?? [],
      hp: card.hp ? Number(card.hp) || undefined : undefined,
      subtypes: card.subtypes ?? [],
      evolvesFrom: card.evolvesFrom,
      artist: card.artist,
      regulationMark: card.regulationMark,
      imageSmall:
        card.images?.small ?? `https://images.pokemontcg.io/${setId}/${card.number}.png`,
      imageLarge:
        card.images?.large ?? `https://images.pokemontcg.io/${setId}/${card.number}_hires.png`,
    });

    if (!bucket) continue;
    pool[bucket].push({ supertype, dex });
  }

  out.sort((a, b) => a.numberInt - b.numberInt);

  return {
    cards: out,
    dexNumbers: [...dexSet],
    distinctPokemonCount: dexSet.size,
    cardCount: out.length,
    rarityPool: pool,
  };
}
