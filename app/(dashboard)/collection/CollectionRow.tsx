"use client";

import Link from "next/link";
import { memo } from "react";
import { ArrowUpRight, Check, Minus, Plus, Star } from "lucide-react";
import { formatSetCode, getSet } from "@/lib/data";
import type { CardEntry } from "@/lib/data/types";
import { formatPriceCompact, pickPrice } from "@/lib/pricing/pokemontcg";
import { RARITY_ABBR, RARITY_COLOR } from "../_lib/rarity";
import { useOwnedCards } from "../_lib/OwnedCardsContext";
import { useFavorites } from "../_lib/FavoritesContext";
import { useCardPrice } from "../_lib/CardPricesContext";
import { useUser } from "../_lib/UserContext";
import { Separator } from "../_components/Separator";
import { Tooltip } from "../_components/Tooltip";

// One owned card as a horizontal list row. Mirrors the grid tile's owned
// interactions — adjust quantity, favorite, open — in a compact form.
function RowBase({ card }: { card: CardEntry }) {
  const { adjust: adjustOwned, quantityOf } = useOwnedCards();
  const { isFavorited, toggle: toggleFavorite } = useFavorites();
  const { priceSource, isGuest, display } = useUser();
  const price = pickPrice(useCardPrice(card.id), priceSource);
  const set = getSet(card.setId);
  const quantity = quantityOf(card.id);
  const favorited = isFavorited(card.id);
  const detailsHref = card.dex.length > 0 ? `/pokedex/${card.dex[0]}` : null;

  return (
    <div className="group flex items-center gap-3 rounded-lg border border-border/70 bg-panel/50 px-2.5 py-2 transition hover:border-border-strong hover:bg-panel-2/60">
      <Link
        href={`/cards/${encodeURIComponent(card.id)}`}
        prefetch={false}
        className="relative block w-10 shrink-0 overflow-hidden rounded-[5px] border border-owned/70 bg-panel-2"
        style={{ aspectRatio: "245 / 342" }}
        aria-label={`Open ${card.name}`}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={card.imageSmall}
          alt={card.name}
          loading="lazy"
          className="h-full w-full object-cover"
        />
      </Link>

      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium text-text">{card.name}</div>
        <div className="mt-0.5 flex items-baseline gap-1.5 text-[11px] nums text-muted">
          {set && (
            <>
              <span
                className="rounded-sm bg-panel-2 px-1 py-px text-[10px] font-medium uppercase tracking-wider text-muted"
                title={set.name}
              >
                {formatSetCode(set.id)}
              </span>
              <Separator />
            </>
          )}
          <span
            className={["font-medium", RARITY_COLOR[card.rarity]].join(" ")}
            title={card.rarityRaw}
          >
            {RARITY_ABBR[card.rarity]}
          </span>
          <Separator />
          <span className="font-medium text-text">#{card.number}</span>
          {price != null && (
            <>
              <Separator />
              <span className="font-medium tabular-nums text-text">
                {formatPriceCompact(price, priceSource, display)}
              </span>
            </>
          )}
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-1.5">
        {!isGuest && (
          <>
            <div
              className="inline-flex h-7 items-stretch overflow-hidden rounded-md border border-owned/70 bg-owned/15 text-owned"
              role="group"
              aria-label={`Owned — ${quantity} ${quantity === 1 ? "copy" : "copies"}`}
            >
              <Tooltip content={quantity > 1 ? "One fewer copy" : "Remove from collection"}>
                <button
                  type="button"
                  onClick={() => adjustOwned(card.id, -1)}
                  aria-label={
                    quantity > 1
                      ? `Decrease ${card.name} quantity`
                      : `Remove ${card.name} from collection`
                  }
                  className="inline-flex w-6 items-center justify-center transition hover:bg-owned/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-inset"
                >
                  <Minus className="h-3 w-3" strokeWidth={2.5} aria-hidden />
                </button>
              </Tooltip>
              <span
                className="inline-flex min-w-7 items-center justify-center gap-0.5 border-x border-owned/40 bg-owned/10 px-1.5 text-[11px] font-semibold leading-none tabular-nums"
                aria-hidden
              >
                <Check className="h-3 w-3" strokeWidth={3} />
                <span className="ml-0.5">×{quantity}</span>
              </span>
              <Tooltip content="One more copy">
                <button
                  type="button"
                  onClick={() => adjustOwned(card.id, +1)}
                  aria-label={`Add another copy of ${card.name}`}
                  className="inline-flex w-6 items-center justify-center transition hover:bg-owned/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-inset"
                >
                  <Plus className="h-3 w-3" strokeWidth={2.5} aria-hidden />
                </button>
              </Tooltip>
            </div>
            <Tooltip content={favorited ? "Favorited, click to remove" : "Mark as favorite"}>
              <button
                type="button"
                onClick={() => toggleFavorite(card.id)}
                aria-pressed={favorited}
                aria-label="Toggle favorite"
                className={[
                  "inline-flex h-7 min-w-7 items-center justify-center rounded-md border px-1.5 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent",
                  favorited
                    ? "border-[#fcd34d]/70 bg-[#fcd34d]/15 text-[#fcd34d]"
                    : "border-border bg-panel-2 text-muted hover:border-[#fcd34d] hover:text-[#fcd34d]",
                ].join(" ")}
              >
                <Star
                  className="h-3.5 w-3.5"
                  fill={favorited ? "currentColor" : "none"}
                  strokeWidth={2}
                  aria-hidden
                />
              </button>
            </Tooltip>
          </>
        )}
        {detailsHref && (
          <Tooltip content="See Pokémon details">
            <Link
              href={detailsHref}
              className="inline-flex h-7 min-w-7 items-center justify-center rounded-md border border-border bg-panel-2 px-1.5 text-muted transition hover:border-accent hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              aria-label="Pokémon details"
            >
              <ArrowUpRight className="h-3.5 w-3.5" aria-hidden />
            </Link>
          </Tooltip>
        )}
      </div>
    </div>
  );
}

export const CollectionRow = memo(RowBase);
