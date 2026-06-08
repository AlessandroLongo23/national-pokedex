"use client";

import Link from "next/link";
import { memo } from "react";
import { ArrowUpRight, Check, Heart, Minus, Plus, Star } from "lucide-react";
import { formatSetCode, getSet } from "@/lib/data";
import type { CardEntry } from "@/lib/data/types";
import { RARITY_ABBR, RARITY_COLOR } from "../_lib/rarity";
import { useOwnedCards } from "../_lib/OwnedCardsContext";
import { useWishlist } from "../_lib/WishlistContext";
import { useFavorites } from "../_lib/FavoritesContext";
import { useCardPrice } from "../_lib/CardPricesContext";
import { useUser } from "../_lib/UserContext";
import { formatPriceCompact, pickPrice } from "@/lib/pricing/pokemontcg";
import { OwnedBadge } from "./OwnedBadge";
import { Separator } from "./Separator";
import { Tooltip } from "./Tooltip";

interface Props {
  card: CardEntry;
  // "grid" shows the name + rarity caption; "compact" omits it for history rows.
  density?: "grid" | "compact";
  // Pack-log multi-select: clicking the image toggles selection and hides the
  // OWNED corner button. The wishlist/details row stays available.
  selectMode?: boolean;
  selected?: boolean;
  onSelect?: (cardId: string) => void;
  // When provided alongside selectMode, the tile shows a quantity badge with
  // +/- steppers instead of a plain check. `selected` still gates the ring.
  // First click sets qty 1; the steppers adjust 0..99. Used by the bulk-lot
  // flow.
  selectedQuantity?: number;
  onQuantityChange?: (cardId: string, quantity: number) => void;
  hideActions?: boolean;
  // On the species page the details link is redundant — we're already there.
  hideDetailsLink?: boolean;
}

