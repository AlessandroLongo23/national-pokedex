// A bulk lot logged without a price creates a `card_lots` row (and adds
// its cards to the collection) but NO `lot_purchase` transaction row —
// see syncLotPurchaseTransaction in _lib/lot-actions.ts, which skips the
// ledger row when cost is null. Those lots would otherwise be invisible
// on the Transactions page, which renders only the `transactions` table.
//
// This helper turns each such orphan into a synthetic ledger row flagged
// `unpriced`, so it shows inline in the ledger with an "add a price"
// prompt instead of being silently lost. Adding a price (via the lot
// editor) creates the real transaction and the synthetic row disappears.

import type { LedgerCurrency } from "@/lib/ledger/money";
import type { LedgerTableRow } from "../_components/LedgerTable";

export interface RawLot {
  id: string;
  purchased_at: string;
}

export function buildUnpricedLotRows(
  lots: readonly RawLot[],
  pricedLotIds: ReadonlySet<string>,
  lotCardCountById: ReadonlyMap<string, number>,
  displayCurrency: LedgerCurrency,
): LedgerTableRow[] {
  const rows: LedgerTableRow[] = [];
  for (const lot of lots) {
    if (pricedLotIds.has(lot.id)) continue;
    rows.push({
      id: lot.id,
      kind: "lot_purchase",
      occurredAt: lot.purchased_at,
      // Placeholder — never rendered or summed; `unpriced` gates both.
      amountCents: 0,
      currency: displayCurrency,
      rateToEur: null,
      packId: null,
      lotId: lot.id,
      cardId: null,
      quantity: null,
      note: null,
      psaSubmissionId: null,
      setName: null,
      card: null,
      psaCardCount: null,
      lotCardCount: lotCardCountById.get(lot.id) ?? 0,
      variant: null,
      unpriced: true,
    });
  }
  return rows;
}
