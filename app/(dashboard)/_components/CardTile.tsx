"use client";

import Link from "next/link";
import { memo } from "react";
import { ArrowUpRight, Check, Heart, Minus, Plus, Star } from "lucide-react";
import { getSet } from "@/lib/data";
import type { CardEntry, Rarity } from "@/lib/data/types";
import { useOwnedCards } from "../_lib/OwnedCardsContext";
import { useWishlist } from "../_lib/WishlistContext";
import { useFavorites } from "../_lib/FavoritesContext";
import { useCardPrice } from "../_lib/CardPricesContext";
import { useUser } from "../_lib/UserContext";
import { formatPriceCompact, pickPrice } from "@/lib/pricing/pokemontcg";
import { Separator } from "./Separator";

interface Props {
  card: CardEntry;
  // "grid" shows the name + rarity caption; "compact" omits it for history rows.
  density?: "grid" | "compact";
  // Pack-log multi-select: clicking the image toggles selection and hides the
  // OWNED corner button. The wishlist/details row stays available.
  selectMode?: boolean;
  selected?: boolean;
  onSelect?: (cardId: string) => void;
  hideActions?: boolean;
  // On the species page the details link is redundant — we're already there.
  hideDetailsLink?: boolean;
}

const RARITY_COLOR: Record<Rarity, string> = {
  Common: "text-muted",
  Uncommon: "text-[#86efac]",
  Rare: "text-[#93c5fd]",
  DoubleRare: "text-[#60a5fa]",
  UltraRare: "text-[#c4b5fd]",
  IllustrationRare: "text-[#f0abfc]",
  SpecialIllustrationRare: "text-[#fda4af]",
  HyperRare: "text-[#fcd34d]",
  Promo: "text-muted",
  Unknown: "text-muted",
};

const RARITY_ABBR: Record<Rarity, string> = {
  Common: "C",
  Uncommon: "U",
  Rare: "R",
  DoubleRare: "DR",
  UltraRare: "UR",
  IllustrationRare: "IR",
  SpecialIllustrationRare: "SIR",
  HyperRare: "HR",
  Promo: "PR",
  Unknown: "—",
};

function TileBase({
  card,
  density = "grid",
  selectMode,
  selected,
  onSelect,
  hideActions,
  hideDetailsLink,
}: Props) {
  const { isOwned, toggle: toggleOwned, adjust: adjustOwned, quantityOf } = useOwnedCards();
  const { isWishlisted, toggle: toggleWishlist } = useWishlist();
  const { isFavorited, toggle: toggleFavorite } = useFavorites();
  const { priceSource, isGuest } = useUser();
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
      ? "border-owned/70"
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
      className={[
        "group relative transition-opacity",
        owned || selected || selectMode ? "opacity-100" : "opacity-55 hover:opacity-95",
      ].join(" ")}
      data-card-id={card.id}
      data-owned={owned ? "true" : "false"}
      data-favorited={favorited ? "true" : "false"}
    >
      <div className="relative">
        {selectMode ? (
          <button
            type="button"
            onClick={() => onSelect?.(card.id)}
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
            {selected && (
              <span className="pointer-events-none absolute top-1 right-1 flex h-7 w-7 items-center justify-center rounded-full bg-accent text-bg">
                <Check className="h-3.5 w-3.5" strokeWidth={3} aria-hidden />
              </span>
            )}
          </button>
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
                      {set.id}
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
                    <span
                      className="font-medium tabular-nums text-text"
                      title={`Market price — ${priceSource === "tcgplayer" ? "TCGplayer" : "Cardmarket"}`}
                    >
                      {formatPriceCompact(price, priceSource)}
                    </span>
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
                  <button
                    type="button"
                    onClick={() => adjustOwned(card.id, -1)}
                    aria-label={
                      quantity > 1
                        ? `Decrease ${card.name} quantity`
                        : `Mark ${card.name} as not owned`
                    }
                    title={quantity > 1 ? "One fewer copy" : "Remove from collection"}
                    className="inline-flex w-6 items-center justify-center transition hover:bg-owned/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-inset"
                  >
                    <Minus className="h-3 w-3" strokeWidth={2.5} aria-hidden />
                  </button>
                  <span
                    className="inline-flex min-w-7 items-center justify-center gap-0.5 border-x border-owned/40 bg-owned/10 px-1.5 text-[11px] font-semibold leading-none tabular-nums"
                    aria-hidden
                  >
                    <Check className="h-3 w-3" strokeWidth={3} />
                    <span className="ml-0.5">×{quantity}</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => adjustOwned(card.id, +1)}
                    aria-label={`Add another copy of ${card.name}`}
                    title="One more copy"
                    className="inline-flex w-6 items-center justify-center transition hover:bg-owned/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-inset"
                  >
                    <Plus className="h-3 w-3" strokeWidth={2.5} aria-hidden />
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => toggleOwned(card.id)}
                  data-action="owned"
                  aria-pressed={false}
                  aria-label={`Mark ${card.name} as owned`}
                  title="Mark as owned"
                  className="inline-flex h-7 min-w-7 items-center justify-center rounded-md border border-border bg-panel-2 px-1.5 text-muted transition hover:border-owned hover:text-owned focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                >
                  <Plus className="h-3.5 w-3.5" strokeWidth={2.5} aria-hidden />
                </button>
              ))}
              {!isGuest && (owned ? (
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
                  title={favorited ? "Favorited, click to remove" : "Mark as favorite"}
                >
                  <Star
                    className="h-3.5 w-3.5"
                    fill={favorited ? "currentColor" : "none"}
                    strokeWidth={2}
                    aria-hidden
                  />
                </button>
              ) : (
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
                  title={wishlisted ? "Wishlisted, click to remove" : "Add to wishlist"}
                >
                  <Heart
                    className="h-3.5 w-3.5"
                    fill={wishlisted ? "currentColor" : "none"}
                    strokeWidth={2}
                    aria-hidden
                  />
                </button>
              ))}
              {detailsHref && !hideDetailsLink && (
                <Link
                  href={detailsHref}
                  className="inline-flex h-7 min-w-7 items-center justify-center rounded-md border border-border bg-panel-2 px-1.5 text-muted transition hover:border-accent hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                  aria-label="Pokémon details"
                  title="See Pokémon details"
                >
                  <ArrowUpRight className="h-3.5 w-3.5" aria-hidden />
                </Link>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export const CardTile = memo(TileBase);
