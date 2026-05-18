import Link from "next/link";
import {
  formatPrice,
  PRICE_SOURCE_LABEL,
  type PriceSource,
} from "@/lib/pricing/pokemontcg";

interface Props {
  portfolioValue: number;
  pricedCount: number;
  totalCards: number;
  distinctSpecies: number;
  packsOpened: number;
  favoritesCount: number;
  priceSource: PriceSource;
}

// One commitment to a single dominant number — the collection's current
// market value — with everything else flowing in beneath it as compact
// supporting prose. No tiles, no equal-weighted grid: the layout is
// asymmetric on purpose so the eye lands on the value first.
export function PortfolioHero({
  portfolioValue,
  pricedCount,
  totalCards,
  distinctSpecies,
  packsOpened,
  favoritesCount,
  priceSource,
}: Props) {
  const showSpecies = distinctSpecies !== totalCards;
  // Compose the meta line as plain phrases joined by middle-dots. Beats a
  // strip of look-alike chips, lighter in weight, easier to extend.
  const meta: string[] = [`${totalCards.toLocaleString()} cards`];
  if (showSpecies) meta.push(`${distinctSpecies.toLocaleString()} species`);
  meta.push(`${packsOpened.toLocaleString()} packs`);
  if (favoritesCount > 0) {
    meta.push(`${favoritesCount.toLocaleString()} favorite${favoritesCount === 1 ? "" : "s"}`);
  }

  return (
    <section className="border-y border-border py-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div className="space-y-1.5">
          <p className="eyebrow">Portfolio value</p>
          <p
            className="text-4xl font-semibold tracking-tight tabular-nums md:text-5xl"
            aria-label={`Portfolio value ${formatPrice(portfolioValue, priceSource)}`}
          >
            {formatPrice(portfolioValue, priceSource)}
          </p>
          <p className="text-xs text-muted">
            via{" "}
            <Link
              href="/settings"
              className="underline decoration-border-strong underline-offset-2 hover:text-text"
            >
              {PRICE_SOURCE_LABEL[priceSource]}
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
    </section>
  );
}
