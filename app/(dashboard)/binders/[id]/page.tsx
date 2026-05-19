import { notFound } from "next/navigation";
import { requireUserId } from "../../_lib/current-user";
import { getSupabaseServer } from "@/lib/supabase/server";
import {
  filterByScope,
  filterCardsByIds,
  getAllCards,
  type ScopeType,
  type ScopeParams,
} from "@/lib/data/binder-scope";
import { loadUserPreferences } from "../../_lib/user-preferences";
import { fetchPricesForCards, sumPricesByQuantity } from "@/lib/pricing/pokemontcg";
import { BinderDetailClient } from "./_components/BinderDetailClient";
import type { CardPriceRecord } from "../../_lib/CardPricesContext";

export default async function BinderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const userId = await requireUserId();
  const supabase = await getSupabaseServer();
  const prefs = await loadUserPreferences(userId);
  const { data: binder } = await supabase
    .from("binders")
    .select("id, name, scope_type, scope_params")
    .eq("id", id)
    .eq("user_id", userId)
    .maybeSingle();

  if (!binder) notFound();

  const scopeType = binder.scope_type as ScopeType;
  const scopeParams = binder.scope_params as ScopeParams;
  const allCards = await getAllCards();

  let customCardIds: string[] = [];
  let cards;
  if (scopeType === "custom") {
    const { data: rows } = await supabase
      .from("binder_cards")
      .select("card_id")
      .eq("binder_id", id);
    customCardIds = (rows ?? []).map((r) => r.card_id as string);
    cards = filterCardsByIds(allCards, customCardIds);
  } else {
    cards = filterByScope(allCards, scopeType, scopeParams);
  }

  const targetIds = new Set(cards.map((c) => c.id));
  const cardsById = new Map(cards.map((c) => [c.id, c]));
  const { data: ownedRows } = await supabase
    .from("owned_cards")
    .select("card_id, acquired_at, quantity")
    .eq("user_id", userId)
    .order("acquired_at", { ascending: false })
    .limit(500);

  const recentAdditions = (ownedRows ?? [])
    .filter((r) => targetIds.has(r.card_id as string))
    .slice(0, 10)
    .map((r) => cardsById.get(r.card_id as string))
    .filter((c): c is (typeof cards)[number] => Boolean(c));

  // Cell overrides only apply to pokedex-scope binders.
  let cellOverrides: Record<number, string> = {};
  if (scopeType === "pokedex") {
    const { data: rows } = await supabase
      .from("binder_cell_overrides")
      .select("dex, card_id")
      .eq("binder_id", id);
    for (const r of rows ?? []) {
      cellOverrides[r.dex as number] = r.card_id as string;
    }
  }

  // One fetch covers prices for every card on this page — both the grid
  // tiles and the binder-value stat.
  const priceMap = await fetchPricesForCards(targetIds);
  const ownedQtyByCard = new Map<string, number>();
  for (const r of ownedRows ?? []) {
    ownedQtyByCard.set(r.card_id as string, (r.quantity as number | null) ?? 1);
  }
  const ownedPairsInBinder: [string, number][] = [];
  for (const c of cards) {
    const qty = ownedQtyByCard.get(c.id);
    if (qty && qty > 0) ownedPairsInBinder.push([c.id, qty]);
  }
  const { total: binderValue, coveredCount: pricedCount } = sumPricesByQuantity(
    priceMap,
    ownedPairsInBinder,
    prefs.priceSource,
  );

  const priceRecord: CardPriceRecord = {};
  for (const id of targetIds) {
    const p = priceMap.get(id);
    if (p) priceRecord[id] = p;
  }

  return (
    <BinderDetailClient
      binder={{
        id: binder.id as string,
        name: binder.name as string,
        scopeType,
        scopeParams,
      }}
      cards={cards}
      customCardIds={customCardIds}
      recentAdditions={recentAdditions}
      cellOverrides={cellOverrides}
      value={binderValue}
      pricedCount={pricedCount}
      ownedPricedTotal={ownedPairsInBinder.length}
      priceSource={prefs.priceSource}
      prices={priceRecord}
    />
  );
}
