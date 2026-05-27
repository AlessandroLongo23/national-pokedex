import Link from "next/link";
import { ExternalLink } from "lucide-react";
import {
  fetchSingleCardPrice,
  formatPrice,
  pickPrice,
  pickUrl,
  PRICE_SOURCE_LABEL,
  type PriceSource,
} from "@/lib/pricing/pokemontcg";

// Lives in its own async server component so the rest of the card-detail
// page can stream first while pokemontcg.io is still resolving. Wrap with
// <Suspense fallback={<MarketPriceFallback/>}> at the call site.
export async function MarketPriceBlock({
  cardId,
  priceSource,
  isAuthed,
}: {
  cardId: string;
  priceSource: PriceSource;
  isAuthed: boolean;
}) {
  const price = await fetchSingleCardPrice(cardId);
  const value = pickPrice(price, priceSource);
  const marketplaceUrl = pickUrl(price, priceSource);
  const marketplaceName = priceSource === "tcgplayer" ? "TCGplayer" : "Cardmarket";

  return (
    <>
      <p
        className={[
          "text-2xl font-semibold tabular-nums",
          value != null ? "text-text" : "text-muted",
        ].join(" ")}
        title={`Market price — ${PRICE_SOURCE_LABEL[priceSource]}`}
      >
        {value != null ? formatPrice(value, priceSource) : "—"}
      </p>
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
