import { requireUserId } from "../_lib/current-user";
import { getSupabaseServer } from "@/lib/supabase/server";
import { PageHeader } from "../_components/PageHeader";
import { TrendsSection } from "./_components/TrendsSection";
import { PortfolioHero } from "./_components/PortfolioHero";
import { BinderRollup, type BinderRollupRow } from "./_components/BinderRollup";
import { RecentPullsStrip } from "./_components/RecentPullsStrip";
import { cumulativeByDay } from "@/lib/data/cumulative-acquisitions";
import { cumulativeValueByDay } from "@/lib/data/cumulative-value";
import {
  filterByScope,
  filterCardsByIds,
  getAllCards,
  pokedexCoverage,
  type ScopeType,
  type ScopeParams,
} from "@/lib/data/binder-scope";
import { loadUserPreferences } from "../_lib/user-preferences";
import {
  fetchPricesForCards,
  sumPrices,
  type CardPrice,
} from "@/lib/pricing/pokemontcg";

const RECENT_PACK_LIMIT = 12;

interface BinderRow {
  id: string;
  name: string;
  scope_type: ScopeType;
  scope_params: ScopeParams | Record<string, unknown>;
}

export default async function PortfolioPage() {
  const userId = await requireUserId();
  const supabase = await getSupabaseServer();
  const prefs = await loadUserPreferences(userId);

  const [ownedRes, packsRes, favRes, bindersRes, allCards] = await Promise.all([
    supabase
      .from("owned_cards")
      .select("card_id, acquired_at")
      .eq("user_id", userId)
      .order("acquired_at", { ascending: true }),
    supabase
      .from("packs_opened")
      .select("id, set_id, opened_at")
      .eq("user_id", userId)
      .order("opened_at", { ascending: false })
      .limit(RECENT_PACK_LIMIT),
    supabase.from("user_favorites").select("card_id").eq("user_id", userId),
    supabase
      .from("binders")
      .select("id, name, scope_type, scope_params")
      .eq("user_id", userId)
      .order("created_at", { ascending: false }),
    getAllCards(),
  ]);

  const owned = ownedRes.data ?? [];
  const ownedIds = new Set(owned.map((r) => r.card_id as string));
  const binders = (bindersRes.data ?? []) as BinderRow[];

  // Per-binder owned card lists (shared with the global value query so we
  // only call the pricing API once for the full union).
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
    const ownedInBinder: string[] = [];
    if (b.scope_type === "pokedex") {
      const params = b.scope_params as { dexFrom: number; dexTo: number };
      const inRange = filterByScope(allCards, "pokedex", params);
      const cov = pokedexCoverage(params, ownedIds, inRange);
      targetCount = cov.dexNumbers.length;
      ownedCount = cov.covered.size;
      for (const c of inRange) if (ownedIds.has(c.id)) ownedInBinder.push(c.id);
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
          ownedInBinder.push(c.id);
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
      ownedCardIds: ownedInBinder,
    };
  });

  // Pack-pull set for the strip — also feed it into the pricing union so
  // we don't double-call the API for cards that are both owned and on the
  // recent-pulls list.
  const packIds = (packsRes.data ?? []).map((p) => p.id as string);
  let recentPackCards: typeof allCards = [];
  if (packIds.length > 0) {
    const { data: contents } = await supabase
      .from("pack_contents")
      .select("card_id")
      .in("pack_id", packIds);
    const seen = new Set<string>();
    const ids: string[] = [];
    for (const r of contents ?? []) {
      const id = r.card_id as string;
      if (seen.has(id)) continue;
      seen.add(id);
      ids.push(id);
    }
    const byId = new Map(allCards.map((c) => [c.id, c]));
    recentPackCards = ids
      .map((id) => byId.get(id))
      .filter((c): c is (typeof allCards)[number] => Boolean(c))
      .slice(0, RECENT_PACK_LIMIT);
  }

  const allIdsForPricing = new Set<string>(ownedIds);
  for (const c of recentPackCards) allIdsForPricing.add(c.id);
  const priceMap = await fetchPricesForCards(allIdsForPricing);

  const { total: portfolioValue, coveredCount: pricedCount } = sumPrices(
    priceMap,
    ownedIds,
    prefs.priceSource,
  );

  const binderRows: BinderRollupRow[] = computed.map((c) => {
    const { total } = sumPrices(priceMap, c.ownedCardIds, prefs.priceSource);
    return {
      id: c.id,
      name: c.name,
      scopeType: c.scopeType,
      scopeParams: c.scopeParams,
      ownedCount: c.ownedCount,
      targetCount: c.targetCount,
      value: total,
    };
  });

  const countPoints = cumulativeByDay(
    owned.map((r) => ({ acquired_at: r.acquired_at as string })),
  );
  const valuePoints = cumulativeValueByDay(
    owned.map((r) => ({
      card_id: r.card_id as string,
      acquired_at: r.acquired_at as string,
    })),
    priceMap,
    prefs.priceSource,
  );

  const distinctSpecies = new Set<number>();
  for (const c of allCards) {
    if (!ownedIds.has(c.id)) continue;
    for (const d of c.dex) distinctSpecies.add(d);
  }

  const pullsPrices: Record<string, CardPrice> = {};
  for (const c of recentPackCards) {
    const p = priceMap.get(c.id);
    if (p) pullsPrices[c.id] = p;
  }

  return (
    <div className="mx-auto max-w-[1280px]">
      <PageHeader title="Portfolio" />

      <PortfolioHero
        portfolioValue={portfolioValue}
        pricedCount={pricedCount}
        totalCards={owned.length}
        distinctSpecies={distinctSpecies.size}
        packsOpened={packsRes.data?.length ?? 0}
        favoritesCount={favRes.data?.length ?? 0}
        priceSource={prefs.priceSource}
      />

      <div className="mt-10 space-y-10">
        <TrendsSection
          countPoints={countPoints}
          valuePoints={valuePoints}
          priceSource={prefs.priceSource}
        />

        <BinderRollup
          rows={binderRows}
          priceSource={prefs.priceSource}
          totalValue={portfolioValue}
        />

        <RecentPullsStrip
          cards={recentPackCards}
          prices={pullsPrices}
          priceSource={prefs.priceSource}
        />
      </div>
    </div>
  );
}
