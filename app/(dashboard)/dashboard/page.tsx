import { Suspense } from "react";
import Link from "next/link";
import { ArrowRight, LayoutDashboard } from "lucide-react";
import { PageHeader } from "../_components/PageHeader";
import { PublicHero } from "../_components/PublicHero";
import { CardRail } from "../_components/CardRail";
import { getOptionalUser } from "../_lib/current-user";
import { getSupabaseServer } from "@/lib/supabase/server";
import { SETS } from "@/lib/data";
import {
  filterByScope,
  filterCardsByIds,
  getAllCards,
  pokedexCoverage,
  type ScopeParams,
  type ScopeType,
} from "@/lib/data/binder-scope";
import { getLatestRatesFromEur } from "@/lib/pricing/exchange-rates";
import { loadUserPreferences } from "../_lib/user-preferences";
import type { DisplayConversion } from "@/lib/pricing/pokemontcg";
import type { CardEntry } from "@/lib/data/types";
import { isLedgerCurrency } from "@/lib/ledger/money";
import { TRANSACTION_KINDS, type TransactionKind } from "@/lib/ledger/aggregates";
import {
  PortfolioWidget,
  PortfolioWidgetFallback,
} from "./_components/PortfolioWidget";
import { BindersWidget, type BinderWidgetRow } from "./_components/BindersWidget";
import {
  RecentTransactionsWidget,
  type RecentTransactionItem,
} from "./_components/RecentTransactionsWidget";

const RAIL_SIZE = 12;
const BINDER_LIMIT = 4;
const TXN_LIMIT = 6;

interface BinderRow {
  id: string;
  name: string;
  scope_type: ScopeType;
  scope_params: ScopeParams | Record<string, unknown>;
}

function isTransactionKind(value: unknown): value is TransactionKind {
  return TRANSACTION_KINDS.includes(value as TransactionKind);
}

