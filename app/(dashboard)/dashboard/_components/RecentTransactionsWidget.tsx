import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { convertCents } from "@/lib/pricing/exchange-rates";
import { formatMoneyCents, type LedgerCurrency } from "@/lib/ledger/money";
import type { TransactionKind } from "@/lib/ledger/aggregates";
import type { Currency } from "@/lib/pricing/currencies";

const KIND_LABEL: Record<TransactionKind, string> = {
  pack_purchase: "Pack",
  single_purchase: "Single",
  sale: "Sale",
  psa_fee: "PSA",
};

export interface RecentTransactionItem {
  id: string;
  kind: TransactionKind;
  occurredAt: string;
  amountCents: number;
  currency: LedgerCurrency;
  rateToEur: number | null;
  description: string;
}

interface Props {
  items: RecentTransactionItem[];
  displayCurrency: Currency;
  latestRatesFromEur: Record<Currency, number>;
}

function shortDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

// The dashboard's ledger tile: the most recent transactions as compact
// rows (kind chip, description, date, signed amount). Amounts are
// converted to the user's display currency the same way the full ledger
// does, so the two pages agree. Spend reads red, money-in reads emerald,
// matching the ledger's amount convention.
export function RecentTransactionsWidget({
  items,
  displayCurrency,
  latestRatesFromEur,
}: Props) {
  return (
    <section className="flex flex-col rounded-xl border border-border bg-panel p-5">
      <header className="flex items-baseline justify-between gap-3">
        <h3 className="text-sm font-semibold tracking-tight">Recent activity</h3>
        <Link
          href="/transactions"
          className="inline-flex items-center gap-1 text-xs text-accent hover:underline"
        >
          View all
          <ArrowRight className="h-3 w-3" aria-hidden />
        </Link>
      </header>

      {items.length === 0 ? (
        <p className="mt-3 rounded-md border border-dashed border-border py-6 text-center text-xs text-muted">
          No transactions logged yet.
        </p>
      ) : (
        <ul className="mt-1 divide-y divide-border">
          {items.map((t) => {
            const displayCents =
              convertCents(
                t.amountCents,
                t.currency,
                displayCurrency,
                t.rateToEur,
                latestRatesFromEur,
              ) ?? t.amountCents;
            const positive = displayCents >= 0;
            return (
              <li key={t.id} className="flex items-center gap-3 py-2.5">
                <span className="shrink-0 rounded-md border border-border bg-panel-2 px-2 py-0.5 text-[11px] uppercase tracking-wider text-muted">
                  {KIND_LABEL[t.kind]}
                </span>
                <span className="min-w-0 flex-1 truncate text-sm">
                  {t.description}
                </span>
                <span className="shrink-0 text-[11px] tabular-nums text-muted">
                  {shortDate(t.occurredAt)}
                </span>
                <span
                  className={[
                    "shrink-0 text-sm font-semibold tabular-nums",
                    positive ? "text-covered" : "text-missing",
                  ].join(" ")}
                >
                  {positive ? "+" : "−"}
                  {formatMoneyCents(Math.abs(displayCents), displayCurrency)}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
