"use client";

import { useEffect, useMemo, useState } from "react";
import { POKEDEX } from "@/lib/data";
import { RARITY_LABEL, RARITY_ORDER, type CardEntry, type Rarity } from "@/lib/data/types";
import { CardTile } from "./CardTile";

export type CardSort = "number" | "rarity" | "pokemon";

interface Props {
  cards: CardEntry[];
  storageKey: string;
  initialSort?: CardSort;
  selectMode?: boolean;
  selected?: Set<string>;
  onSelect?: (cardId: string) => void;
  hideActions?: boolean;
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

const NAME_BY_DEX: Record<number, string> = Object.fromEntries(
  POKEDEX.map((p) => [p.dex, p.name]),
);
const GEN_BY_DEX: Record<number, number> = Object.fromEntries(POKEDEX.map((p) => [p.dex, p.gen]));

export function CardGrid({
  cards,
  storageKey,
  initialSort = "number",
  selectMode,
  selected,
  onSelect,
  hideActions,
  emptyMessage = "No cards to show.",
}: Props) {
  const [sort, setSort] = useState<CardSort>(initialSort);
  const [cols, setCols] = useState(5);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setCols(loadInt(`${SIZE_KEY}.${storageKey}`, 5));
    setMounted(true);
  }, [storageKey]);

  useEffect(() => {
    if (mounted) window.localStorage.setItem(`${SIZE_KEY}.${storageKey}`, String(cols));
  }, [cols, storageKey, mounted]);

  const sorted = useMemo(() => {
    const copy = [...cards];
    switch (sort) {
      case "number":
        copy.sort((a, b) => a.setId.localeCompare(b.setId) || a.numberInt - b.numberInt);
        break;
      case "rarity": {
        const rank = (r: Rarity) => RARITY_ORDER.indexOf(r);
        copy.sort(
          (a, b) =>
            rank(a.rarity) - rank(b.rarity) ||
            a.setId.localeCompare(b.setId) ||
            a.numberInt - b.numberInt,
        );
        break;
      }
      case "pokemon": {
        copy.sort(
          (a, b) =>
            (a.dex[0] ?? 9999) - (b.dex[0] ?? 9999) ||
            a.setId.localeCompare(b.setId) ||
            a.numberInt - b.numberInt,
        );
        break;
      }
    }
    return copy;
  }, [cards, sort]);

  const groups = useMemo(() => {
    if (sort === "number") return null;
    const m = new Map<string, CardEntry[]>();
    for (const c of sorted) {
      const key =
        sort === "rarity"
          ? RARITY_LABEL[c.rarity]
          : c.dex[0] != null
            ? `${c.dex[0]}`
            : "other";
      const arr = m.get(key);
      if (arr) arr.push(c);
      else m.set(key, [c]);
    }
    return m;
  }, [sorted, sort]);

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
        />
      ))}
    </div>
  );

  return (
    <div className="space-y-3">
      <div className="sticky top-2 z-10 flex flex-wrap items-center gap-3 rounded-lg border border-border bg-panel/90 backdrop-blur p-3 shadow-[0_4px_16px_-8px_rgb(0_0_0/0.6)]">
        <div className="flex gap-1.5">
          {(["number", "rarity", "pokemon"] as CardSort[]).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setSort(s)}
              className={[
                "rounded-md px-2.5 py-1 text-[11px] uppercase tracking-wider transition",
                sort === s
                  ? "bg-accent/15 text-accent"
                  : "text-muted hover:bg-panel-2 hover:text-text",
              ].join(" ")}
            >
              {s === "number" ? "By #" : s === "rarity" ? "By rarity" : "By Pokémon"}
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
              sort === "pokemon" && key !== "other"
                ? `${NAME_BY_DEX[Number(key)] ?? "#" + key} · Gen ${GEN_BY_DEX[Number(key)] ?? "?"}`
                : key;
            return (
              <details key={key} open className="group/details">
                <summary className="-mx-1 flex cursor-pointer list-none items-baseline justify-between gap-3 rounded-md px-1 py-1.5 hover:bg-panel-2 [&::-webkit-details-marker]:hidden">
                  <span className="flex items-baseline gap-2">
                    <span
                      aria-hidden
                      className="inline-block w-2 text-[10px] text-muted transition-transform group-open/details:rotate-90"
                    >
                      ▸
                    </span>
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