export default async function DashboardPage() {
  const user = await getOptionalUser();
  if (!user) return <PublicHero />;
  const userId = user.id;

  const supabase = await getSupabaseServer();
  const prefs = await loadUserPreferences(userId);

  const [
    ownedRes,
    favoritesRes,
    bindersRes,
    txnRes,
    packsCountRes,
    allCards,
    latestRatesFromEur,
  ] = await Promise.all([
    supabase
      .from("owned_cards")
      .select("card_id, acquired_at, quantity")
      .eq("user_id", userId)
      .order("acquired_at", { ascending: false }),
    supabase
      .from("user_favorites")
      .select("card_id, favorited_at")
      .eq("user_id", userId)
      .order("favorited_at", { ascending: false })
      .limit(60),
    supabase
      .from("binders")
      .select("id, name, scope_type, scope_params")
      .eq("user_id", userId)
      .order("created_at", { ascending: false }),
    supabase
      .from("transactions")
      .select(
        "id, kind, occurred_at, amount_cents, currency, rate_to_eur, card_id, quantity, note, packs_opened(set_id)",
      )
      .eq("user_id", userId)
      .order("occurred_at", { ascending: false })
      .limit(TXN_LIMIT),
    supabase
      .from("packs_opened")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId),
    getAllCards(),
    getLatestRatesFromEur(),
  ]);

  const display: DisplayConversion = {
    displayCurrency: prefs.displayCurrency,
    latestRatesFromEur,
  };
  const cardsById = new Map<string, CardEntry>(allCards.map((c) => [c.id, c]));

  // Owned cards (already ordered by acquired_at desc).
  const ownedRows = ownedRes.data ?? [];
  const ownedIds = new Set(ownedRows.map((r) => r.card_id as string));
  const ownedQuantities = new Map<string, number>();
  for (const r of ownedRows) {
    ownedQuantities.set(r.card_id as string, (r.quantity as number | null) ?? 1);
  }

  // Recently added rail.
  const recentlyAdded: CardEntry[] = [];
  for (const r of ownedRows) {
    const c = cardsById.get(r.card_id as string);
    if (c) recentlyAdded.push(c);
    if (recentlyAdded.length >= RAIL_SIZE) break;
  }

  // Favorite cards I still own.
  const favoriteCards: CardEntry[] = [];
  for (const r of favoritesRes.data ?? []) {
    const id = r.card_id as string;
    if (!ownedIds.has(id)) continue;
    const c = cardsById.get(id);
    if (c) favoriteCards.push(c);
    if (favoriteCards.length >= RAIL_SIZE) break;
  }

  // Distinct owned species, for the portfolio meta line.
  const distinctSpecies = new Set<number>();
  for (const id of ownedIds) {
    const c = cardsById.get(id);
    if (c) for (const d of c.dex) distinctSpecies.add(d);
  }

  // Binders — owned/target computed live, mirroring the portfolio page.
  const binders = (bindersRes.data ?? []) as BinderRow[];
  const topBinders = binders.slice(0, BINDER_LIMIT);
  const customBinderIds = topBinders
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
  const binderRows: BinderWidgetRow[] = topBinders.map((b) => {
    let targetCount: number;
    let ownedCount: number;
    if (b.scope_type === "pokedex") {
      const params = b.scope_params as { dexFrom: number; dexTo: number };
      const inRange = filterByScope(allCards, "pokedex", params);
      const cov = pokedexCoverage(params, ownedIds, inRange);
      targetCount = cov.dexNumbers.length;
      ownedCount = cov.covered.size;
    } else {
      const target =
        b.scope_type === "custom"
          ? filterCardsByIds(allCards, customCardsByBinder.get(b.id) ?? [])
          : filterByScope(allCards, b.scope_type, b.scope_params as ScopeParams);
      targetCount = target.length;
      ownedCount = 0;
      for (const c of target) if (ownedIds.has(c.id)) ownedCount += 1;
    }
    return {
      id: b.id,
      name: b.name,
      scopeType: b.scope_type,
      scopeParams: b.scope_params,
      ownedCount,
      targetCount,
    };
  });

  // Recent transactions.
  const setNameById = new Map(SETS.map((s) => [s.id, s.name] as const));
  const txnRaw = (txnRes.data ?? []) as unknown as Array<{
    id: string;
    kind: string;
    occurred_at: string;
    amount_cents: number;
    currency: string;
    rate_to_eur: number | string | null;
    card_id: string | null;
    note: string | null;
    packs_opened: { set_id: string | null } | { set_id: string | null }[] | null;
  }>;
  const txnItems: RecentTransactionItem[] = [];
  for (const r of txnRaw) {
    if (!isTransactionKind(r.kind)) continue;
    if (!isLedgerCurrency(r.currency)) continue;
    const pack = Array.isArray(r.packs_opened)
      ? r.packs_opened[0] ?? null
      : r.packs_opened;
    const setName = pack?.set_id ? setNameById.get(pack.set_id) ?? null : null;
    const cardName = r.card_id ? cardsById.get(r.card_id)?.name ?? null : null;
    let description = cardName ?? r.note ?? "Transaction";
    if (r.kind === "pack_purchase") description = setName ?? "Booster pack";
    else if (r.kind === "psa_fee") description = r.note ?? "PSA grading";
    else if (r.kind === "lot_purchase") description = r.note ?? "Bulk lot";
    const rateToEur = r.rate_to_eur == null ? null : Number(r.rate_to_eur);
    txnItems.push({
      id: r.id,
      kind: r.kind,
      occurredAt: r.occurred_at,
      amountCents: r.amount_cents,
      currency: r.currency,
      rateToEur: Number.isFinite(rateToEur) ? rateToEur : null,
      description,
    });
  }

  return (
    <div className="mx-auto max-w-[1280px] space-y-6">
      <PageHeader
        icon={LayoutDashboard}
        title="Dashboard"
        subtitle="Your collection at a glance."
        actions={
          <Link
            href="/packs"
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3.5 py-2 text-sm font-semibold text-primary-foreground transition hover:opacity-90"
          >
            Best pack to open
            <ArrowRight className="h-4 w-4" aria-hidden />
          </Link>
        }
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <Suspense fallback={<PortfolioWidgetFallback />}>
          <PortfolioWidget
            ownedQuantities={ownedQuantities}
            totalCards={ownedRows.length}
            distinctSpecies={distinctSpecies.size}
            packsOpened={packsCountRes.count ?? 0}
            priceSource={prefs.priceSource}
            display={display}
          />
        </Suspense>
        <BindersWidget binders={binderRows} />
      </div>

      <CardRail
        title="Recently added"
        subtitle="The latest cards in your collection"
        cards={recentlyAdded}
        emptyMessage="You haven't added any cards yet."
        href="/collection"
        rail="recently-added"
      />

      <div className="grid items-start gap-4 lg:grid-cols-2">
        <CardRail
          title="Favorites"
          subtitle="Cards you own and love"
          cards={favoriteCards}
          emptyMessage="Star a card you own to see it here."
          href="/collection"
          rail="favorites"
        />
        <RecentTransactionsWidget
          items={txnItems}
          displayCurrency={prefs.displayCurrency}
          latestRatesFromEur={latestRatesFromEur}
        />
      </div>
    </div>
  );
}
