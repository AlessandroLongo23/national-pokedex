import { POKEDEX, getSet } from "@/lib/data";
import { RARITY_ORDER, type CardEntry, type Rarity } from "@/lib/data/types";

export type CardSort = "number" | "rarity" | "pokemon" | "set" | "price" | "added";
export type SortDir = "asc" | "desc";

/** Per-card lookups some sorts need but `CardEntry` doesn't carry. */
export interface SortAccessors {
  /** Card's price for the active source; `undefined` when unpriced. */
  priceOf?: (card: CardEntry) => number | undefined;
  /** When the card entered the collection, as epoch ms; `undefined` if unknown. */
  addedAtOf?: (card: CardEntry) => number | undefined;
}

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

export function sortCards(
  cards: CardEntry[],
  sort: CardSort,
  dir: SortDir = "asc",
  acc: SortAccessors = {},
): CardEntry[] {
  const copy = [...cards];
  const byNum = (a: CardEntry, b: CardEntry) =>
    a.setId.localeCompare(b.setId) || a.numberInt - b.numberInt;

  // Price and date sort direction-aware so that cards missing the value stay at
  // the bottom in BOTH directions — flipping the order shouldn't float the
  // unknowns to the top (a plain reverse of the ascending order would).
  if (sort === "price" || sort === "added") {
    const valueOf = sort === "price" ? acc.priceOf : acc.addedAtOf;
    const sign = dir === "asc" ? 1 : -1;
    copy.sort((a, b) => {
      const va = valueOf?.(a) ?? null;
      const vb = valueOf?.(b) ?? null;
      if (va === null && vb === null) return byNum(a, b);
      if (va === null) return 1;
      if (vb === null) return -1;
      return sign * (va - vb) || byNum(a, b);
    });
    return copy;
  }

  // The ascending comparators below are the canonical order; `desc` reverses.
  switch (sort) {
    case "number":
      copy.sort(byNum);
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
  if (dir === "desc") copy.reverse();
  return copy;
}
