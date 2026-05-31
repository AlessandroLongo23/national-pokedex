import Link from "next/link";
import { ArrowRight } from "lucide-react";
import {
  fetchPricesForCards,
  formatPrice,
  PRICE_SOURCE_NAME,
  sumPricesByQuantity,
  type DisplayConversion,
  type PriceSource,
} from "@/lib/pricing/pokemontcg";

interface Props {
  /** card_id → quantity, for the owned cards being valued. */
  ownedQuantities: Map<string, number>;
  totalCards: number;
  distinctSpecies: number;
  packsOpened: number;
  priceSource: PriceSource;
  display: DisplayConversion;
}

// The dashboard's portfolio tile: one dominant number (current market
// value) with the collection's shape as a compact meta line beneath it.
// The whole tile links through to the full Portfolio page. Pricing is the
// one slow call on the dashboard, so the page renders this inside a
// <Suspense> boundary with PortfolioWidgetFallback below.
export async function PortfolioWidget({
  ownedQuantities,
  totalCards,
  distinctSpecies,
  packsOpened,
  priceSource,
  display,
}: Props) {
  const priceMap = await fetchPricesForCards(ownedQuantities.keys());
  const { total, coveredCount } = sumPricesByQuantity(
    priceMap,
    ownedQuantities,
    priceSource,
  );

  const meta: string[] = [`${totalCards.toLocaleString()} cards`];
  if (distinctSpecies > 0 && distinctSpecies !== totalCards) {
    meta.push(`${distinctSpecies.toLocaleString()} species`);
  }
  meta.push(`${packsOpened.toLocaleString()} ${packsOpened === 1 ? "pack" : "packs"}`);

  return (
    <Link
      href="/portfolio"
      className="group flex flex-col justify-between rounded-xl border border-border bg-panel p-5 transition hover:border-border-strong"
    >
      <div className="flex items-baseline justify-between gap-3">
        <span className="eyebrow">Portfolio value</span>
        <span className="inline-flex items-center gap-1 text-xs text-accent opacity-0 transition group-hover:opacity-100">
          View all
          <ArrowRight className="h-3 w-3" aria-hidden />
        </span>
      </div>
      <p className="mt-3 text-4xl font-semibold tracking-tight tabular-nums">
        {formatPrice(total, priceSource, display)}
      </p>
      <p className="mt-2 text-xs text-muted tabular-nums">{meta.join(" · ")}</p>
      <p className="mt-0.5 text-[11px] text-muted">
        via {PRICE_SOURCE_NAME[priceSource]}
        {totalCards > 0 && (
          <span className="tabular-nums">
            {" · "}
            {coveredCount.toLocaleString()} of {totalCards.toLocaleString()} priced
          </span>
        )}
      </p>
    </Link>
  );
}

export function PortfolioWidgetFallback() {
  return (
    <div className="flex flex-col justify-between rounded-xl border border-border bg-panel p-5">
      <span className="eyebrow">Portfolio value</span>
      <div className="mt-3 h-10 w-40 animate-pulse rounded-md bg-panel-2" />
      <div className="mt-2 h-3 w-52 animate-pulse rounded bg-panel-2" />
      <div className="mt-1 h-2.5 w-32 animate-pulse rounded bg-panel-2" />
    </div>
  );
}
