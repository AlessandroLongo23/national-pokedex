"use client";

import { createContext, useContext, useMemo } from "react";
import type { CardPrice } from "@/lib/pricing/pokemontcg";

// Shape: { [cardId]: { tcgplayer?: number; cardmarket?: number } }.
// Parent server components fetch prices for the cards they're about to
// render and hand them to <CardPricesProvider>; child CardTiles read from
// the context with the user's selected source picked off the side.
export type CardPriceRecord = Record<string, CardPrice>;

const Ctx = createContext<Map<string, CardPrice> | null>(null);

export function CardPricesProvider({
  prices,
  children,
}: {
  prices: CardPriceRecord;
  children: React.ReactNode;
}) {
  const map = useMemo(() => new Map(Object.entries(prices)), [prices]);
  return <Ctx.Provider value={map}>{children}</Ctx.Provider>;
}

// Returns null when there's no provider above (no prices available for
// this page) — CardTile uses that to decide whether to render the row at
// all, so non-priced pages stay visually identical to before.
export function useCardPrices(): Map<string, CardPrice> | null {
  return useContext(Ctx);
}

// Tiny helper for callers that want one card's number directly.
export function useCardPrice(cardId: string): CardPrice | undefined {
  const map = useCardPrices();
  return map?.get(cardId);
}
