"use client";

import Link from "next/link";
import { memo } from "react";
import type { CardEntry, Rarity } from "@/lib/data/types";
import { useOwnedCards } from "../_lib/OwnedCardsContext";
import { useWishlist } from "../_lib/WishlistContext";
import { useFavorites } from "../_lib/FavoritesContext";
import { useCardPreview } from "../_lib/CardPreviewContext";

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
}: Props) {
  const { isOwned, toggle: toggleOwned } = useOwnedCards();
  const { isWishlisted, toggle: toggleWishlist } = useWishlist();
  const { isFavorited, toggle: toggleFavorite } = useFavorites();
  const { open: openPreview } = useCardPreview();
  const owned = isOwned(card.id);
  const wishlisted = isWishlisted(card.id);
  const favorited = isFavorited(card.id);

  const handleCardClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    if (selectMode && onSelect) onSelect(card.id);
    else if (!selectMode) openPreview(card, e.currentTarget.getBoundingClientRect());
  };

  const imageBorder = selected
    ? "ring-2 ring-accent ring-offset-0 border-accent"
    : owned
      ? "border-owned/70"
      : wishlisted
        ? "border-dashed border-accent/60"
        : "border-transparent group-hover:border-border-strong/70";

  const detailsHref = card.dex.length > 0 ? `/pokedex/${card.dex[0]}` : null;

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
        <button
          type="button"
          onClick={handleCardClick}
          data-preview-trigger={selectMode ? undefined : card.id}
          className={[
            "relative block w-full overflow-hidden rounded-[6px] border transition",
            imageBorder,
            selectMode ? "cursor-pointer" : "cursor-zoom-in",
          ].join(" ")}
          style={{ aspectRatio: "245 / 342" }}
          aria-label={selectMode ? `Toggle ${card.name}` : `Preview ${card.name}`}
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
            <span className="pointer-events-none absolute top-1 right-1 flex h-7 w-7 items-center justify-center rounded-full bg-accent text-xs font-bold text-bg">
              ✓
            </span>
          )}
        </button>

        {!hideActions && !selectMode && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              toggleOwned(card.id);
            }}
            aria-pressed={owned}
            aria-label={owned ? `Mark ${card.name} as not owned` : `Mark ${card.name} as owned`}
            title={owned ? "Owned — click to remove" : "Mark as owned"}
            className={[
              "absolute top-1 right-1 z-10 flex h-7 w-7 items-center justify-center rounded-full border text-xs font-bold backdrop-blur-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent",
              owned
                ? "border-owned/70 bg-owned text-bg shadow-sm"
                : "border-border-strong/80 bg-bg/70 text-muted opacity-70 hover:border-owned hover:text-owned hover:opacity-100 group-hover:opacity-100 pointer-coarse:opacity-100",
            ].join(" ")}
          >
            {owned ? "✓" : "+"}
          </button>
        )}

        {!hideActions && (
          // pointer-coarse keeps the row visible on touch where hover never fires.
          <div className="absolute inset-x-1 bottom-1 flex items-center justify-end gap-1 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100 pointer-coarse:opacity-100">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                toggleFavorite(card.id);
              }}
              data-action="favorite"
              className={[
                "inline-flex h-8 min-w-8 items-center justify-center rounded-md border px-2 text-xs backdrop-blur-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent",
                favorited
                  ? "border-[#fcd34d]/70 bg-bg/85 text-[#fcd34d]"
                  : "border-border bg-bg/85 text-muted hover:border-[#fcd34d] hover:text-[#fcd34d]",
              ].join(" ")}
              aria-pressed={favorited}
              aria-label="Toggle favorite"
              title={favorited ? "Favorited, click to remove" : "Mark as favorite"}
            >
              ★
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                toggleWishlist(card.id);
              }}
              data-action="wishlist"
              className={[
                "inline-flex h-8 min-w-8 items-center justify-center rounded-md border px-2 text-xs backdrop-blur-sm transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent",
                wishlisted
                  ? "border-accent/60 bg-bg/85 text-accent"
                  : "border-border bg-bg/85 text-muted hover:border-accent hover:text-accent",
              ].join(" ")}
              aria-pressed={wishlisted}
              aria-label="Toggle wishlist"
              title={wishlisted ? "Wishlisted, click to remove" : "Add to wishlist"}
            >
              ♥
            </button>
            {detailsHref && (
              <Link
                href={detailsHref}
                onClick={(e) => e.stopPropagation()}
                className="inline-flex h-8 min-w-8 items-center justify-center rounded-md border border-border bg-bg/85 px-2 text-xs text-muted backdrop-blur-sm transition hover:border-accent hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                aria-label="Pokémon details"
                title="See Pokémon details"
              >
                ↗
              </Link>
            )}
          </div>
        )}
      </div>

      {density === "grid" && (
        <div className="mt-1.5">
          <div className="truncate text-xs font-medium text-text">{card.name}</div>
          <div className="mt-0.5 flex items-baseline gap-1.5 text-[10px]">
            <span className={["font-medium", RARITY_COLOR[card.rarity]].join(" ")} title={card.rarityRaw}>
              {RARITY_ABBR[card.rarity]}
            </span>
            <span aria-hidden className="text-border-strong">·</span>
            <span className="text-muted nums">#{card.number}</span>
          </div>
        </div>
      )}
    </div>
  );
}

export const CardTile = memo(TileBase);
