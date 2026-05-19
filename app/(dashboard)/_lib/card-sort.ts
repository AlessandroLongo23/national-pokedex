import { POKEDEX, getSet } from "@/lib/data";
import { RARITY_ORDER, type CardEntry, type Rarity } from "@/lib/data/types";

export type CardSort = "number" | "rarity" | "pokemon" | "set";

const NAME_BY_DEX: Record<number, string> = Object.fromEntries(
  POKEDEX.map((p) => [p.dex, p.name]),
);
const GEN_BY_DEX: Record<number, number> = Object.fromEntries(
  POKEDEX.map((p) => [p.dex, p.gen]),
);

export function pokemonNameByDex(dex: number): string | undefined {
  return NAME_BY_DEX[dex];
}

export function genByDex(dex: number): number | undefined {
  return GEN_BY_DEX[dex];
}

export function sortCards(cards: CardEntry[], sort: CardSort): CardEntry[] {
  const copy = [...cards];
  switch (sort) {
    case "number":
      copy.sort((a, b) => a.setId.localeCompare(b.setId) || a.numberInt - b.numberInt);
      break;
    case "rarity": {
      const rank = (r: Rarity) => RARITY_ORDER.indexOf(r);
      copy.sort(
        (a, b) =>
          rank(a.rarity) - rank(b.rarity) ||
          a.setId.localeCompare(b.setId) ||
          a.numberInt - b.numberInt,
      );
      break;
    }
    case "pokemon":
      copy.sort(
        (a, b) =>
          (a.dex[0] ?? 9999) - (b.dex[0] ?? 9999) ||
          a.setId.localeCompare(b.setId) ||
          a.numberInt - b.numberInt,
      );
      break;
    case "set":
      copy.sort((a, b) => {
        const sa = getSet(a.setId);
        const sb = getSet(b.setId);
        if (!sa && !sb) return a.numberInt - b.numberInt;
        if (!sa) return 1;
        if (!sb) return -1;
        return (
          sa.series.localeCompare(sb.series) ||
          sa.id.localeCompare(sb.id) ||
          a.numberInt - b.numberInt
        );
      });
      break;
  }
  return copy;
}
