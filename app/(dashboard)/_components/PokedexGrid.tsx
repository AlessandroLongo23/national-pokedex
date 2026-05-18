"use client";

import { useEffect, useMemo, useState } from "react";
import { COVERAGE, POKEDEX } from "@/lib/data";
import { GEN_NAMES, GEN_RANGES, type CardEntry, type Generation } from "@/lib/data/types";
import { useOwnedCards } from "../_lib/OwnedCardsContext";
import { FilterBar, type GridFilter } from "./FilterBar";
import { PokemonCell } from "./PokemonCell";

interface Props {
  dexNumbers?: number[];
  groupByGenDefault?: boolean;
  showGenToggle?: boolean;
  showFilter?: boolean;
  showSearch?: boolean;
  storageKey?: string;
  /** Override click handler — used by pack-logging flow */
  onCellClick?: (dex: number) => void;
  /** Set of dex numbers visually selected (only used with onCellClick) */
  selectedDex?: Set<number>;
  /** Per-dex card art to show in the cell (letterboxed). Used by
   * pokedex-scope binders. Cells without an entry fall back to the official
   * artwork + amber-dot treatment. */
  displayCardByDex?: Map<number, CardEntry>;
}

const COLS_KEY_PREFIX = "pokedex.cols";
const GROUP_KEY_PREFIX = "pokedex.groupByGen";

function clampCols(n: number) {
  return Math.max(6, Math.min(40, Math.round(n)));
}

function loadInt(key: string, fallback: number): number {
  if (typeof window === "undefined") return fallback;
  const v = window.localStorage.getItem(key);
  if (!v) return fallback;
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? clampCols(n) : fallback;
}

function loadBool(key: string, fallback: boolean): boolean {
  if (typeof window === "undefined") return fallback;
  const v = window.localStorage.getItem(key);
  if (v === null) return fallback;
  return v === "1";
}

