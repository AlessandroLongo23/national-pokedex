"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowRight, Check, Heart, Minus, Plus, X } from "lucide-react";
import { officialArtworkUrl } from "@/lib/pokeapi";
import { CARD_INDEX, SETS, SPECIES } from "@/lib/data";
import type { CardEntry, Rarity } from "@/lib/data/types";
import { RARITY_LABEL } from "@/lib/data/types";
import { useOwnedCards } from "../_lib/OwnedCardsContext";
import { useWishlist } from "../_lib/WishlistContext";
import { Tooltip } from "./Tooltip";
import { useUser } from "../_lib/UserContext";
import { SeriesBadge } from "./SeriesBadge";

const RARITY_TINT: Record<Rarity, string> = {
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

interface Props {
  dex: number | null;
  onClose: () => void;
}

export function CardVariantPicker({ dex, onClose }: Props) {
  const [cards, setCards] = useState<CardEntry[] | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (dex == null) return;
    setLoading(true);
    setCards(null);
    fetch(`/api/cards-by-dex/${dex}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("fetch failed"))))
      .then((data: CardEntry[]) => setCards(data))
      .catch(() => setCards([]))
      .finally(() => setLoading(false));
  }, [dex]);

  useEffect(() => {
    if (dex == null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [dex, onClose]);

  if (dex == null) return null;
  const species = SPECIES[dex];
  const ids = CARD_INDEX[dex] ?? [];

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-bg/80 backdrop-blur-sm md:items-center"
      onClick={onClose}
    >
      <div
        className="relative max-h-[88vh] w-full max-w-2xl overflow-hidden rounded-t-2xl border border-border bg-panel md:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center gap-3 border-b border-border p-4">
          <Image
            src={officialArtworkUrl(dex)}
            alt=""
            width={64}
            height={64}
            unoptimized
            className="h-14 w-14 shrink-0 object-contain"
          />
          <div className="min-w-0 flex-1">
            <div className="text-[11px] uppercase tracking-wider text-muted nums">
              #{String(dex).padStart(4, "0")} · {ids.length} card{ids.length === 1 ? "" : "s"}
            </div>
            <div className="text-lg font-bold">{species?.name ?? `#${dex}`}</div>
            {species && (
              <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] text-muted">
                <span>{species.genus}</span>
                <span>·</span>
                <span>{species.types.join(" / ")}</span>
              </div>
            )}
          </div>
          <Link
            href={`/pokedex/${dex}`}
            onClick={onClose}
            className="inline-flex items-center gap-1 rounded-md border border-border bg-panel-2 px-3 py-1.5 text-xs text-muted transition hover:border-accent hover:text-accent"
          >
            Full details
            <ArrowRight className="h-3 w-3" aria-hidden />
          </Link>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1.5 text-muted transition hover:bg-panel-2 hover:text-text"
            aria-label="Close"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </header>

        <div className="max-h-[calc(88vh-92px)] overflow-y-auto p-3">
          {loading && (
            <div className="py-12 text-center text-sm text-muted">Loading cards…</div>
          )}
          {cards && cards.length === 0 && (
            <div className="py-12 text-center text-sm text-muted">
              No card variants found for this Pokémon.
            </div>
          )}
          {cards && cards.length > 0 && (
            <ul className="space-y-1">
              {cards.map((c) => (
                <VariantRow key={c.id} card={c} />
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

function VariantRow({ card }: { card: CardEntry }) {
  const { isOwned, toggle: toggleOwn, adjust: adjustOwned, quantityOf } = useOwnedCards();
  const { isWishlisted, toggle: toggleWishlist } = useWishlist();
  const { isGuest } = useUser();
  const owned = isOwned(card.id);
  const quantity = quantityOf(card.id);
  const wishlisted = isWishlisted(card.id);
  const set = SETS.find((s) => s.id === card.setId);

  return (
    <li className="flex items-center gap-3 rounded-lg border border-border bg-panel-2 p-2 transition hover:border-border-strong">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={card.imageSmall}
        alt={card.name}
        loading="lazy"
        className="h-16 w-12 shrink-0 rounded-sm bg-bg object-cover"
      />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-1.5">
          <span className="text-sm font-medium">{card.name}</span>
          <span className="text-[11px] text-muted nums">#{card.number}</span>
        </div>
        <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] text-muted">
          {set && <SeriesBadge series={set.series} />}
          <span>{set?.name ?? card.setId}</span>
          <span className={`font-semibold ${RARITY_TINT[card.rarity]}`}>
            {RARITY_LABEL[card.rarity]}
          </span>
        </div>
      </div>
      {!isGuest && (
        <Tooltip content={wishlisted ? "Wishlisted" : "Add to wishlist"}>
          <button
            type="button"
            onClick={() => toggleWishlist(card.id)}
            className={[
              "inline-flex shrink-0 items-center justify-center rounded-md border px-2 py-1.5 transition",
              wishlisted
                ? "border-accent bg-accent/15 text-accent"
                : "border-border text-muted hover:border-accent hover:text-accent",
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
      )}
      {!isGuest && (owned ? (
        <div
          className="inline-flex shrink-0 items-stretch overflow-hidden rounded-md border border-owned bg-owned/15 text-owned"
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
              className="inline-flex items-center justify-center px-2 transition hover:bg-owned/25"
            >
              <Minus className="h-3 w-3" strokeWidth={2.5} aria-hidden />
            </button>
          </Tooltip>
          <span className="inline-flex items-center gap-1 border-x border-owned/40 bg-owned/10 px-2 text-xs font-semibold tabular-nums">
            <Check className="h-3.5 w-3.5" strokeWidth={3} aria-hidden />
            <span>×{quantity}</span>
          </span>
          <Tooltip content="One more copy">
            <button
              type="button"
              onClick={() => adjustOwned(card.id, +1)}
              aria-label={`Add another copy of ${card.name}`}
              className="inline-flex items-center justify-center px-2 transition hover:bg-owned/25"
            >
              <Plus className="h-3 w-3" strokeWidth={2.5} aria-hidden />
            </button>
          </Tooltip>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => toggleOwn(card.id)}
          className="inline-flex shrink-0 items-center gap-1 rounded-md border border-border px-3 py-1.5 text-xs font-semibold text-text transition hover:border-owned hover:text-owned"
          aria-pressed={false}
        >
          <Plus className="h-3.5 w-3.5" strokeWidth={2.5} aria-hidden />
          Own
        </button>
      ))}
    </li>
  );
}
