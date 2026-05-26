"use client";

import { useState } from "react";
import { Check, Heart, Minus, Plus, Star, Tag } from "lucide-react";
import type { LedgerCurrency } from "@/lib/ledger/money";
import { LogSaleModal } from "../../../transactions/_components/LogSaleModal";
import { useOwnedCards } from "../../../_lib/OwnedCardsContext";
import { useWishlist } from "../../../_lib/WishlistContext";
import { useFavorites } from "../../../_lib/FavoritesContext";

interface CardInfo {
  id: string;
  name: string;
  setId: string;
  number: string;
  imageSmall: string;
}

interface Props {
  card: CardInfo;
  suggestedUnitProceedsCents: number | null;
  defaultCurrency: LedgerCurrency;
}

// Houses every per-card action a collector might take from the detail
// page: adjust ownership, manage wishlist or favorite, log a sale. Reads
// state from the dashboard's existing optimistic contexts so toggles feel
// instant. The ownedQty prop is gone — we derive it live from the
// OwnedCardsContext so the Sell button enables the moment a copy is added.
export function CardActionsBar({
  card,
  suggestedUnitProceedsCents,
  defaultCurrency,
}: Props) {
  const [sellOpen, setSellOpen] = useState(false);
  const {
    quantityOf,
    toggle: toggleOwned,
    adjust: adjustOwned,
  } = useOwnedCards();
  const { isWishlisted, toggle: toggleWishlist } = useWishlist();
  const { isFavorited, toggle: toggleFavorite } = useFavorites();

  const ownedQty = quantityOf(card.id);
  const wishlisted = isWishlisted(card.id);
  const favorited = isFavorited(card.id);

  return (
    <div className="flex flex-wrap items-center gap-2">
      {ownedQty > 0 ? (
        <div
          className="inline-flex h-9 items-stretch overflow-hidden rounded-md border border-owned/60 bg-owned/10 text-owned"
          role="group"
          aria-label={`Owned — ${ownedQty} ${ownedQty === 1 ? "copy" : "copies"}`}
        >
          <button
            type="button"
            onClick={() => adjustOwned(card.id, -1)}
            aria-label={
              ownedQty > 1
                ? `Remove a copy of ${card.name}`
                : `Mark ${card.name} not owned`
            }
            title={ownedQty > 1 ? "One fewer copy" : "Remove from collection"}
            className="inline-flex w-9 items-center justify-center transition hover:bg-owned/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-inset"
          >
            <Minus className="h-3.5 w-3.5" strokeWidth={2.5} aria-hidden />
          </button>
          <span className="inline-flex min-w-[3.25rem] items-center justify-center gap-1.5 border-x border-owned/40 bg-owned/10 px-3 text-xs font-semibold leading-none tabular-nums">
            <Check className="h-3.5 w-3.5" strokeWidth={3} aria-hidden />
            <span>×{ownedQty}</span>
          </span>
          <button
            type="button"
            onClick={() => adjustOwned(card.id, +1)}
            aria-label={`Add another copy of ${card.name}`}
            title="One more copy"
            className="inline-flex w-9 items-center justify-center transition hover:bg-owned/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-inset"
          >
            <Plus className="h-3.5 w-3.5" strokeWidth={2.5} aria-hidden />
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => toggleOwned(card.id)}
          className="inline-flex h-9 items-center gap-1.5 rounded-md border border-border bg-panel-2 px-3 text-xs font-medium text-text transition hover:border-owned/70 hover:bg-owned/10 hover:text-owned focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          <Plus className="h-3.5 w-3.5" strokeWidth={2.5} aria-hidden />
          Mark owned
        </button>
      )}

      {/* Wishlist + favorite are mutually exclusive: you wishlist what you
          don't have, you favorite what you do. Mirrors CardTile's logic
          so behavior is consistent everywhere a card surfaces. */}
      {ownedQty === 0 ? (
        <button
          type="button"
          onClick={() => toggleWishlist(card.id)}
          aria-pressed={wishlisted}
          className={[
            "inline-flex h-9 items-center gap-1.5 rounded-md border px-3 text-xs font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent",
            wishlisted
              ? "border-missing bg-missing/15 text-missing hover:bg-missing/20"
              : "border-border bg-panel-2 text-text hover:border-missing/70 hover:text-missing",
          ].join(" ")}
          title={wishlisted ? "Wishlisted — click to remove" : "Add to wishlist"}
        >
          <Heart
            className="h-3.5 w-3.5"
            strokeWidth={2}
            fill={wishlisted ? "currentColor" : "none"}
            aria-hidden
          />
          {wishlisted ? "Wishlisted" : "Wishlist"}
        </button>
      ) : (
        <button
          type="button"
          onClick={() => toggleFavorite(card.id)}
          aria-pressed={favorited}
          className={[
            "inline-flex h-9 items-center gap-1.5 rounded-md border px-3 text-xs font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent",
            favorited
              ? "border-[#fcd34d]/70 bg-[#fcd34d]/15 text-[#fcd34d] hover:bg-[#fcd34d]/20"
              : "border-border bg-panel-2 text-text hover:border-[#fcd34d]/70 hover:text-[#fcd34d]",
          ].join(" ")}
          title={favorited ? "Favorited — click to remove" : "Mark as favorite"}
        >
          <Star
            className="h-3.5 w-3.5"
            strokeWidth={2}
            fill={favorited ? "currentColor" : "none"}
            aria-hidden
          />
          {favorited ? "Favorited" : "Favorite"}
        </button>
      )}

      <button
        type="button"
        onClick={() => setSellOpen(true)}
        disabled={ownedQty === 0}
        className="inline-flex h-9 items-center gap-1.5 rounded-md border border-border bg-panel-2 px-3 text-xs font-medium text-text transition hover:border-accent/60 hover:bg-panel disabled:cursor-not-allowed disabled:opacity-40"
        title={
          ownedQty === 0
            ? "You don't own this card"
            : `Sell up to ${ownedQty} ${ownedQty === 1 ? "copy" : "copies"}`
        }
      >
        <Tag className="h-3.5 w-3.5" aria-hidden />
        Sell{ownedQty > 1 ? ` (up to ${ownedQty})` : ""}
      </button>

      <LogSaleModal
        open={sellOpen}
        onClose={() => setSellOpen(false)}
        defaultCurrency={defaultCurrency}
        presetCard={card}
        presetMaxQty={ownedQty}
        suggestedUnitProceedsCents={suggestedUnitProceedsCents}
      />
    </div>
  );
}
