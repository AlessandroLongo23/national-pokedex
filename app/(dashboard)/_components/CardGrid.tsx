"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronRight } from "lucide-react";
import { getSet } from "@/lib/data";
import { RARITY_LABEL, type CardEntry } from "@/lib/data/types";
import { CardTile } from "./CardTile";
import { genByDex, pokemonNameByDex, sortCards, type CardSort } from "../_lib/card-sort";

export type { CardSort };

interface Props {
  cards: CardEntry[];
  storageKey: string;
  initialSort?: CardSort;
  selectMode?: boolean;
  selected?: Set<string>;
  onSelect?: (cardId: string) => void;
  hideActions?: boolean;
  hideDetailsLink?: boolean;
  emptyMessage?: React.ReactNode;
}

const SIZE_KEY = "cardgrid.size";

function clampSize(n: number) {
  return Math.max(2, Math.min(10, Math.round(n)));
}

function loadInt(key: string, fallback: number): number {
  if (typeof window === "undefined") return fallback;
  const v = window.localStorage.getItem(key);
  if (!v) return fallback;
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? clampSize(n) : fallback;
}

export function CardGrid({
  cards,
  storageKey,
  initialSort = "number",
  selectMode,
  selected,
  onSelect,
  hideActions,
  hideDetailsLink,
  emptyMessage = "No cards to show.",
}: Props) {
  const [sort, setSort] = useState<CardSort>(initialSort);
  const [cols, setCols] = useState(5);
  const [mounted, setMounted] = useState(false);
  // Mobile keeps an independent density (own ".m" storage key + a lower
  // default of 3) so phones get tappable cells instead of inheriting the
  // desktop default of 5. Desktop reads the original key + default 5, so its
  // behaviour is byte-identical.
  const [isMobile, setIsMobile] = useState(false);
  const sizeKey = `${SIZE_KEY}.${storageKey}${isMobile ? ".m" : ""}`;

  useEffect(() => {
    const mobile =
      typeof window !== "undefined" &&
      window.matchMedia("(max-width: 767px)").matches;
    setIsMobile(mobile);
    const key = `${SIZE_KEY}.${storageKey}${mobile ? ".m" : ""}`;
    setCols(loadInt(key, mobile ? 3 : 5));
    setMounted(true);
  }, [storageKey]);

  useEffect(() => {
    if (mounted) window.localStorage.setItem(sizeKey, String(cols));
  }, [cols, sizeKey, mounted]);

  const singleSet = useMemo(() => {
    if (cards.length === 0) return false;
    const first = cards[0]!.setId;
    for (let i = 1; i < cards.length; i++) if (cards[i]!.setId !== first) return false;
    return true;
  }, [cards]);

  const effectiveSort: CardSort = singleSet && sort === "set" ? "number" : sort;
  const sortOptions = useMemo<CardSort[]>(
    () => (singleSet ? ["number", "rarity", "pokemon"] : ["number", "rarity", "pokemon", "set"]),
    [singleSet],
  );

  const sorted = useMemo(() => sortCards(cards, effectiveSort), [cards, effectiveSort]);

  const groups = useMemo(() => {
    if (effectiveSort === "number" || effectiveSort === "pokemon") return null;
    const m = new Map<string, CardEntry[]>();
    for (const c of sorted) {
      let key: string;
      if (effectiveSort === "rarity") {
        key = RARITY_LABEL[c.rarity];
      } else if (effectiveSort === "set") {
        const s = getSet(c.setId);
        key = s ? s.name : "Other";
      } else {
        key = c.dex[0] != null ? `${c.dex[0]}` : "other";
      }
      const arr = m.get(key);
      if (arr) arr.push(c);
      else m.set(key, [c]);
    }
    return m;
  }, [sorted, effectiveSort]);

  const renderGrid = (items: CardEntry[]) => (
    <div
      className="grid gap-2"
      style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
    >
      {items.map((c) => (
        <CardTile
          key={c.id}
          card={c}
          selectMode={selectMode}
          selected={selected?.has(c.id)}
          onSelect={onSelect}
          hideActions={hideActions}
          hideDetailsLink={hideDetailsLink}
        />
      ))}
    </div>
  );

  return (
    <div className="space-y-3">
      <div className="sticky top-2 z-10 flex flex-wrap items-center gap-3 rounded-lg border border-border bg-panel/90 backdrop-blur p-3 shadow-[0_4px_16px_-8px_rgb(0_0_0/0.6)]">
        <div className="flex gap-1.5">
          {sortOptions.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setSort(s)}
              className={[
                "rounded-md px-2.5 py-1 text-[11px] uppercase tracking-wider transition",
                effectiveSort === s
                  ? "bg-accent/10 text-accent"
                  : "text-muted hover:bg-panel-2 hover:text-text",
              ].join(" ")}
            >
              {s === "number"
                ? "By #"
                : s === "rarity"
                  ? "By rarity"
                  : s === "pokemon"
                    ? "By Pokédex #"
                    : "By set"}
            </button>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-2 text-xs text-muted">
          <span className="hidden sm:inline">Size</span>
          <input
            type="range"
            min={2}
            max={10}
            value={cols}
            onChange={(e) => setCols(clampSize(Number(e.target.value)))}
            className="h-1 w-28 cursor-pointer accent-[var(--color-accent)] sm:w-36"
            aria-label="Cards per row"
          />
          <span className="w-6 text-right text-[11px] nums">{cols}</span>
        </div>
      </div>

      {cards.length === 0 && (
        <div className="rounded-lg border border-dashed border-border bg-panel/50 p-8 text-center text-sm text-muted">
          {emptyMessage}
        </div>
      )}

      {groups ? (
        <div className="space-y-4">
          {[...groups.entries()].map(([key, items]) => {
            const title =
              effectiveSort === "pokemon" && key !== "other"
                ? `${pokemonNameByDex(Number(key)) ?? "#" + key} · Gen ${genByDex(Number(key)) ?? "?"}`
                : key;
            return (
              <details key={key} open className="group/details">
                <summary className="-mx-1 flex cursor-pointer list-none items-baseline justify-between gap-3 rounded-md px-1 py-1.5 hover:bg-panel-2 [&::-webkit-details-marker]:hidden">
                  <span className="flex items-baseline gap-2">
                    <ChevronRight
                      aria-hidden
                      className="h-3 w-3 text-muted transition-transform group-open/details:rotate-90"
                    />
                    <span className="text-sm font-semibold">{title}</span>
                  </span>
                  <span className="text-xs text-muted nums">{items.length}</span>
                </summary>
                <div className="mt-2">{renderGrid(items)}</div>
              </details>
            );
          })}
        </div>
      ) : (
        renderGrid(sorted)
      )}
    </div>
  );
}
