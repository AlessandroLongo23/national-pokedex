import { Suspense } from "react";
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
import {
  BinderPricedShell,
  BinderUnpricedShell,
} from "./_components/BinderPricedShell";

// Vercel Hobby's default function timeout (10s) is below what a cold-cache
// price fetch can take for a binder that spans many sets. Allow up to 60s
// so the streamed price subtree has room to resolve.
export const maxDuration = 60;

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

  const ownedQtyByCard = new Map<string, number>();
  for (const r of ownedRows ?? []) {
    ownedQtyByCard.set(r.card_id as string, (r.quantity as number | null) ?? 1);
  }

  const binderSummary = {
    id: binder.id as string,
    name: binder.name as string,
    scopeType,
    scopeParams,
  };

  // Render the page chrome + grid immediately; the priced shell streams in
  // once the (potentially-slow) per-set price fetches resolve. The fallback
  // is the same component with empty prices, so the layout doesn't shift
  // when prices finally land — only the value badge and per-card price
  // overlays light up.
  return (
    <Suspense
      fallback={
        <BinderUnpricedShell
          binder={binderSummary}
          cards={cards}
          customCardIds={customCardIds}
          recentAdditions={recentAdditions}
          cellOverrides={cellOverrides}
          priceSource={prefs.priceSource}
        />
      }
    >
      <BinderPricedShell
        binder={binderSummary}
        cards={cards}
        customCardIds={customCardIds}
        recentAdditions={recentAdditions}
        cellOverrides={cellOverrides}
        priceSource={prefs.priceSource}
        ownedQtyByCard={ownedQtyByCard}
      />
    </Suspense>
  );
}
