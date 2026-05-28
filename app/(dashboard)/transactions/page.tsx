import { getSupabaseServer } from "@/lib/supabase/server";
import { SETS } from "@/lib/data";
import { getAllCards } from "@/lib/data/binder-scope";
import {
  fetchPricesForCards,
  PRICE_SOURCE_CURRENCY,
  sumPricesByQuantity,
} from "@/lib/pricing/pokemontcg";
import {
  computeKpis,
  computeNetPositionCents,
  TRANSACTION_KINDS,
  type LedgerRow,
  type TransactionKind,
} from "@/lib/ledger/aggregates";
import { Receipt } from "lucide-react";
import { isLedgerCurrency } from "@/lib/ledger/money";
import { PageHeader } from "../_components/PageHeader";
import { requireUserId } from "../_lib/current-user";
import { loadUserPreferences } from "../_lib/user-preferences";
import { ActionsBar } from "./_components/ActionsBar";
import { LedgerHero } from "./_components/LedgerHero";
import { LedgerRealtime } from "./_components/LedgerRealtime";
import {
  LedgerTable,
  type LedgerTableCardInfo,
  type LedgerTableRow,
} from "./_components/LedgerTable";

function isTransactionKind(value: unknown): value is TransactionKind {
  return TRANSACTION_KINDS.includes(value as TransactionKind);
}

export default async function TransactionsPage() {
  const userId = await requireUserId();
  const supabase = await getSupabaseServer();
  const prefs = await loadUserPreferences(userId);
  const displayCurrency = PRICE_SOURCE_CURRENCY[prefs.priceSource];

  const [txnRes, ownedRes, psaCardsRes] = await Promise.all([
    supabase
      .from("transactions")
      .select(
        "id, kind, occurred_at, amount_cents, currency, pack_id, card_id, quantity, note, psa_submission_id, packs_opened(set_id)",
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
  const heldValueCents = Math.round(heldValueUnits * 100);

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
    pack_id: string | null;
    card_id: string | null;
    quantity: number | null;
    note: string | null;
    psa_submission_id: string | null;
    packs_opened: { set_id: string | null } | { set_id: string | null }[] | null;
  }>;

  const tableRows: LedgerTableRow[] = [];
  for (const r of rawRows) {
    if (!isTransactionKind(r.kind)) continue;
    if (!isLedgerCurrency(r.currency)) continue;
    const pack = Array.isArray(r.packs_opened) ? r.packs_opened[0] ?? null : r.packs_opened;
    const setId = pack?.set_id ?? null;
    tableRows.push({
      id: r.id,
      kind: r.kind,
      occurredAt: r.occurred_at,
      amountCents: r.amount_cents,
      currency: r.currency,
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
    });
  }

  const ledgerRows: LedgerRow[] = tableRows;
  const kpis = computeKpis(ledgerRows, displayCurrency);
  const netPositionCents = computeNetPositionCents(kpis, heldValueCents);

  return (
    <div className="mx-auto max-w-[1280px]">
      <LedgerRealtime userId={userId} />
      <PageHeader icon={Receipt} title="Transactions" />

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
        <LedgerTable rows={tableRows} defaultCurrency={displayCurrency} />
      </div>
    </div>
  );
}
