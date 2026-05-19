// Pure aggregations over ledger rows. Lives outside the route group so
// it can be unit-tested without a Supabase client. Multi-currency rule
// per the plan: aggregations are per-currency; rows that don't match the
// display currency are counted under `excludedCount` so the UI can
// surface the gap honestly rather than pretending we converted.

import type { LedgerCurrency } from "./money";

export const TRANSACTION_KINDS = [
  "pack_purchase",
  "single_purchase",
  "sale",
  "psa_fee",
] as const;
export type TransactionKind = (typeof TRANSACTION_KINDS)[number];

export interface LedgerRow {
  id: string;
  kind: TransactionKind;
  occurredAt: string;
  amountCents: number;
  currency: LedgerCurrency;
  packId: string | null;
  cardId: string | null;
  quantity: number | null;
  note: string | null;
  psaSubmissionId: string | null;
}

export interface LedgerKpis {
  totalSpentCents: number;
  totalEarnedCents: number;
  netCashFlowCents: number;
  /** Rows whose currency != the display currency. The UI surfaces this
   * count so the user knows some activity is hidden from the totals. */
  excludedCount: number;
}

export function computeKpis(
  rows: readonly LedgerRow[],
  displayCurrency: LedgerCurrency,
): LedgerKpis {
  let totalSpent = 0;
  let totalEarned = 0;
  let excluded = 0;
  for (const r of rows) {
    if (r.currency !== displayCurrency) {
      excluded++;
      continue;
    }
    if (r.amountCents < 0) totalSpent += -r.amountCents;
    else totalEarned += r.amountCents;
  }
  return {
    totalSpentCents: totalSpent,
    totalEarnedCents: totalEarned,
    netCashFlowCents: totalEarned - totalSpent,
    excludedCount: excluded,
  };
}

// Net position = how the user stands overall:
//   held cards' current market value − net money out so far.
// When net cash flow is negative (typical), this is held + abs(netSpent),
// i.e. "you spent X cents, your cards are worth Y, you're ahead by Y−X".
export function computeNetPositionCents(
  kpis: LedgerKpis,
  heldValueCents: number,
): number {
  return heldValueCents + kpis.netCashFlowCents;
}
