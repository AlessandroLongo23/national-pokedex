import {
  fetchPricesForCards,
  sumPricesByQuantity,
  type PriceSource,
} from "@/lib/pricing/pokemontcg";
import type { CardEntry } from "@/lib/data/types";
import type { ScopeType, ScopeParams } from "@/lib/data/binder-scope";
import type { CardPriceRecord } from "../../../_lib/CardPricesContext";
import { BinderDetailClient } from "./BinderDetailClient";

interface Props {
  binder: {
    id: string;
    name: string;
    scopeType: ScopeType;
    scopeParams: ScopeParams | Record<string, unknown>;
  };
  cards: CardEntry[];
  customCardIds: string[];
  recentAdditions: CardEntry[];
  cellOverrides: Record<number, string>;
  priceSource: PriceSource;
  ownedQtyByCard: Map<string, number>;
}

// Async server component nested in <Suspense> on the binder page so the
// rest of the page (header, grid, etc.) can stream first while the upstream
// price fetch — which spans every set in the binder's scope and can be
// 30+ sets for a national-dex binder — is still in flight.
export async function BinderPricedShell({
  binder,
  cards,
  customCardIds,
  recentAdditions,
  cellOverrides,
  priceSource,
  ownedQtyByCard,
}: Props) {
  const targetIds = new Set(cards.map((c) => c.id));
  const priceMap = await fetchPricesForCards(targetIds);

  const ownedPairsInBinder: [string, number][] = [];
  for (const c of cards) {
    const qty = ownedQtyByCard.get(c.id);
    if (qty && qty > 0) ownedPairsInBinder.push([c.id, qty]);
  }
  const { total: binderValue, coveredCount: pricedCount } = sumPricesByQuantity(
    priceMap,
    ownedPairsInBinder,
    priceSource,
  );

  const priceRecord: CardPriceRecord = {};
  for (const id of targetIds) {
    const p = priceMap.get(id);
    if (p) priceRecord[id] = p;
  }

  return (
    <BinderDetailClient
      binder={binder}
      cards={cards}
      customCardIds={customCardIds}
      recentAdditions={recentAdditions}
      cellOverrides={cellOverrides}
      value={binderValue}
      pricedCount={pricedCount}
      ownedPricedTotal={ownedPairsInBinder.length}
      priceSource={priceSource}
      prices={priceRecord}
    />
  );
}

// Rendered immediately while prices are still resolving. Same component as
// the priced version but with empty prices + zero value, so the user sees
// the page chrome and the grid right away.
export function BinderUnpricedShell({
  binder,
  cards,
  customCardIds,
  recentAdditions,
  cellOverrides,
  priceSource,
}: Omit<Props, "ownedQtyByCard">) {
  return (
    <BinderDetailClient
      binder={binder}
      cards={cards}
      customCardIds={customCardIds}
      recentAdditions={recentAdditions}
      cellOverrides={cellOverrides}
      value={0}
      pricedCount={0}
      ownedPricedTotal={0}
      priceSource={priceSource}
      prices={{}}
    />
  );
}
