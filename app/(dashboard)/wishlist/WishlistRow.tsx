"use client";

import Link from "next/link";
import { memo } from "react";
import { ArrowUpRight, Heart, Plus } from "lucide-react";
import { formatSetCode, getSet } from "@/lib/data";
import type { CardEntry } from "@/lib/data/types";
import { formatPriceCompact, pickPrice } from "@/lib/pricing/pokemontcg";
import { RARITY_ABBR, RARITY_COLOR } from "../_lib/rarity";
import { useOwnedCards } from "../_lib/OwnedCardsContext";
import { useWishlist } from "../_lib/WishlistContext";
import { useCardPrice } from "../_lib/CardPricesContext";
import { useUser } from "../_lib/UserContext";
import { Separator } from "../_components/Separator";
import { Tooltip } from "../_components/Tooltip";

// One wishlist entry as a horizontal row. By the time a card reaches the list
// it is wishlisted and not owned (owned cards are filtered out upstream), so
// the actions are fixed: claim it (Own), drop it (remove from wishlist), or
// open the species page.
function RowBase({ card }: { card: CardEntry }) {
  const { toggle: toggleOwned } = useOwnedCards();
  const { toggle: toggleWishlist } = useWishlist();
  const { priceSource, isGuest, display } = useUser();
  const price = pickPrice(useCardPrice(card.id), priceSource);
  const set = getSet(card.setId);
  const detailsHref = card.dex.length > 0 ? `/pokedex/${card.dex[0]}` : null;

  return (
    <div className="group flex items-center gap-3 rounded-lg border border-border/70 bg-panel/50 px-2.5 py-2 transition hover:border-border-strong hover:bg-panel-2/60">
      <Link
        href={`/cards/${encodeURIComponent(card.id)}`}
        prefetch={false}
        className="relative block w-10 shrink-0 overflow-hidden rounded-[5px] border border-missing/60 bg-panel-2"
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
            <Tooltip content="Mark as owned">
              <button
                type="button"
                onClick={() => toggleOwned(card.id)}
                data-action="owned"
                aria-label={`Mark ${card.name} as owned`}
                className="inline-flex h-7 min-w-7 items-center justify-center rounded-md border border-border bg-panel-2 px-1.5 text-muted transition hover:border-owned hover:text-owned focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              >
                <Plus className="h-3.5 w-3.5" strokeWidth={2.5} aria-hidden />
              </button>
            </Tooltip>
            <Tooltip content="Remove from wishlist">
              <button
                type="button"
                onClick={() => toggleWishlist(card.id)}
                data-action="wishlist"
                aria-pressed
                aria-label={`Remove ${card.name} from wishlist`}
                className="inline-flex h-7 min-w-7 items-center justify-center rounded-md border border-missing bg-missing/20 px-1.5 text-missing transition hover:bg-missing/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              >
                <Heart className="h-3.5 w-3.5" fill="currentColor" strokeWidth={2} aria-hidden />
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

export const WishlistRow = memo(RowBase);
