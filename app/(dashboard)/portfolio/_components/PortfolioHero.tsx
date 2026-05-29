import Link from "next/link";
import {
  formatPrice,
  PRICE_SOURCE_NAME,
  type DisplayConversion,
  type PriceSource,
} from "@/lib/pricing/pokemontcg";

export interface UnpricedCard {
  id: string;
  name: string;
  setId: string;
  number: string;
}

interface Props {
  portfolioValue: number;
  pricedCount: number;
  totalCards: number;
  /** Sum of `owned_cards.quantity`. Equal to `totalCards` when every card
   * has qty 1; surfaced as a separate "copies" stat when duplicates exist. */
  totalCopies?: number;
  distinctSpecies: number;
  packsOpened: number;
  priceSource: PriceSource;
  unpricedCards: UnpricedCard[];
  display: DisplayConversion;
}

const UNPRICED_LIST_LIMIT = 60;

// One commitment to a single dominant number — the collection's current
// market value — with everything else flowing in beneath it as compact
// supporting prose. No tiles, no equal-weighted grid: the layout is
// asymmetric on purpose so the eye lands on the value first.
//
// When the headline value is missing data (some owned cards have no price
// at the active source), an inline <details> discloses the unpriced cards
// directly under the hero. The point is trust: a portfolio number is only
// as honest as the gap it acknowledges.
export function PortfolioHero({
  portfolioValue,
  pricedCount,
  totalCards,
  totalCopies,
  distinctSpecies,
  packsOpened,
  priceSource,
  unpricedCards,
  display,
}: Props) {
  const showSpecies = distinctSpecies !== totalCards;
  const showCopies = totalCopies != null && totalCopies > totalCards;
  const unpricedCount = unpricedCards.length;
  // Compose the meta line as plain phrases joined by middle-dots. Beats a
  // strip of look-alike chips, lighter in weight, easier to extend.
  const meta: string[] = [`${totalCards.toLocaleString()} cards`];
  if (showCopies) meta.push(`${totalCopies.toLocaleString()} copies`);
  if (showSpecies) meta.push(`${distinctSpecies.toLocaleString()} species`);
  meta.push(`${packsOpened.toLocaleString()} packs`);

  return (
    <section className="border-y border-border py-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div className="space-y-1.5">
          <p className="eyebrow">Portfolio value</p>
          <p
            className="text-4xl font-semibold tracking-tight tabular-nums md:text-5xl"
            aria-label={`Portfolio value ${formatPrice(portfolioValue, priceSource, display)}`}
          >
            {formatPrice(portfolioValue, priceSource, display)}
          </p>
          <p className="text-xs text-muted">
            via{" "}
            <Link
              href="/settings"
              className="underline decoration-border-strong underline-offset-2 hover:text-text"
            >
              {PRICE_SOURCE_NAME[priceSource]}
            </Link>
            {totalCards > 0 && (
              <>
                {" · "}
                <span className="tabular-nums">
                  {pricedCount.toLocaleString()} of {totalCards.toLocaleString()}
                </span>{" "}
                cards priced
              </>
            )}
          </p>
        </div>

        <p className="text-sm text-muted tabular-nums md:text-right">
          {meta.join(" · ")}
        </p>
      </div>

      {unpricedCount > 0 && (
        <details className="group mt-4">
          <summary className="eyebrow cursor-pointer list-none [&::-webkit-details-marker]:hidden hover:text-text">
            <span className="inline-block w-3 text-muted transition-transform group-open:rotate-90">
              ›
            </span>{" "}
            {unpricedCount.toLocaleString()}{" "}
            {unpricedCount === 1 ? "card" : "cards"} not priced
          </summary>
          <ul className="mt-3 grid gap-x-6 gap-y-1 text-xs text-muted md:grid-cols-2 lg:grid-cols-3">
            {unpricedCards.slice(0, UNPRICED_LIST_LIMIT).map((c) => (
              <li
                key={c.id}
                className="flex items-baseline justify-between gap-3"
              >
                <span className="truncate">{c.name}</span>
                <span className="shrink-0 tabular-nums text-muted">
                  {c.setId}-{c.number}
                </span>
              </li>
            ))}
          </ul>
          {unpricedCount > UNPRICED_LIST_LIMIT && (
            <p className="mt-2 text-[11px] text-muted tabular-nums">
              + {unpricedCount - UNPRICED_LIST_LIMIT} more
            </p>
          )}
        </details>
      )}
    </section>
  );
}
