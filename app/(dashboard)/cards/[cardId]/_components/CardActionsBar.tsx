"use client";

import { useEffect, useRef, useState } from "react";
import {
  Check,
  Heart,
  Minus,
  Plus,
  ShoppingCart,
  Star,
  Tag,
} from "lucide-react";
import type { LedgerCurrency } from "@/lib/ledger/money";
import { LogSaleModal } from "../../../transactions/_components/LogSaleModal";
import { LogSingleModal } from "../../../transactions/_components/LogSingleModal";
import { useOwnedCards } from "../../../_lib/OwnedCardsContext";
import { useWishlist } from "../../../_lib/WishlistContext";
import { useFavorites } from "../../../_lib/FavoritesContext";
import { Tooltip } from "../../../_components/Tooltip";
import { UndoToast } from "../../../_components/UndoToast";

const UNDO_WINDOW_MS = 5000;

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
  const [buyOpen, setBuyOpen] = useState(false);
  const {
    quantityOf,
    toggle: toggleOwned,
    adjust: adjustOwned,
    setQuantity: setOwnedQuantity,
  } = useOwnedCards();
  const { isWishlisted, toggle: toggleWishlist } = useWishlist();
  const { isFavorited, toggle: toggleFavorite } = useFavorites();

  const ownedQty = quantityOf(card.id);
  const wishlisted = isWishlisted(card.id);
  const favorited = isFavorited(card.id);

  // When the last copy is removed, surface an undo affordance. The pending
  // state holds the qty to restore + the toast's countdown deadline. The
  // optimistic OwnedCardsContext makes the re-add instant.
  const [pendingUndo, setPendingUndo] = useState<{
    prevQty: number;
    expiresAt: number;
  } | null>(null);
  const timerRef = useRef<number | null>(null);

  const clearTimer = () => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  // The undo window silently expires on unmount rather than firing.
  useEffect(() => () => clearTimer(), []);

  const handleDecrement = () => {
    const prev = ownedQty;
    adjustOwned(card.id, -1);
    if (prev === 1) {
      clearTimer();
      setPendingUndo({ prevQty: prev, expiresAt: performance.now() + UNDO_WINDOW_MS });
      timerRef.current = window.setTimeout(() => {
        timerRef.current = null;
        setPendingUndo(null);
      }, UNDO_WINDOW_MS);
    }
  };

  const handleUndo = () => {
    clearTimer();
    setPendingUndo((p) => {
      if (p) setOwnedQuantity(card.id, p.prevQty);
      return null;
    });
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      {ownedQty > 0 ? (
        <div
          className="inline-flex h-11 md:h-9 items-stretch overflow-hidden rounded-md border border-owned/60 bg-owned/10 text-owned-dark dark:text-owned"
          role="group"
          aria-label={`Owned — ${ownedQty} ${ownedQty === 1 ? "copy" : "copies"}`}
        >
          <Tooltip content={ownedQty > 1 ? "One fewer copy" : "Remove from collection"}>
            <button
              type="button"
              onClick={handleDecrement}
              aria-label={
                ownedQty > 1
                  ? `Remove a copy of ${card.name}`
                  : `Mark ${card.name} not owned`
              }
              className="inline-flex w-11 md:w-9 items-center justify-center transition hover:bg-owned/20 active:bg-panel-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-inset"
            >
              <Minus className="h-3.5 w-3.5" strokeWidth={2.5} aria-hidden />
            </button>
          </Tooltip>
          <span className="inline-flex min-w-[3.25rem] items-center justify-center gap-1.5 border-x border-owned/40 bg-owned/10 px-3 text-xs font-semibold leading-none tabular-nums">
            <Check className="h-3.5 w-3.5" strokeWidth={3} aria-hidden />
            <span>×{ownedQty}</span>
          </span>
          <Tooltip content="One more copy">
            <button
              type="button"
              onClick={() => adjustOwned(card.id, +1)}
              aria-label={`Add another copy of ${card.name}`}
              className="inline-flex w-11 md:w-9 items-center justify-center transition hover:bg-owned/20 active:bg-panel-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-inset"
            >
              <Plus className="h-3.5 w-3.5" strokeWidth={2.5} aria-hidden />
            </button>
          </Tooltip>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => toggleOwned(card.id)}
          className="inline-flex h-10 md:h-9 items-center gap-1.5 rounded-md bg-primary px-3 text-xs font-semibold text-primary-foreground transition hover:bg-[var(--lume-button-accent-bg-hover)] active:bg-[var(--lume-button-accent-bg-active)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg"
        >
          <Plus className="h-3.5 w-3.5" strokeWidth={2.5} aria-hidden />
          Mark owned
        </button>
      )}

      {/* Wishlist + favorite are mutually exclusive: you wishlist what you
          don't have, you favorite what you do. Mirrors CardTile's logic
          so behavior is consistent everywhere a card surfaces. */}
      {ownedQty === 0 ? (
        <Tooltip content={wishlisted ? "Wishlisted, click to remove" : "Add to wishlist"}>
          <button
            type="button"
            onClick={() => toggleWishlist(card.id)}
            aria-pressed={wishlisted}
            className={[
              "inline-flex h-10 md:h-9 items-center gap-1.5 rounded-md border px-3 text-xs font-medium transition active:bg-panel-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent",
              wishlisted
                ? "border-missing bg-missing/15 text-missing hover:bg-missing/20"
                : "border-border bg-panel-2 text-text hover:border-missing/70 hover:text-missing",
            ].join(" ")}
          >
            <Heart
              className="h-3.5 w-3.5"
              strokeWidth={2}
              fill={wishlisted ? "currentColor" : "none"}
              aria-hidden
            />
            {wishlisted ? "Wishlisted" : "Wishlist"}
          </button>
        </Tooltip>
      ) : (
        <Tooltip content={favorited ? "Favorited, click to remove" : "Mark as favorite"}>
          <button
            type="button"
            onClick={() => toggleFavorite(card.id)}
            aria-pressed={favorited}
            className={[
              "inline-flex h-10 md:h-9 items-center gap-1.5 rounded-md border px-3 text-xs font-medium transition active:bg-panel-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent",
              favorited
                ? "border-favorite/70 bg-favorite/15 text-favorite hover:bg-favorite/20"
                : "border-border bg-panel-2 text-text hover:border-favorite/70 hover:text-favorite",
            ].join(" ")}
          >
            <Star
              className="h-3.5 w-3.5"
              strokeWidth={2}
              fill={favorited ? "currentColor" : "none"}
              aria-hidden
            />
            {favorited ? "Favorited" : "Favorite"}
          </button>
        </Tooltip>
      )}

      {/* Ledger actions (buy/sell) read as a secondary cluster, set off
          from the collecting actions above by a thin divider. */}
      <div className="mx-1 h-6 w-px bg-border" aria-hidden />

      <div className="inline-flex items-center gap-2">
        <Tooltip content="Record a purchase of this card">
          <button
            type="button"
            onClick={() => setBuyOpen(true)}
            className="inline-flex h-10 md:h-9 items-center gap-1.5 rounded-md border border-border bg-panel-2 px-3 text-xs font-medium text-text transition hover:border-accent/60 hover:bg-panel active:bg-panel-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            <ShoppingCart className="h-3.5 w-3.5" aria-hidden />
            Buy
          </button>
        </Tooltip>

        <Tooltip
          content={
            ownedQty === 0
              ? "You don't own this card"
              : `Sell up to ${ownedQty} ${ownedQty === 1 ? "copy" : "copies"}`
          }
        >
          <button
            type="button"
            onClick={() => setSellOpen(true)}
            disabled={ownedQty === 0}
            className="inline-flex h-10 md:h-9 items-center gap-1.5 rounded-md border border-border bg-panel-2 px-3 text-xs font-medium text-text transition hover:border-accent/60 hover:bg-panel active:bg-panel-3 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Tag className="h-3.5 w-3.5" aria-hidden />
            Sell{ownedQty > 1 ? ` (up to ${ownedQty})` : ""}
          </button>
        </Tooltip>
      </div>

      <LogSingleModal
        open={buyOpen}
        onClose={() => setBuyOpen(false)}
        defaultCurrency={defaultCurrency}
        presetCard={card}
      />

      <LogSaleModal
        open={sellOpen}
        onClose={() => setSellOpen(false)}
        defaultCurrency={defaultCurrency}
        presetCard={card}
        presetMaxQty={ownedQty}
        suggestedUnitProceedsCents={suggestedUnitProceedsCents}
      />

      {pendingUndo && (
        <UndoToast
          count={1}
          label="Removed from collection"
          expiresAt={pendingUndo.expiresAt}
          onUndo={handleUndo}
        />
      )}
    </div>
  );
}
