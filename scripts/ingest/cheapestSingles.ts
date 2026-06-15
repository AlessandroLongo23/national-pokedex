// Precompute, per species, the cheapest printings to buy as a single — backing
// the "Buy these as singles" widget on the Packs page. The rarity pools in
// setPools.json carry no card identity, so the widget can't render real card
// thumbnails from them; this table supplies the actual cards (id + image).
//
// "Cheapest" is the same rarity-tier proxy used across the packs pages (there
// are no live prices in that client widget): lower RARITY_ORDER index = cheaper,
// ties broken by newest set first, then lowest card number for stability. The
// #1 entry therefore matches singles.ts's existing `cheapestRarity` choice.

import type { CardEntry, CheapestSingles, Rarity, SetInfo } from "@/lib/data/types";
import { RARITY_ORDER } from "@/lib/data/types";

function rarityRank(r: Rarity): number {
  const i = RARITY_ORDER.indexOf(r);
  return i === -1 ? RARITY_ORDER.length : i;
}

export function computeCheapestSingles(
  sets: SetInfo[],
  cardsBySet: Record<string, CardEntry[]>,
  limit = 3,
): CheapestSingles {
  const setMeta = new Map(sets.map((s) => [s.id, { name: s.name, releaseDate: s.releaseDate }]));
  const releaseOf = (setId: string): string => setMeta.get(setId)?.releaseDate ?? "";

  // Group every Pokémon printing by each national-dex number it represents.
  const byDex = new Map<number, CardEntry[]>();
  for (const cards of Object.values(cardsBySet)) {
    for (const card of cards) {
      if (card.supertype !== "Pokémon") continue;
      for (const dex of card.dex) {
        let list = byDex.get(dex);
        if (!list) byDex.set(dex, (list = []));
        list.push(card);
      }
    }
  }

  const out: CheapestSingles = {};
  for (const [dex, list] of byDex) {
    list.sort((a, b) => {
      const ra = rarityRank(a.rarity);
      const rb = rarityRank(b.rarity);
      if (ra !== rb) return ra - rb; // cheaper rarity first
      const da = releaseOf(a.setId);
      const db = releaseOf(b.setId);
      if (da !== db) return db.localeCompare(da); // newest set first
      return a.numberInt - b.numberInt || a.id.localeCompare(b.id);
    });
    out[dex] = list.slice(0, limit).map((c) => ({
      id: c.id,
      name: c.name,
      setId: c.setId,
      setName: setMeta.get(c.setId)?.name ?? c.setId,
      number: c.number,
      rarity: c.rarity,
      imageSmall: c.imageSmall,
    }));
  }
  return out;
}
