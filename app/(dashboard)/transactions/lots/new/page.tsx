import { Layers } from "lucide-react";
import { getSupabaseServer } from "@/lib/supabase/server";
import { getAllCards, distinctArtists } from "@/lib/data/binder-scope";
import { getLatestRatesFromEur } from "@/lib/pricing/exchange-rates";
import { isLedgerCurrency, type LedgerCurrency } from "@/lib/ledger/money";
import { PageHeader } from "../../../_components/PageHeader";
import { LogLotFlow } from "../../../_components/LogLotFlow";
import { requireUserId } from "../../../_lib/current-user";
import { loadUserPreferences } from "../../../_lib/user-preferences";
import {
  majorityCurrency,
  suggestedLotTotalCents,
  type SingleAmount,
} from "../../../_lib/group-singles";

interface PageProps {
  searchParams: Promise<{ fromSingles?: string }>;
}

export default async function NewLotPage({ searchParams }: PageProps) {
  const { fromSingles } = await searchParams;
  const userId = await requireUserId();
  const prefs = await loadUserPreferences(userId);
  const cards = await getAllCards();
  const artists = distinctArtists(cards);
  const typeSet = new Set<string>();
  for (const c of cards) for (const t of c.types) typeSet.add(t);
  const types = [...typeSet].sort((a, b) => a.localeCompare(b));

  let initialContents: { cardId: string; quantity: number }[] | undefined;
  let initialCostCents: number | null | undefined;
  let initialCurrency: LedgerCurrency | null | undefined;
  let initialPurchasedAt: string | undefined;
  let sourceSingleIds: string[] | undefined;

  const ids = (fromSingles ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 200);

  if (ids.length > 0) {
    const supabase = await getSupabaseServer();
    const { data: singles } = await supabase
      .from("transactions")
      .select("id, card_id, quantity, amount_cents, currency, rate_to_eur, occurred_at")
      .eq("user_id", userId)
      .eq("kind", "single_purchase")
      .in("id", ids);

    const rows = (singles ?? []) as Array<{
      id: string;
      card_id: string;
      quantity: number;
      amount_cents: number;
      currency: string;
      rate_to_eur: number | string | null;
      occurred_at: string;
    }>;

    if (rows.length > 0) {
      // Aggregate card -> total quantity.
      const byCard = new Map<string, number>();
      for (const r of rows) byCard.set(r.card_id, (byCard.get(r.card_id) ?? 0) + r.quantity);
      initialContents = [...byCard.entries()].map(([cardId, quantity]) => ({ cardId, quantity }));

      const ledgerRows = rows.filter((r) => isLedgerCurrency(r.currency));
      const majority =
        majorityCurrency(ledgerRows.map((r) => r.currency as LedgerCurrency)) ??
        prefs.displayCurrency;
      const latestRatesFromEur = await getLatestRatesFromEur();
      const amounts: SingleAmount[] = ledgerRows.map((r) => ({
        amountCents: r.amount_cents,
        currency: r.currency as LedgerCurrency,
        rateToEur: r.rate_to_eur == null ? null : Number(r.rate_to_eur),
      }));
      initialCostCents = suggestedLotTotalCents(amounts, majority, latestRatesFromEur);
      initialCurrency = majority;

      // Earliest purchase date among the singles.
      initialPurchasedAt = rows
        .map((r) => r.occurred_at)
        .reduce((a, b) => (a < b ? a : b));

      sourceSingleIds = rows.map((r) => r.id);
    }
  }

  return (
    <div className="mx-auto w-full max-w-[1280px] space-y-6">
      <PageHeader icon={Layers} title="Log a bulk lot" />
      <LogLotFlow
        cards={cards}
        artists={artists}
        types={types}
        defaultCurrency={prefs.displayCurrency}
        initialContents={initialContents}
        initialCostCents={initialCostCents}
        initialCurrency={initialCurrency}
        initialPurchasedAt={initialPurchasedAt}
        sourceSingleIds={sourceSingleIds}
      />
    </div>
  );
}
