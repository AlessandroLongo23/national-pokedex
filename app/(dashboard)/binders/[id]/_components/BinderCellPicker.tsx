"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { officialArtworkUrl } from "@/lib/pokeapi";
import { SETS, SPECIES } from "@/lib/data";
import type { CardEntry } from "@/lib/data/types";
import { RARITY_LABEL } from "@/lib/data/types";
import { useOwnedCards } from "../../../_lib/OwnedCardsContext";
import { SeriesBadge } from "../../../_components/SeriesBadge";

interface Props {
  binderId: string;
  dex: number | null;
  /** All cards in the catalog for this dex (owned and not). */
  variants: CardEntry[];
  /** Current override card_id for this dex, if any. */
  currentOverride: string | undefined;
  /** Card id that's currently being shown in the cell (override or default pick). */
  displayedCardId: string | null;
  onSetOverride: (cardId: string) => void;
  onClearOverride: () => void;
  onClose: () => void;
}

export function BinderCellPicker({
  dex,
  variants,
  currentOverride,
  displayedCardId,
  onSetOverride,
  onClearOverride,
  onClose,
}: Props) {
  const { ownedCards } = useOwnedCards();
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
  let ownedCount = 0;
  for (const c of variants) if (ownedCards.has(c.id)) ownedCount++;

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
              #{String(dex).padStart(4, "0")} · {variants.length} variant
              {variants.length === 1 ? "" : "s"} · {ownedCount} owned
            </div>
            <div className="text-lg font-bold">{species?.name ?? `#${dex}`}</div>
            <div className="mt-0.5 text-[11px] text-muted">
              {ownedCount > 0
                ? "Pick which card to display in this binder slot."
                : "Mark one as owned to show it in this slot."}
            </div>
          </div>
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
          {variants.length === 0 ? (
            <div className="py-12 text-center text-sm text-muted">
              No card variants found for this Pokémon.
            </div>
          ) : (
            <>
              {ownedCount > 1 && (
                <div className="mb-2 flex items-center justify-between rounded-md border border-dashed border-border bg-panel-2/40 px-3 py-2 text-[11px] text-muted">
                  <span>
                    Default pick is the highest-rarity card you own. Set an explicit choice below
                    or
                  </span>
                  <button
                    type="button"
                    onClick={onClearOverride}
                    disabled={!currentOverride}
                    className="rounded border border-border bg-panel px-2 py-0.5 text-text transition hover:border-border-strong disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    use default
                  </button>
                </div>
              )}
              <ul className="space-y-1">
                {variants.map((c) => (
                  <VariantRow
                    key={c.id}
                    card={c}
                    isCurrentOverride={c.id === currentOverride}
                    isDisplayed={c.id === displayedCardId}
                    onSetOverride={onSetOverride}
                  />
                ))}
              </ul>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function VariantRow({
  card,
  isCurrentOverride,
  isDisplayed,
  onSetOverride,
}: {
  card: CardEntry;
  isCurrentOverride: boolean;
  isDisplayed: boolean;
  onSetOverride: (cardId: string) => void;
}) {
  const { isOwned, toggle: toggleOwn } = useOwnedCards();
  const owned = isOwned(card.id);
  const set = SETS.find((s) => s.id === card.setId);

  return (
    <li
      className={[
        "flex items-center gap-3 rounded-lg border p-2 transition",
        isDisplayed
          ? "border-accent bg-accent/10"
          : "border-border bg-panel-2 hover:border-border-strong",
      ].join(" ")}
    >
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
          <span className="font-semibold">{RARITY_LABEL[card.rarity]}</span>
        </div>
      </div>
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
        title={owned ? "Owned — click to remove" : "Mark as owned"}
      >
        {owned ? "✓ Owned" : "+ Own"}
      </button>
      <button
        type="button"
        onClick={() => onSetOverride(card.id)}
        disabled={!owned}
        title={
          !owned
            ? "Own this card to show it"
            : isCurrentOverride
              ? "Currently chosen"
              : "Show this card in the binder slot"
        }
        className={[
          "shrink-0 rounded-md border px-3 py-1.5 text-xs font-semibold transition",
          isCurrentOverride
            ? "border-accent bg-accent/15 text-accent"
            : isDisplayed
              ? "border-border-strong text-muted"
              : "border-border text-text hover:border-accent hover:text-accent",
          !owned ? "cursor-not-allowed opacity-40" : "",
        ].join(" ")}
      >
        {isCurrentOverride ? "✓ Chosen" : isDisplayed ? "Showing" : "Show this"}
      </button>
    </li>
  );
}
