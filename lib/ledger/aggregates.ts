// Pure aggregations over ledger rows. Lives outside the route group so
// it can be unit-tested without a Supabase client.
//
// Multi-currency rule: every row is converted to the user's display
// currency using its snapshot `rate_to_eur` (or today's rate as a
// fallback for legacy rows). No exclusions, no parallel per-currency
// totals — the user picks one currency and the numbers sum cleanly.

import type { Currency } from "@/lib/pricing/currencies";
import { convertCents } from "@/lib/pricing/exchange-rates";

export const TRANSACTION_KINDS = [
  "pack_purchase",
  "single_purchase",
  "sale",
  "psa_fee",
  "lot_purchase",
] as const;
export type TransactionKind = (typeof TRANSACTION_KINDS)[number];

export interface LedgerRow {
  id: string;
  kind: TransactionKind;
  occurredAt: string;
  amountCents: number;
  currency: Currency;
  /** EUR per 1 unit of `currency` on the row's date. Null on legacy
   *  rows that haven't been backfilled — those convert at today's rate
   *  as an approximation. */
  rateToEur: number | null;
  packId: string | null;
  /** Set on lot_purchase rows; links to card_lots.id. */
  lotId: string | null;
  cardId: string | null;
  quantity: number | null;
  note: string | null;
  psaSubmissionId: string | null;
}

export interface LedgerKpis {
  totalSpentCents: number;
  totalEarnedCents: number;
  netCashFlowCents: number;
}

export function computeKpis(
  rows: readonly LedgerRow[],
  displayCurrency: Currency,
  latestRatesFromEur: Record<Currency, number>,
): LedgerKpis {
  let totalSpent = 0;
  let totalEarned = 0;
  for (const r of rows) {
    const converted = convertCents(
      r.amountCents,
      r.currency,
      displayCurrency,
      r.rateToEur,
      latestRatesFromEur,
    );
    if (converted == null) continue;
    if (converted < 0) totalSpent += -converted;
    else totalEarned += converted;
  }
  return {
    totalSpentCents: totalSpent,
    totalEarnedCents: totalEarned,
    netCashFlowCents: totalEarned - totalSpent,
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