function TileBase({
  card,
  density = "grid",
  selectMode,
  selected,
  onSelect,
  selectedQuantity,
  onQuantityChange,
  hideActions,
  hideDetailsLink,
}: Props) {
  const { isOwned, toggle: toggleOwned, adjust: adjustOwned, quantityOf } = useOwnedCards();
  const { isWishlisted, toggle: toggleWishlist } = useWishlist();
  const { isFavorited, toggle: toggleFavorite } = useFavorites();
  const { priceSource, isGuest, display } = useUser();
  const priceData = useCardPrice(card.id);
  // pickPrice returns undefined when this card has no row in the current
  // page's price map OR when prices haven't been provided at all (no
  // <CardPricesProvider> above). Either way we skip the line.
  const price = pickPrice(priceData, priceSource);
  const owned = isOwned(card.id);
  const quantity = quantityOf(card.id);
  const wishlisted = isWishlisted(card.id);
  const favorited = isFavorited(card.id);
  const set = getSet(card.setId);

  const imageBorder = selected
    ? "ring-2 ring-accent ring-offset-0 border-accent"
    : owned
      ? "border-owned ring-1 ring-owned/40"
      : wishlisted
        ? "border-missing ring-2 ring-missing/55"
        : "border-transparent group-hover:border-border-strong/70";

  const detailsHref = card.dex.length > 0 ? `/pokedex/${card.dex[0]}` : null;
  const imageClassName = [
    "relative block w-full cursor-pointer overflow-hidden rounded-[6px] border bg-panel-2 transition",
    imageBorder,
  ].join(" ");

  return (
    <div
      className="group relative"
      data-card-id={card.id}
      data-owned={owned ? "true" : "false"}
      data-favorited={favorited ? "true" : "false"}
    >
      <div className="relative">
        {selectMode ? (
          <>
            <button
              type="button"
              onClick={() =>
                onQuantityChange
                  ? onQuantityChange(card.id, selected ? 0 : 1)
                  : onSelect?.(card.id)
              }
              className={imageClassName}
              style={{ aspectRatio: "245 / 342" }}
              aria-label={`Toggle ${card.name}`}
              tabIndex={0}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={card.imageSmall}
                alt={card.name}
                loading="lazy"
                className="h-full w-full object-cover"
              />
              {selected && !onQuantityChange && (
                <span className="pointer-events-none absolute top-1 right-1 flex h-7 w-7 items-center justify-center rounded-full bg-accent text-primary-foreground">
                  <Check className="h-3.5 w-3.5" strokeWidth={3} aria-hidden />
                </span>
              )}
            </button>
            {selected && onQuantityChange && (
              <div className="absolute top-1 right-1 inline-flex h-7 items-stretch overflow-hidden rounded-md border border-accent bg-accent text-primary-foreground shadow">
                <button
                  type="button"
                  onClick={() =>
                    onQuantityChange(card.id, Math.max(0, (selectedQuantity ?? 1) - 1))
                  }
                  className="inline-flex w-6 items-center justify-center transition hover:bg-accent/80 focus-visible:outline-none"
                  aria-label={`Decrease ${card.name} quantity`}
                >
                  <Minus className="h-3 w-3" strokeWidth={3} aria-hidden />
                </button>
                <span
                  className="inline-flex min-w-7 items-center justify-center border-x border-bg/30 px-1.5 text-[11px] font-semibold tabular-nums"
                  aria-hidden
                >
                  ×{selectedQuantity ?? 1}
                </span>
                <button
                  type="button"
                  onClick={() =>
                    onQuantityChange(card.id, Math.min(99, (selectedQuantity ?? 1) + 1))
                  }
                  className="inline-flex w-6 items-center justify-center transition hover:bg-accent/80 focus-visible:outline-none"
                  aria-label={`Increase ${card.name} quantity`}
                >
                  <Plus className="h-3 w-3" strokeWidth={3} aria-hidden />
                </button>
              </div>
            )}
          </>
        ) : (
          <Link
            href={`/cards/${encodeURIComponent(card.id)}`}
            prefetch={false}
            className={imageClassName}
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
        )}

        {/* Owned marker — the primary ownership signal now that art stays at full
            brightness. Hidden in select mode, which drives its own corner UI. */}
        {owned && !selectMode && (
          <OwnedBadge
            quantity={quantity}
            className="absolute top-1.5 right-1.5"
          />
        )}
      </div>

      {(density === "grid" || (!hideActions && !selectMode)) && (
        <div className="mt-1.5 flex items-start justify-between gap-2">
          {density === "grid" && (
            <div className="min-w-0 flex-1">
              <div className="truncate text-xs font-medium text-text" title={set?.name}>
                {card.name}
              </div>
              <div className="mt-0.5 flex items-baseline gap-1.5 text-[10px] nums">
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
                    <Tooltip
                      content={`Market price, ${priceSource === "tcgplayer" ? "TCGplayer" : "Cardmarket"}`}
                    >
                      <span className="font-medium tabular-nums text-text">
                        {formatPriceCompact(price, priceSource, display)}
                      </span>
                    </Tooltip>
                  </>
                )}
              </div>
            </div>
          )}
          {!hideActions && !selectMode && (
            // pointer-coarse keeps the row visible on touch where hover never fires.
            <div className="ml-auto flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100 pointer-coarse:opacity-100">
              {!isGuest && (owned ? (
                <div
                  className="inline-flex h-7 items-stretch overflow-hidden rounded-md border border-owned/70 bg-owned/15 text-owned"
                  data-action="quantity"
                  data-quantity={quantity}
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
                          : `Mark ${card.name} as not owned`
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
              ) : (
                <Tooltip content="Mark as owned">
                  <button
                    type="button"
                    onClick={() => toggleOwned(card.id)}
                    data-action="owned"
                    aria-pressed={false}
                    aria-label={`Mark ${card.name} as owned`}
                    className="inline-flex h-7 min-w-7 items-center justify-center rounded-md border border-border bg-panel-2 px-1.5 text-muted transition hover:border-owned hover:text-owned focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                  >
                    <Plus className="h-3.5 w-3.5" strokeWidth={2.5} aria-hidden />
                  </button>
                </Tooltip>
              ))}
              {!isGuest && (owned ? (
                <Tooltip content={favorited ? "Favorited, click to remove" : "Mark as favorite"}>
                  <button
                    type="button"
                    onClick={() => toggleFavorite(card.id)}
                    data-action="favorite"
                    className={[
                      "inline-flex h-7 min-w-7 items-center justify-center rounded-md border px-1.5 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent",
                      favorited
                        ? "border-[#fcd34d]/70 bg-[#fcd34d]/15 text-[#fcd34d]"
                        : "border-border bg-panel-2 text-muted hover:border-[#fcd34d] hover:text-[#fcd34d]",
                    ].join(" ")}
                    aria-pressed={favorited}
                    aria-label="Toggle favorite"
                  >
                    <Star
                      className="h-3.5 w-3.5"
                      fill={favorited ? "currentColor" : "none"}
                      strokeWidth={2}
                      aria-hidden
                    />
                  </button>
                </Tooltip>
              ) : (
                <Tooltip content={wishlisted ? "Wishlisted, click to remove" : "Add to wishlist"}>
                  <button
                    type="button"
                    onClick={() => toggleWishlist(card.id)}
                    data-action="wishlist"
                    className={[
                      "inline-flex h-7 min-w-7 items-center justify-center rounded-md border px-1.5 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent",
                      wishlisted
                        ? "border-missing bg-missing/20 text-missing"
                        : "border-border bg-panel-2 text-muted hover:border-missing hover:text-missing",
                    ].join(" ")}
                    aria-pressed={wishlisted}
                    aria-label="Toggle wishlist"
                  >
                    <Heart
                      className="h-3.5 w-3.5"
                      fill={wishlisted ? "currentColor" : "none"}
                      strokeWidth={2}
                      aria-hidden
                    />
                  </button>
                </Tooltip>
              ))}
              {detailsHref && !hideDetailsLink && (
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
          )}
        </div>
      )}
    </div>
  );
}

export const CardTile = memo(TileBase);
