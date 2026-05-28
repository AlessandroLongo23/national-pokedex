import { getSupabaseServer } from "@/lib/supabase/server";
import { SETS } from "@/lib/data";
import { getAllCards } from "@/lib/data/binder-scope";
import {
  fetchPricesForCards,
  PRICE_SOURCE_CURRENCY,
  sumPricesByQuantity,
} from "@/lib/pricing/pokemontcg";
import {
  convertCents,
  getLatestRatesFromEur,
} from "@/lib/pricing/exchange-rates";
import {
  computeKpis,
  computeNetPositionCents,
  TRANSACTION_KINDS,
  type LedgerRow,
  type TransactionKind,
} from "@/lib/ledger/aggregates";
import { isLedgerCurrency } from "@/lib/ledger/money";
import { PageHeader } from "../_components/PageHeader";
import { requireUserId } from "../_lib/current-user";
import { loadUserPreferences } from "../_lib/user-preferences";
import { ActionsBar } from "./_components/ActionsBar";
import { LedgerControls } from "./_components/LedgerControls";
import { LedgerHero } from "./_components/LedgerHero";
import { LedgerRealtime } from "./_components/LedgerRealtime";
import {
  type LedgerTableCardInfo,
  type LedgerTableRow,
} from "./_components/LedgerTable";
import { isCardVariant } from "./_lib/variants";

function isTransactionKind(value: unknown): value is TransactionKind {
  return TRANSACTION_KINDS.includes(value as TransactionKind);
}

