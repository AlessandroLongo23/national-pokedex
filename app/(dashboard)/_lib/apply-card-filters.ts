import type { CardEntry } from "@/lib/data/types";
import { genOf } from "@/lib/data/types";
import { pickPrice } from "@/lib/pricing/pokemontcg";
import { priceBucketOf, regionalFormOf } from "./card-filters";
import type { CardsFilterState } from "../_components/filters/types";

/**
 * Apply the tiered-toolbar filter state to a card list. Shared by the Wishlist
 * and Collection views. Note: `favoritesOnly` is NOT handled here — it depends
 * on the user's favorites set, which the calling page applies separately.
 */
export function applyCardFilters(
  cards: CardEntry[],
  f: CardsFilterState,
  searchDebounced: string,
  prices: Map<string, { tcgplayer?: number; cardmarket?: number }>,
  source: "tcgplayer" | "cardmarket",
): CardEntry[] {
  const q = searchDebounced.trim().toLowerCase();
  const hasSetIds = f.setIds.size > 0;
  const hasRarities = f.rarities.size > 0;
  const hasTypes = f.types.size > 0;
  const hasDex = f.dexFrom !== null || f.dexTo !== null;
  const hasPriceBuckets = f.priceBuckets.size > 0;
  const hasGenerations = f.generations.size > 0;
  const hasRegionalForms = f.regionalForms.size > 0;
  const lo = f.dexFrom ?? 1;
  const hi = f.dexTo ?? 1025;
  const dexLo = Math.min(lo, hi);
  const dexHi = Math.max(lo, hi);

  return cards.filter((c) => {
    if (q && !c.name.toLowerCase().includes(q)) return false;
    if (f.supertype !== "all" && c.supertype !== f.supertype) return false;
    if (hasSetIds && !f.setIds.has(c.setId)) return false;
    if (hasRarities && !f.rarities.has(c.rarity)) return false;
    if (hasTypes) {
      let hit = false;
      for (const t of c.types) {
        if (f.types.has(t)) {
          hit = true;
          break;
        }
      }
      if (!hit) return false;
    }
    if (f.artist && c.artist !== f.artist) return false;
    if (hasDex) {
      let hit = false;
      for (const d of c.dex) {
        if (d >= dexLo && d <= dexHi) {
          hit = true;
          break;
        }
      }
      if (!hit) return false;
    }
    if (hasGenerations) {
      let hit = false;
      for (const d of c.dex) {
        if (f.generations.has(genOf(d))) {
          hit = true;
          break;
        }
      }
      if (!hit) return false;
    }
    if (hasRegionalForms) {
      const form = regionalFormOf(c);
      if (!form || !f.regionalForms.has(form)) return false;
    }
    if (hasPriceBuckets) {
      const price = pickPrice(prices.get(c.id), source);
      if (!f.priceBuckets.has(priceBucketOf(price))) return false;
    }
    return true;
  });
}
