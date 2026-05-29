import Link from "next/link";
import { ExternalLink } from "lucide-react";
import {
  fetchSingleCardPrice,
  pickPrice,
  pickUrl,
  PRICE_SOURCE_CURRENCY,
  PRICE_SOURCE_LABEL,
  type PriceSource,
} from "@/lib/pricing/pokemontcg";
import type { Currency } from "@/lib/pricing/currencies";
import { getLatestRatesFromEur } from "@/lib/pricing/exchange-rates";
import { MoneyDisplay } from "../../../_components/MoneyDisplay";
import { Tooltip } from "../../../_components/Tooltip";

// Lives in its own async server component so the rest of the card-detail
// page can stream first while pokemontcg.io is still resolving. Wrap with
// <Suspense fallback={<MarketPriceFallback/>}> at the call site.
export async function MarketPriceBlock({
  cardId,
  priceSource,
  displayCurrency,
  isAuthed,
}: {
  cardId: string;
  priceSource: PriceSource;
  displayCurrency: Currency;
  isAuthed: boolean;
}) {
  const [price, latestRatesFromEur] = await Promise.all([
    fetchSingleCardPrice(cardId),
    getLatestRatesFromEur(),
  ]);
  const value = pickPrice(price, priceSource);
  const marketplaceUrl = pickUrl(price, priceSource);
  const marketplaceName = priceSource === "tcgplayer" ? "TCGplayer" : "Cardmarket";
  const nativeCurrency = PRICE_SOURCE_CURRENCY[priceSource];
  const valueCents = value != null ? Math.round(value * 100) : null;

  return (
    <>
      <Tooltip content={`Market price, ${PRICE_SOURCE_LABEL[priceSource]}`}>
        <p
          className={[
            "text-2xl font-semibold tabular-nums",
            value != null ? "text-text" : "text-muted",
          ].join(" ")}
        >
          {valueCents != null ? (
            <MoneyDisplay
              cents={valueCents}
              currency={nativeCurrency}
              displayCurrency={displayCurrency}
              rateToEur={null}
              latestRatesFromEur={latestRatesFromEur}
            />
          ) : (
            "—"
          )}
        </p>
      </Tooltip>
      {marketplaceUrl && (
        <a
          href={marketplaceUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-1 inline-flex items-center gap-1 text-[11px] text-muted underline decoration-border-strong underline-offset-2 hover:text-text"
        >
          View on {marketplaceName}
          <ExternalLink className="h-3 w-3" aria-hidden />
        </a>
      )}
      <p className="text-[11px] text-muted">
        via{" "}
        {isAuthed ? (
          <Link
            href="/settings"
            className="underline decoration-border-strong underline-offset-2 hover:text-text"
          >
            {PRICE_SOURCE_LABEL[priceSource]}
          </Link>
        ) : (
          <span>{PRICE_SOURCE_LABEL[priceSource]}</span>
        )}
      </p>
    </>
  );
}

export function MarketPriceFallback({
  priceSource,
  isAuthed,
}: {
  priceSource: PriceSource;
  isAuthed: boolean;
}) {
  return (
    <>
      <p className="h-8 w-20 animate-pulse rounded bg-panel-2" aria-hidden />
      <p className="mt-1 text-[11px] text-muted">
        via{" "}
        {isAuthed ? (
          <Link
            href="/settings"
            className="underline decoration-border-strong underline-offset-2 hover:text-text"
          >
            {PRICE_SOURCE_LABEL[priceSource]}
          </Link>
        ) : (
          <span>{PRICE_SOURCE_LABEL[priceSource]}</span>
        )}
      </p>
    </>
  );
}
