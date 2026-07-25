// The two hero figures that depend on live pricing. Each awaits the same
// held-value promise the page kicked off without blocking on, so the
// ledger below is already interactive while these resolve. Both render a
// skeleton in the meantime — see _lib/held-value.ts for why pricing is
// slow enough to be worth this.

import { formatMoneyCents, type LedgerCurrency } from "@/lib/ledger/money";
import {
  computeNetPositionCents,
  type LedgerKpis,
} from "@/lib/ledger/aggregates";
import { Stat } from "./LedgerHero";

// Matches the resolved figure's box so the hero doesn't reflow when the
// real number lands.
function Shimmer({ className }: { className: string }) {
  return (
    <span
      aria-hidden
      className={`inline-block animate-pulse rounded bg-panel-2 align-middle ${className}`}
    />
  );
}

export function NetPositionSkeleton() {
  return (
    <p
      className="text-4xl font-semibold tracking-tight tabular-nums md:text-5xl"
      aria-label="Net position loading"
    >
      <Shimmer className="h-9 w-48 md:h-12 md:w-64" />
    </p>
  );
}

export async function NetPositionValue({
  heldValuePromise,
  kpis,
  displayCurrency,
}: {
  heldValuePromise: Promise<number>;
  kpis: LedgerKpis;
  displayCurrency: LedgerCurrency;
}) {
  const heldValueCents = await heldValuePromise;
  const netPositionCents = computeNetPositionCents(kpis, heldValueCents);
  const ahead = netPositionCents >= 0;
  return (
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
  );
}

export function HeldStatSkeleton() {
  return <Stat label="Held" value={<Shimmer className="h-4 w-20" />} />;
}

export async function HeldStat({
  heldValuePromise,
  displayCurrency,
}: {
  heldValuePromise: Promise<number>;
  displayCurrency: LedgerCurrency;
}) {
  const heldValueCents = await heldValuePromise;
  return (
    <Stat label="Held" value={formatMoneyCents(heldValueCents, displayCurrency)} />
  );
}
