import { Suspense } from "react";
import { getSupabaseServer } from "@/lib/supabase/server";
import { SETS } from "@/lib/data";
import { getAllCards } from "@/lib/data/binder-scope";
import { getLatestRatesFromEur } from "@/lib/pricing/exchange-rates";
import {
  computeKpis,
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
import { LedgerControls } from "./_components/LedgerControls";
import { LedgerHero } from "./_components/LedgerHero";
import { LedgerRealtime } from "./_components/LedgerRealtime";
import {
  type LedgerTableCardInfo,
  type LedgerTableRow,
} from "./_components/LedgerTable";
import { isCardVariant } from "./_lib/variants";
import {
  buildUnpricedLotRows,
  buildUnpricedPackRows,
} from "./_lib/unpriced-rows";
import { UndisplayableNotice } from "./_components/UndisplayableNotice";
import {
  HeldStat,
  HeldStatSkeleton,
  NetPositionSkeleton,
  NetPositionValue,
} from "./_components/PricedHeroStats";
import { computeHeldValueCents } from "./_lib/held-value";

function isTransactionKind(value: unknown): value is TransactionKind {
  return TRANSACTION_KINDS.includes(value as TransactionKind);
}

export default async function TransactionsPage() {
  const userId = await requireUserId();
  const supabase = await getSupabaseServer();
  const prefs = await loadUserPreferences(userId);
  const displayCurrency = prefs.displayCurrency;

  // Kicked off here but deliberately NOT awaited: pricing is the slowest
  // thing on this page by an order of magnitude, and only two hero
  // figures need it. Starting it now means it runs while the queries
  // below do their work; handing the promise to Suspense boundaries at
  // the bottom means the ledger renders without waiting for it.
  const heldValuePromise = computeHeldValueCents(
    userId,
    prefs.priceSource,
    displayCurrency,
  );

  const [
    txnRes,
    psaCardsRes,
    lotContentsRes,
    lotsRes,
    packsRes,
    latestRatesFromEur,
  ] = await Promise.all([
      supabase
        .from("transactions")
        .select(
          "id, kind, occurred_at, amount_cents, currency, rate_to_eur, pack_id, lot_id, card_id, quantity, note, variant, psa_submission_id, packs_opened(set_id)",
        )
        .eq("user_id", userId)
        .order("occurred_at", { ascending: false }),
      // For each PSA submission referenced in the ledger we want to show
      // a card count next to the fee row. One round-trip groups all of
      // them up front.
      supabase
        .from("psa_submission_cards")
        .select("submission_id, card_id, psa_submissions!inner(user_id)")
        .eq("psa_submissions.user_id", userId),
      // Distinct-card count per bulk lot, for the "Bulk lot · N cards"
      // ledger label. Same grouping strategy as the PSA counts above.
      supabase
        .from("lot_contents")
        .select("lot_id, card_lots!inner(user_id)")
        .eq("card_lots.user_id", userId),
      // All of the user's bulk lots. A lot logged without a price has no
      // lot_purchase transaction row (see _lib/lot-actions.ts), so it
      // would be invisible in the ledger; we surface those as synthetic
      // "unpriced" rows below so they can never be lost.
      supabase
        .from("card_lots")
        .select("id, purchased_at")
        .eq("user_id", userId),
      // Same story for packs: a pack opened without a cost has no
      // pack_purchase row (see _lib/pack-actions.ts). Fetched in full so
      // the unpriced ones can be synthesized alongside the lots.
      supabase
        .from("packs_opened")
        .select("id, set_id, opened_at")
        .eq("user_id", userId),
      // Cached for 24h by Next.js's fetch — essentially free after the
      // first render of the day.
      getLatestRatesFromEur(),
    ]);

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

  const lotCardCountById = new Map<string, number>();
  for (const r of lotContentsRes.data ?? []) {
    const lid = (r as { lot_id: string }).lot_id;
    lotCardCountById.set(lid, (lotCardCountById.get(lid) ?? 0) + 1);
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
    lot_id: string | null;
    card_id: string | null;
    quantity: number | null;
    note: string | null;
    variant: string | null;
    psa_submission_id: string | null;
    packs_opened: { set_id: string | null } | { set_id: string | null }[] | null;
  }>;

  const tableRows: LedgerTableRow[] = [];
  // Rows the table has no way to render: an unrecognised `kind` has no
  // label or actions, and an unsupported `currency` can't be formatted
  // or converted. Both are impossible through the app's own writes, so
  // a non-zero count here means data arrived from elsewhere (a manual
  // SQL insert, a half-finished migration). Count them and say so
  // rather than dropping them on the floor.
  const undisplayable: Array<{ id: string; reason: string }> = [];
  for (const r of rawRows) {
    if (!isTransactionKind(r.kind) || !isLedgerCurrency(r.currency)) {
      undisplayable.push({
        id: r.id,
        reason: !isTransactionKind(r.kind)
          ? `unrecognised kind "${r.kind}"`
          : `unsupported currency "${r.currency}"`,
      });
      continue;
    }
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
      lotId: r.lot_id,
      cardId: r.card_id,
      quantity: r.quantity,
      note: r.note,
      psaSubmissionId: r.psa_submission_id,
      setName: setId ? setNameById.get(setId) ?? null : null,
      card: r.card_id ? cardInfoById.get(r.card_id) ?? null : null,
      psaCardCount: r.psa_submission_id
        ? psaCardCountById.get(r.psa_submission_id) ?? 0
        : null,
      lotCardCount: r.lot_id ? lotCardCountById.get(r.lot_id) ?? 0 : null,
      variant: isCardVariant(r.variant) ? r.variant : null,
    });
  }

  // Surface lots and packs logged without a price: they have no
  // lot_purchase / pack_purchase row, so they never appear among the
  // transactions above. Synthesize an "unpriced" row for each and merge
  // into the date-sorted ledger.
  const pricedLotIds = new Set<string>();
  const pricedPackIds = new Set<string>();
  for (const r of rawRows) {
    if (r.kind === "lot_purchase" && r.lot_id) pricedLotIds.add(r.lot_id);
    if (r.kind === "pack_purchase" && r.pack_id) pricedPackIds.add(r.pack_id);
  }
  const unpricedRows = [
    ...buildUnpricedLotRows(
      (lotsRes.data ?? []) as Array<{ id: string; purchased_at: string }>,
      pricedLotIds,
      lotCardCountById,
      displayCurrency,
    ),
    ...buildUnpricedPackRows(
      (packsRes.data ?? []) as Array<{
        id: string;
        set_id: string | null;
        opened_at: string;
      }>,
      pricedPackIds,
      setNameById,
      displayCurrency,
    ),
  ];
  if (unpricedRows.length > 0) {
    tableRows.push(...unpricedRows);
    // Transactions arrived occurred_at-desc; re-sort so the synthetic
    // rows slot into the same chronological order.
    tableRows.sort(
      (a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime(),
    );
  }

  const ledgerRows: LedgerRow[] = tableRows;
  const kpis = computeKpis(ledgerRows, displayCurrency, latestRatesFromEur);

  return (
    <div className="mx-auto flex w-full min-h-0 max-w-[1280px] flex-1 flex-col gap-6">
      <LedgerRealtime userId={userId} />
      <div className="shrink-0">
        <PageHeader icon={Receipt} title="Transactions" />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto pr-1">
      <LedgerHero
        kpis={kpis}
        displayCurrency={displayCurrency}
        priceSource={prefs.priceSource}
        netPositionSlot={
          <Suspense fallback={<NetPositionSkeleton />}>
            <NetPositionValue
              heldValuePromise={heldValuePromise}
              kpis={kpis}
              displayCurrency={displayCurrency}
            />
          </Suspense>
        }
        heldSlot={
          <Suspense fallback={<HeldStatSkeleton />}>
            <HeldStat
              heldValuePromise={heldValuePromise}
              displayCurrency={displayCurrency}
            />
          </Suspense>
        }
      />

      <UndisplayableNotice rows={undisplayable} />

      <div className="mt-6 flex justify-start md:justify-end">
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
    </div>
  );
}
