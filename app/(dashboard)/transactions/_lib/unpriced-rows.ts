// A bulk lot or a pack logged without a price creates its own row
// (`card_lots` / `packs_opened`) and adds its cards to the collection,
// but NO transaction row — see syncLotPurchaseTransaction in
// _lib/lot-actions.ts and syncPackPurchaseTransaction in
// _lib/pack-actions.ts, both of which skip the ledger insert when cost
// is null. Those acquisitions would otherwise be invisible on the
// Transactions page, which renders only the `transactions` table.
//
// These helpers turn each such orphan into a synthetic ledger row
// flagged `unpriced`, so it shows inline in the ledger with an "add a
// price" prompt instead of being silently lost. Adding a price (via the
// lot or pack editor) creates the real transaction and the synthetic row
// disappears.

import type { LedgerCurrency } from "@/lib/ledger/money";
import type { LedgerTableRow } from "../_components/LedgerTable";

export interface RawLot {
  id: string;
  purchased_at: string;
}

export interface RawPack {
  id: string;
  set_id: string | null;
  opened_at: string;
}

// Shared shape for both synthetic kinds. Everything a real transaction
// row carries but an orphan cannot: no amount, no rate, no note.
function baseUnpricedRow(
  id: string,
  occurredAt: string,
  displayCurrency: LedgerCurrency,
): Omit<LedgerTableRow, "kind"> {
  return {
    id,
    occurredAt,
    // Placeholder — never rendered or summed; `unpriced` gates both.
    amountCents: 0,
    currency: displayCurrency,
    rateToEur: null,
    packId: null,
    lotId: null,
    cardId: null,
    quantity: null,
    note: null,
    psaSubmissionId: null,
    setName: null,
    card: null,
    psaCardCount: null,
    lotCardCount: null,
    variant: null,
    unpriced: true,
  };
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
      ...baseUnpricedRow(lot.id, lot.purchased_at, displayCurrency),
      kind: "lot_purchase",
      lotId: lot.id,
      lotCardCount: lotCardCountById.get(lot.id) ?? 0,
    });
  }
  return rows;
}

export function buildUnpricedPackRows(
  packs: readonly RawPack[],
  pricedPackIds: ReadonlySet<string>,
  setNameById: ReadonlyMap<string, string>,
  displayCurrency: LedgerCurrency,
): LedgerTableRow[] {
  const rows: LedgerTableRow[] = [];
  for (const pack of packs) {
    if (pricedPackIds.has(pack.id)) continue;
    rows.push({
      ...baseUnpricedRow(pack.id, pack.opened_at, displayCurrency),
      kind: "pack_purchase",
      packId: pack.id,
      setName: pack.set_id ? setNameById.get(pack.set_id) ?? null : null,
    });
  }
  return rows;
}
