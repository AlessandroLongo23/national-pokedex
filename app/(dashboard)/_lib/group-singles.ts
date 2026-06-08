import type { Currency } from "@/lib/pricing/currencies";
import { convertCents } from "@/lib/pricing/exchange-rates";

/** Most frequent currency in the list; first-seen wins a tie; null if empty. */
export function majorityCurrency(currencies: Currency[]): Currency | null {
  const counts = new Map<Currency, number>();
  let best: Currency | null = null;
  let bestN = 0;
  for (const c of currencies) {
    const n = (counts.get(c) ?? 0) + 1;
    counts.set(c, n);
    // Strict `>` keeps the FIRST currency to reach a given count on ties.
    if (n > bestN) {
      bestN = n;
      best = c;
    }
  }
  return best;
}

export interface SingleAmount {
  /** Signed cents from the ledger (purchases are negative). */
  amountCents: number;
  currency: Currency;
  rateToEur: number | null;
}

/** Sum of |amount| converted into `target`, skipping rows that can't convert. */
export function suggestedLotTotalCents(
  rows: SingleAmount[],
  target: Currency,
  latestRatesFromEur: Record<Currency, number>,
): number {
  let total = 0;
  for (const r of rows) {
    const converted = convertCents(
      Math.abs(r.amountCents),
      r.currency,
      target,
      r.rateToEur,
      latestRatesFromEur,
    );
    if (converted != null) total += converted;
  }
  return total;
}
