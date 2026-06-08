// Shared catalogue filter — used by the Cards browser and the bulk-lot
// flow so both filter ~20k cards identically. Mirrors the filters the
// CardFiltersToolbar surfaces by default (search, supertype, set, rarity,
// type, artist, dex range). The price / generation / regional-form
// dimensions are feature-flagged and only handled by callers that enable
// them; neither the Cards browser nor the lot flow does.
import type { CardEntry } from "@/lib/data/types";
import type { CardsFilterState } from "../_components/CardFiltersToolbar";

export function applyCardFilters(
  cards: CardEntry[],
  f: CardsFilterState,
  searchDebounced: string,
): CardEntry[] {
  const q = searchDebounced.trim().toLowerCase();
  const hasSetIds = f.setIds.size > 0;
  const hasRarities = f.rarities.size > 0;
  const hasTypes = f.types.size > 0;
  const hasDex = f.dexFrom !== null || f.dexTo !== null;
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
    return true;
  });
}
