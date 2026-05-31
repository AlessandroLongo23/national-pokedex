import type { CardEntry } from "@/lib/data/types";

/**
 * The cards that belong on the wishlist view: wishlisted AND not already owned.
 *
 * A DB trigger (`owned_cards_prune_wishlist`) enforces this invariant on the
 * server — owning a card deletes its wishlist row. This client-side filter is
 * the optimistic counterpart: the instant a wishlisted card is marked owned,
 * the optimistic owned-set hides it here, before the realtime delete of the
 * wishlist row round-trips back to the browser.
 */
export function selectWishlistCards(
  cards: CardEntry[],
  wishlist: ReadonlySet<string>,
  owned: ReadonlySet<string>,
): CardEntry[] {
  return cards.filter((c) => wishlist.has(c.id) && !owned.has(c.id));
}
