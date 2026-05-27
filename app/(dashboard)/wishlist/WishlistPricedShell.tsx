import { fetchPricesForCards } from "@/lib/pricing/pokemontcg";
import type { CardEntry } from "@/lib/data/types";
import type { CardPriceRecord } from "../_lib/CardPricesContext";
import { WishlistClient } from "./WishlistClient";

interface Props {
  cards: CardEntry[];
  cardIds: string[];
  types: string[];
  artists: string[];
}

// Nested in <Suspense> on the wishlist page so the rest of the page
// (header, empty state, etc.) ships fast and the upstream per-set price
// fetches happen off the critical render path.
export async function WishlistPricedShell({
  cards,
  cardIds,
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
    <WishlistClient
      cards={cards}
      prices={priceRecord}
      types={types}
      artists={artists}
    />
  );
}

export function WishlistUnpricedShell({
  cards,
  types,
  artists,
}: Omit<Props, "cardIds">) {
  return (
    <WishlistClient cards={cards} prices={{}} types={types} artists={artists} />
  );
}
