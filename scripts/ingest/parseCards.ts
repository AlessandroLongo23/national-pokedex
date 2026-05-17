export interface RawCard {
  id: string;
  name: string;
  supertype: string;
  nationalPokedexNumbers?: number[];
}

export interface SetCardSummary {
  dexNumbers: number[];
  distinctPokemonCount: number;
}

export function parseSetCards(cards: RawCard[]): SetCardSummary {
  const set = new Set<number>();
  for (const card of cards) {
    if (card.supertype !== "Pokémon") continue;
    const nums = card.nationalPokedexNumbers ?? [];
    for (const n of nums) set.add(n);
  }
  return {
    dexNumbers: [...set],
    distinctPokemonCount: set.size,
  };
}