export default async function TransactionsPage() {
  const userId = await requireUserId();
  const supabase = await getSupabaseServer();
  const prefs = await loadUserPreferences(userId);
  const displayCurrency = prefs.displayCurrency;
  const heldValueCurrency = PRICE_SOURCE_CURRENCY[prefs.priceSource];

  const [txnRes, ownedRes, psaCardsRes, latestRatesFromEur] = await Promise.all([
    supabase
      .from("transactions")
      .select(
        "id, kind, occurred_at, amount_cents, currency, rate_to_eur, pack_id, card_id, quantity, note, variant, psa_submission_id, packs_opened(set_id)",
      )
      .eq("user_id", userId)
      .order("occurred_at", { ascending: false }),
    supabase
      .from("owned_cards")
      .select("card_id, quantity")
      .eq("user_id", userId),
    // For each PSA submission referenced in the ledger we want to show
    // a card count next to the fee row. One round-trip groups all of
    // them up front.
    supabase
      .from("psa_submission_cards")
      .select("submission_id, card_id, psa_submissions!inner(user_id)")
      .eq("psa_submissions.user_id", userId),
    // Cached for 24h by Next.js's fetch — essentially free after the
    // first render of the day.
    getLatestRatesFromEur(),
  ]);

  // Pricing the held value mirrors the portfolio page so the two pages
  // agree on the same number for the same set of cards.
  const owned = ownedRes.data ?? [];
  const ownedQuantities = new Map<string, number>();
  for (const r of owned) {
    ownedQuantities.set(
      r.card_id as string,
      (r.quantity as number | null) ?? 1,
    );
  }
  const priceMap = await fetchPricesForCards(ownedQuantities.keys());
  const { total: heldValueUnits } = sumPricesByQuantity(
    priceMap,
    ownedQuantities,
    prefs.priceSource,
  );
  const heldValueCentsNative = Math.round(heldValueUnits * 100);
  // Held value comes priced in the chosen marketplace's native currency
  // (USD for TCGplayer, EUR for Cardmarket). Convert at today's rate so
  // the KPI math sums with ledger totals which are in displayCurrency.
  const heldValueCents =
    convertCents(
      heldValueCentsNative,
      heldValueCurrency,
      displayCurrency,
      // No snapshot — market values are always "as of now".
      heldValueCurrency === "EUR"
        ? 1
        : 1 / (latestRatesFromEur[heldValueCurrency] ?? 1),
      latestRatesFromEur,
    ) ?? heldValueCentsNative;

  const allCards = await getAllCards();
  const cardInfoById = new Map<string, LedgerTableCardInfo>();
  // Only build entries for cards that appear in transactions to keep the
  // map tight — checked below as we walk the rows.
  const referencedCardIds = new Set<string>();
  for (const r of txnRes.data ?? []) {
    const cid = (r as { card_id: string | null }).card_id;
    if (cid) referencedCardIds.add(cid);
  }
  for (const c of allCards) {
    if (!referencedCardIds.has(c.id)) continue;
    cardInfoById.set(c.id, {
      id: c.id,
      name: c.name,
      setId: c.setId,
      number: c.number,
      imageSmall: c.imageSmall,
    });
  }

  const setNameById = new Map(SETS.map((s) => [s.id, s.name] as const));

  const psaCardCountById = new Map<string, number>();
  for (const r of psaCardsRes.data ?? []) {
    const sid = (r as { submission_id: string }).submission_id;
    psaCardCountById.set(sid, (psaCardCountById.get(sid) ?? 0) + 1);
  }

  // Supabase types the embedded `packs_opened` join as an array even
  // though our FK is N:1; in practice it has 0 or 1 element.
  const rawRows = (txnRes.data ?? []) as unknown as Array<{
    id: string;
    kind: string;
    occurred_at: string;
    amount_cents: number;
    currency: string;
    rate_to_eur: number | string | null;
    pack_id: string | null;
    card_id: string | null;
    quantity: number | null;
    note: string | null;
    variant: string | null;
    psa_submission_id: string | null;
    packs_opened: { set_id: string | null } | { set_id: string | null }[] | null;
  }>;

  const tableRows: LedgerTableRow[] = [];
  for (const r of rawRows) {
    if (!isTransactionKind(r.kind)) continue;
    if (!isLedgerCurrency(r.currency)) continue;
    const pack = Array.isArray(r.packs_opened) ? r.packs_opened[0] ?? null : r.packs_opened;
    const setId = pack?.set_id ?? null;
    // Supabase returns numeric columns as strings to preserve precision;
    // we only need 4–6 significant figures for FX so Number() is fine.
    const rateToEur =
      r.rate_to_eur == null ? null : Number(r.rate_to_eur);
    tableRows.push({
      id: r.id,
      kind: r.kind,
      occurredAt: r.occurred_at,
      amountCents: r.amount_cents,
      currency: r.currency,
      rateToEur: Number.isFinite(rateToEur) ? rateToEur : null,
      packId: r.pack_id,
      cardId: r.card_id,
      quantity: r.quantity,
      note: r.note,
      psaSubmissionId: r.psa_submission_id,
      setName: setId ? setNameById.get(setId) ?? null : null,
      card: r.card_id ? cardInfoById.get(r.card_id) ?? null : null,
      psaCardCount: r.psa_submission_id
        ? psaCardCountById.get(r.psa_submission_id) ?? 0
        : null,
      variant: isCardVariant(r.variant) ? r.variant : null,
    });
  }

  const ledgerRows: LedgerRow[] = tableRows;
  const kpis = computeKpis(ledgerRows, displayCurrency, latestRatesFromEur);
  const netPositionCents = computeNetPositionCents(kpis, heldValueCents);

  return (
    <div className="mx-auto max-w-[1280px]">
      <LedgerRealtime userId={userId} />
      <PageHeader title="Transactions" />

      <LedgerHero
        kpis={kpis}
        heldValueCents={heldValueCents}
        netPositionCents={netPositionCents}
        displayCurrency={displayCurrency}
        priceSource={prefs.priceSource}
      />

      <div className="mt-6 flex justify-end">
        <ActionsBar defaultCurrency={displayCurrency} />
      </div>

      <div className="mt-4">
        <LedgerControls
          rows={tableRows}
          defaultCurrency={displayCurrency}
          displayCurrency={displayCurrency}
          latestRatesFromEur={latestRatesFromEur}
        />
      </div>
    </div>
  );
}