export function PokedexGrid({
  dexNumbers,
  groupByGenDefault = true,
  showGenToggle = true,
  showFilter = true,
  showSearch = true,
  storageKey = "main",
  onCellClick,
  selectedDex,
  displayCardByDex,
}: Props) {
  const { ownedSpecies } = useOwnedCards();
  const [filter, setFilter] = useState<GridFilter>("all");
  const [query, setQuery] = useState("");
  const [cols, setCols] = useState(20);
  const [groupByGen, setGroupByGen] = useState(groupByGenDefault);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setCols(loadInt(`${COLS_KEY_PREFIX}.${storageKey}`, 20));
    if (showGenToggle) {
      setGroupByGen(loadBool(`${GROUP_KEY_PREFIX}.${storageKey}`, groupByGenDefault));
    }
    setMounted(true);
  }, [storageKey, groupByGenDefault, showGenToggle]);

  useEffect(() => {
    if (mounted) window.localStorage.setItem(`${COLS_KEY_PREFIX}.${storageKey}`, String(cols));
  }, [cols, storageKey, mounted]);

  useEffect(() => {
    if (mounted) {
      window.localStorage.setItem(
        `${GROUP_KEY_PREFIX}.${storageKey}`,
        groupByGen ? "1" : "0",
      );
    }
  }, [groupByGen, storageKey, mounted]);

  const missingSet = useMemo(() => new Set(COVERAGE.missingDex), []);
  const restrict = useMemo(() => (dexNumbers ? new Set(dexNumbers) : null), [dexNumbers]);

  const entries = useMemo(() => {
    const base = restrict ? POKEDEX.filter((p) => restrict.has(p.dex)) : POKEDEX;
    const needle = query.trim().toLowerCase();
    return base.filter((p) => {
      if (needle) {
        if (!p.name.toLowerCase().includes(needle) && String(p.dex) !== needle) return false;
      }
      const isMissing = missingSet.has(p.dex);
      const isOwnedNow = ownedSpecies.has(p.dex);
      switch (filter) {
        case "all":
          return true;
        case "covered":
          return !isMissing;
        case "missing":
          return isMissing;
        case "owned":
          return isOwnedNow;
        case "needed":
          return !isOwnedNow;
      }
    });
  }, [restrict, query, filter, missingSet, ownedSpecies]);

  const byGen = useMemo(() => {
    const map = new Map<Generation, typeof entries>();
    for (const p of entries) {
      const arr = map.get(p.gen);
      if (arr) arr.push(p);
      else map.set(p.gen, [p]);
    }
    return map;
  }, [entries]);

  const totalOwnedInView = useMemo(
    () => entries.filter((p) => ownedSpecies.has(p.dex)).length,
    [entries, ownedSpecies],
  );

  const gap = cols <= 10 ? 8 : cols <= 18 ? 6 : 4;
  const renderGrid = (items: typeof entries) => (
    <div
      className="grid"
      style={{
        gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
        gap: `${gap}px`,
      }}
    >
      {items.map((p) => (
        <PokemonCell
          key={p.dex}
          dex={p.dex}
          isCovered={!missingSet.has(p.dex)}
          onClick={onCellClick}
          selected={selectedDex?.has(p.dex)}
          displayCard={displayCardByDex?.get(p.dex)}
        />
      ))}
    </div>
  );

  const minCols = 6;
  const maxCols = 40;

  return (
    <div className="space-y-5">
      {/* Toolbar — single unified row, lives directly on the page bg (no nesting) */}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-3 border-b border-border pb-3">
        {showFilter && (
          <FilterBar
            value={filter}
            onChange={setFilter}
            counts={{
              all: entries.length,
              owned: totalOwnedInView,
            }}
          />
        )}
        {showSearch && (
          <div className="relative">
            <span className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-[11px] text-muted">⌕</span>
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Name or #"
              className="w-44 rounded-md border border-border bg-panel-2/60 py-1.5 pr-2.5 pl-7 text-xs text-text placeholder:text-muted focus:border-accent focus:bg-panel-2 focus:outline-none"
            />
          </div>
        )}

        <div className="ml-auto flex items-center gap-4">
          {showGenToggle && (
            <button
              type="button"
              onClick={() => setGroupByGen((v) => !v)}
              aria-pressed={groupByGen}
              title={groupByGen ? "Showing generations" : "Showing as flat grid"}
              className={[
                "inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-[11px] uppercase tracking-wider transition",
                groupByGen
                  ? "border-accent/40 bg-accent/10 text-accent"
                  : "border-border bg-panel-2/60 text-muted hover:text-text",
              ].join(" ")}
            >
              <span aria-hidden className="text-sm leading-none">▦</span>
              By gen
            </button>
          )}
          <label className="flex items-center gap-2 text-[11px] uppercase tracking-wider text-muted">
            <span className="hidden sm:inline">Density</span>
            <input
              type="range"
              min={minCols}
              max={maxCols}
              value={cols}
              onChange={(e) => setCols(clampCols(Number(e.target.value)))}
              className="range-density w-28 sm:w-36"
              aria-label="Cells per row"
            />
            <span className="w-6 text-right text-[11px] nums">{cols}</span>
          </label>
        </div>
      </div>

      {/* Grid — no outer card wrapper. Each gen is its own section with a
          progress bar; flat mode renders a single block. */}
      {groupByGen && showGenToggle ? (
        <div className="space-y-7">
          {([1, 2, 3, 4, 5, 6, 7, 8, 9] as Generation[]).map((g) => {
            const items = byGen.get(g);
            if (!items || items.length === 0) return null;
            const [lo, hi] = GEN_RANGES[g];
            const inRange = restrict
              ? POKEDEX.filter((p) => restrict.has(p.dex) && p.gen === g).length
              : hi - lo + 1;
            const ownedInGen = items.filter((p) => ownedSpecies.has(p.dex)).length;
            const pct = inRange > 0 ? (ownedInGen / inRange) * 100 : 0;
            return (
              <details key={g} open className="group">
                <summary className="mb-3 flex cursor-pointer list-none items-end gap-4">
                  <div className="flex items-baseline gap-2.5">
                    <span className="text-[10px] uppercase tracking-[0.18em] text-muted nums">
                      Gen {g}
                    </span>
                    <h2 className="text-base font-semibold tracking-tight">{GEN_NAMES[g]}</h2>
                    <span className="text-[11px] text-muted nums">
                      #{lo}–{hi}
                    </span>
                  </div>
                  <div className="flex flex-1 items-center gap-3">
                    <div className="relative h-[3px] flex-1 overflow-hidden rounded-full bg-border">
                      <div
                        className="absolute inset-y-0 left-0 rounded-full bg-owned transition-[width] duration-300 ease-out"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <span className="shrink-0 text-[11px] nums tabular-nums">
                      <span className="font-semibold text-owned">{ownedInGen}</span>
                      <span className="text-muted"> / {inRange}</span>
                    </span>
                    <span
                      aria-hidden
                      className="ml-1 text-muted transition-transform group-open:rotate-90"
                    >
                      ›
                    </span>
                  </div>
                </summary>
                <div>{renderGrid(items)}</div>
              </details>
            );
          })}
        </div>
      ) : (
        renderGrid(entries)
      )}

      {entries.length === 0 && (
        <div className="rounded-md border border-dashed border-border bg-panel/40 px-4 py-10 text-center text-sm text-muted">
          No Pokémon match these filters.
        </div>
      )}
    </div>
  );
}
