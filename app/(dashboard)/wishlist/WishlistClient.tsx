"use client";

import { useMemo } from "react";
import type { CardEntry } from "@/lib/data/types";
import { useWishlist } from "../_lib/WishlistContext";
import { CardGrid } from "../_components/CardGrid";

interface Props {
  cards: CardEntry[];
}

// Wishlist server-rendered data + client live state need to reconcile. The
// server fetched the user's wishlist row IDs, then loaded the card data for
// those IDs. The context keeps the wishlist live across realtime updates. We
// only render cards whose IDs are still in the live wishlist set.
export function WishlistClient({ cards }: Props) {
  const { wishlist } = useWishlist();

  const visible = useMemo(() => cards.filter((c) => wishlist.has(c.id)), [cards, wishlist]);

  if (visible.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-panel/50 p-12 text-center">
        <p className="text-sm text-muted">
          Nothing here yet — wishlist a card from the Pokédex or any set page.
        </p>
      </div>
    );
  }

  return <CardGrid cards={visible} storageKey="wishlist" initialSort="pokemon" />;
}
