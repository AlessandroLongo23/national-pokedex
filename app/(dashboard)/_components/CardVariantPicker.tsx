"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { officialArtworkUrl } from "@/lib/pokeapi";
import { CARD_INDEX, SETS, SPECIES } from "@/lib/data";
import type { CardEntry, Rarity } from "@/lib/data/types";
import { RARITY_LABEL } from "@/lib/data/types";
import { useOwnedCards } from "../_lib/OwnedCardsContext";
import { useWishlist } from "../_lib/WishlistContext";
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
            className="rounded-md border border-border bg-panel-2 px-3 py-1.5 text-xs text-muted transition hover:border-accent hover:text-accent"
          >
            Full details →
          </Link>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1.5 text-muted transition hover:bg-panel-2 hover:text-text"
            aria-label="Close"
          >
            ✕
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
  const { isOwned, toggle: toggleOwn } = useOwnedCards();
  const { isWishlisted, toggle: toggleWishlist } = useWishlist();
  const owned = isOwned(card.id);
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
      <button
        type="button"
        onClick={() => toggleWishlist(card.id)}
        className={[
          "shrink-0 rounded-md border px-2 py-1.5 text-xs transition",
          wishlisted
            ? "border-accent bg-accent/15 text-accent"
            : "border-border text-muted hover:border-accent hover:text-accent",
        ].join(" ")}
        title={wishlisted ? "Wishlisted" : "Add to wishlist"}
        aria-pressed={wishlisted}
      >
        ♥
      </button>
      <button
        type="button"
        onClick={() => toggleOwn(card.id)}
        className={[
          "shrink-0 rounded-md border px-3 py-1.5 text-xs font-semibold transition",
          owned
            ? "border-owned bg-owned/15 text-owned"
            : "border-border text-text hover:border-owned hover:text-owned",
        ].join(" ")}
        aria-pressed={owned}
      >
        {owned ? "✓ Owned" : "+ Own"}
      </button>
    </li>
  );
}
