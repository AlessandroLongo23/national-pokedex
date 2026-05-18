import Link from "next/link";
import { PageHeader } from "../_components/PageHeader";
import { BinderListCard } from "../_components/BinderListCard";
import { requireUserId } from "../_lib/current-user";
import { loadUserPreferences } from "../_lib/user-preferences";
import { getSupabaseServer } from "@/lib/supabase/server";
import {
  filterByScope,
  filterCardsByIds,
  getAllCards,
  pokedexCoverage,
  type ScopeType,
  type ScopeParams,
} from "@/lib/data/binder-scope";
import { fetchPricesForCards, sumPrices } from "@/lib/pricing/pokemontcg";

interface BinderRow {
  id: string;
  name: string;
  scope_type: ScopeType;
  scope_params: ScopeParams | Record<string, unknown>;
}

export default async function BindersPage() {
  const userId = await requireUserId();
  const supabase = await getSupabaseServer();
  const prefs = await loadUserPreferences(userId);

  const [bindersResult, ownedResult] = await Promise.all([
    supabase
      .from("binders")
      .select("id, name, scope_type, scope_params")
      .eq("user_id", userId)
      .order("created_at", { ascending: false }),
    supabase.from("owned_cards").select("card_id").eq("user_id", userId),
  ]);

  const binders = (bindersResult.data ?? []) as BinderRow[];
  const ownedIds = new Set((ownedResult.data ?? []).map((r) => r.card_id as string));

  const customBinderIds = binders
    .filter((b) => b.scope_type === "custom")
    .map((b) => b.id);
  const customCardsByBinder = new Map<string, string[]>();
  if (customBinderIds.length > 0) {
    const { data: customRows } = await supabase
      .from("binder_cards")
      .select("binder_id, card_id")
      .in("binder_id", customBinderIds);
    for (const row of customRows ?? []) {
      const bid = row.binder_id as string;
      const list = customCardsByBinder.get(bid) ?? [];
      list.push(row.card_id as string);
      customCardsByBinder.set(bid, list);
    }
  }

  const allCards = binders.length > 0 ? await getAllCards() : [];

  // First pass: compute each binder's owned card IDs (scoped). We'll
  // fetch prices once for the union and then resolve per-binder sums.
  interface BinderCompute {
    id: string;
    name: string;
    scopeType: ScopeType;
    scopeParams: ScopeParams | Record<string, unknown>;
    targetCount: number;
    ownedCount: number;
    ownedCardIds: string[];
  }

  const computed: BinderCompute[] = binders.map((b) => {
    let targetCount: number;
    let ownedCount: number;
    const ownedIdsInBinder: string[] = [];
    if (b.scope_type === "pokedex") {
      const params = b.scope_params as { dexFrom: number; dexTo: number };
      const inRange = filterByScope(allCards, "pokedex", params);
      const cov = pokedexCoverage(params, ownedIds, inRange);
      targetCount = cov.dexNumbers.length;
      ownedCount = cov.covered.size;
      // Sum prices over every owned card whose dex# falls in range —
      // each owned card counts once even if it represents one dex slot.
      for (const c of inRange) {
        if (ownedIds.has(c.id)) ownedIdsInBinder.push(c.id);
      }
    } else {
      const target =
        b.scope_type === "custom"
          ? filterCardsByIds(allCards, customCardsByBinder.get(b.id) ?? [])
          : filterByScope(allCards, b.scope_type, b.scope_params as ScopeParams);
      targetCount = target.length;
      ownedCount = 0;
      for (const c of target) {
        if (ownedIds.has(c.id)) {
          ownedCount += 1;
          ownedIdsInBinder.push(c.id);
        }
      }
    }
    return {
      id: b.id,
      name: b.name,
      scopeType: b.scope_type,
      scopeParams: b.scope_params,
      targetCount,
      ownedCount,
      ownedCardIds: ownedIdsInBinder,
    };
  });

  const allOwnedForPricing = new Set<string>();
  for (const c of computed) for (const id of c.ownedCardIds) allOwnedForPricing.add(id);
  const priceMap = await fetchPricesForCards(allOwnedForPricing);

  const cards = computed.map((c) => {
    const { total } = sumPrices(priceMap, c.ownedCardIds, prefs.priceSource);
    return {
      id: c.id,
      name: c.name,
      scopeType: c.scopeType,
      scopeParams: c.scopeParams,
      targetCount: c.targetCount,
      ownedCount: c.ownedCount,
      value: total,
      priceSource: prefs.priceSource,
    };
  });

  return (
    <div className="mx-auto max-w-[1280px] space-y-6">
      <PageHeader
        eyebrow="Workspace"
        title="Binders"
        subtitle="Track any slice of the TCG — a master set, an artist, a Pokémon, a hand-picked list."
        right={
          <Link
            href="/binders/new"
            className="rounded-md border border-border bg-panel px-3 py-1.5 text-sm font-medium transition hover:border-border-strong"
          >
            + New binder
          </Link>
        }
      />

      {cards.length === 0 ? (
        <div className="rounded-lg border border-border bg-panel p-8 text-sm text-muted">
          <p className="text-base text-text">No binders yet.</p>
          <p className="mt-2">
            Create one to start tracking — a master set, every card by an artist, every card of
            a Pokémon, every #1 across sets, or a hand-picked list.
          </p>
          <Link
            href="/binders/new"
            className="mt-4 inline-block rounded-md border border-border bg-panel-2 px-3 py-1.5 text-sm font-medium text-text transition hover:border-border-strong"
          >
            Create your first binder
          </Link>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {cards.map((c) => (
            <BinderListCard key={c.id} {...c} />
          ))}
        </div>
      )}
    </div>
  );
}
