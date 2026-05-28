import Link from "next/link";
import { formatMoneyCents, type LedgerCurrency } from "@/lib/ledger/money";
import type { LedgerKpis } from "@/lib/ledger/aggregates";
import {
  PRICE_SOURCE_LABEL,
  type PriceSource,
} from "@/lib/pricing/pokemontcg";

interface Props {
  kpis: LedgerKpis;
  heldValueCents: number;
  netPositionCents: number;
  displayCurrency: LedgerCurrency;
  priceSource: PriceSource;
}

// Net position leads — that's the user's actual answer to "am I ahead?".
// The supporting numbers (spent, earned, held) sit below in a quieter row,
// matching the PortfolioHero rhythm where one number dominates and the
// rest flow beneath as compact prose.
//
// All values arrive pre-converted into displayCurrency by the page's
// computeKpis call, so this component just formats — no MoneyDisplay
// tooltips needed here; the per-row tooltips in LedgerTable expose the
// original amounts.
export function LedgerHero({
  kpis,
  heldValueCents,
  netPositionCents,
  displayCurrency,
  priceSource,
}: Props) {
  const ahead = netPositionCents >= 0;

  return (
    <section className="border-y border-border py-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div className="space-y-1.5">
          <p className="eyebrow">Net position</p>
          <p
            className={[
              "text-4xl font-semibold tracking-tight tabular-nums md:text-5xl",
              ahead ? "text-covered" : "text-missing",
            ].join(" ")}
            aria-label={`Net position ${formatMoneyCents(netPositionCents, displayCurrency)}`}
          >
            {ahead ? "+" : "−"}
            {formatMoneyCents(Math.abs(netPositionCents), displayCurrency)}
          </p>
          <p className="text-xs text-muted">
            held value − net spent · {displayCurrency} via{" "}
            <Link
              href="/settings"
              className="underline decoration-border-strong underline-offset-2 hover:text-text"
            >
              {PRICE_SOURCE_LABEL[priceSource]}
            </Link>
          </p>
        </div>

        <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-sm md:grid-cols-4 md:text-right">
          <Stat label="Spent" value={formatMoneyCents(kpis.totalSpentCents, displayCurrency)} />
          <Stat label="Earned" value={formatMoneyCents(kpis.totalEarnedCents, displayCurrency)} />
          <Stat
            label="Net cash flow"
            value={
              (kpis.netCashFlowCents >= 0 ? "+" : "−") +
              formatMoneyCents(Math.abs(kpis.netCashFlowCents), displayCurrency)
            }
            tone={kpis.netCashFlowCents >= 0 ? "pos" : "neg"}
          />
          <Stat label="Held" value={formatMoneyCents(heldValueCents, displayCurrency)} />
        </dl>
      </div>
    </section>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "pos" | "neg";
}) {
  return (
    <div className="flex flex-col items-start md:items-end">
      <dt className="text-[11px] uppercase tracking-wider text-muted">{label}</dt>
      <dd
        className={[
          "text-base font-semibold tabular-nums",
          tone === "pos" ? "text-covered" : tone === "neg" ? "text-missing" : "text-text",
        ].join(" ")}
      >
        {value}
      </dd>
    </div>
  );
}
