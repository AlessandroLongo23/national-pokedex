import { fetchPricesForCards } from "@/lib/pricing/pokemontcg";
import type { CardEntry } from "@/lib/data/types";
import type { CardPriceRecord } from "../_lib/CardPricesContext";
import { CollectionClient } from "./CollectionClient";

interface Props {
  cards: CardEntry[];
  cardIds: string[];
  addedAt: Record<string, number>;
  types: string[];
  artists: string[];
}

// Nested in <Suspense> on the collection page so the grid ships immediately and
// the per-set price fetches resolve off the critical render path.
export async function CollectionPricedShell({
  cards,
  cardIds,
  addedAt,
  types,
  artists,
}: Props) {
  const priceMap = await fetchPricesForCards(cardIds);
  const priceRecord: CardPriceRecord = {};
  for (const id of cardIds) {
    const p = priceMap.get(id);
    if (p) priceRecord[id] = p;
  }
  return (
    <CollectionClient
      cards={cards}
      addedAt={addedAt}
      prices={priceRecord}
      types={types}
      artists={artists}
    />
  );
}

export function CollectionUnpricedShell({
  cards,
  addedAt,
  types,
  artists,
}: Omit<Props, "cardIds">) {
  return (
    <CollectionClient
      cards={cards}
      addedAt={addedAt}
      prices={{}}
      types={types}
      artists={artists}
    />
  );
}
