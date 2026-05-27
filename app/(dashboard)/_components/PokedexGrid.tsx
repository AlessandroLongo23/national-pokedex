"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronRight } from "lucide-react";
import { COVERAGE, MEGAS, POKEDEX } from "@/lib/data";
import {
  GEN_NAMES,
  GEN_RANGES,
  type CardEntry,
  type Generation,
  type MegaForm,
} from "@/lib/data/types";
import { useOwnedCards } from "../_lib/OwnedCardsContext";
import { useUser } from "../_lib/UserContext";
import { FilterBar, type GridFilter } from "./FilterBar";
import { PokemonCell } from "./PokemonCell";
import { MegaCell } from "./MegaCell";

type Slot =
  | { kind: "dex"; key: string; dex: number; name: string; gen: Generation }
  | { kind: "mega"; key: string; form: MegaForm; gen: Generation };

interface Props {
  /** Defaults to "pokedex" (renders the 1025 base species + optional Megas).
   * When "megas", the grid renders ONLY mega forms — used by the /megas
   * route when placement === "separate". */
  mode?: "pokedex" | "megas";
  dexNumbers?: number[];
  groupByGenDefault?: boolean;
  showGenToggle?: boolean;
  showFilter?: boolean;
  showSearch?: boolean;
  storageKey?: string;
  /** Override click handler — used by pack-logging flow. Only fires for
   * dex slots; Mega slots never appear when this is set. */
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
const MEGA_GROUP_LABEL = "Mega Evolutions";

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
  mode = "pokedex",
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
  const { ownedSpecies, ownedMegaForms } = useOwnedCards();
  const { isGuest, treatMegasAsSeparate, megaPlacement } = useUser();
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

  // Restricted views (pack-logging, pokedex-scope binders) target specific
  // dex numbers and never show Megas. The Pokédex page sets `onCellClick`
  // to open a variant picker — that's fine; we still want Megas there.
  // `displayCardByDex` is the binder-only signal.
  const includeMegas =
    mode === "megas"
      ? true
      : !restrict &&
        !displayCardByDex &&
        treatMegasAsSeparate &&
        megaPlacement !== "separate";

  const allSlots: Slot[] = useMemo(() => {
    if (mode === "megas") {
      return MEGAS.map((form) => ({
        kind: "mega" as const,
        key: `mega:${form.formKey}`,
        form,
        gen: form.gen,
      }));
    }

    const baseDex: Slot[] = (restrict ? POKEDEX.filter((p) => restrict.has(p.dex)) : POKEDEX).map(
      (p) => ({
        kind: "dex" as const,
        key: `dex:${p.dex}`,
        dex: p.dex,
        name: p.name,
        gen: p.gen,
      }),
    );

    if (!includeMegas) return baseDex;

    const megaSlots: Slot[] = MEGAS.map((form) => ({
      kind: "mega" as const,
      key: `mega:${form.formKey}`,
      form,
      gen: form.gen,
    }));

    if (megaPlacement === "inline") {
      // Insert each Mega slot immediately after the last slot for its
      // baseDex (handles multiple Megas sharing a baseDex like X/Y).
      const byBaseDex = new Map<number, Slot[]>();
      for (const m of megaSlots) {
        const arr = byBaseDex.get(m.kind === "mega" ? m.form.baseDex : -1);
        if (arr) arr.push(m);
        else byBaseDex.set(m.kind === "mega" ? m.form.baseDex : -1, [m]);
      }
      const out: Slot[] = [];
      for (const slot of baseDex) {
        out.push(slot);
        if (slot.kind === "dex") {
          const megas = byBaseDex.get(slot.dex);
          if (megas) out.push(...megas);
        }
      }
      return out;
    }

    // Appended placement → Megas tacked on at the end.
    return [...baseDex, ...megaSlots];
  }, [mode, restrict, includeMegas, megaPlacement]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const isNumeric = needle !== "" && !Number.isNaN(Number(needle));
    return allSlots.filter((slot) => {
      if (needle) {
        if (slot.kind === "dex") {
          if (!slot.name.toLowerCase().includes(needle) && String(slot.dex) !== needle) {
            return false;
          }
        } else {
          // Numeric searches don't apply to Megas (they have no dex#).
          if (isNumeric) return false;
          if (!slot.form.displayName.toLowerCase().includes(needle)) return false;
        }
      }
      switch (filter) {
        case "all":
          return true;
        case "covered":
          return slot.kind === "mega" ? true : !missingSet.has(slot.dex);
        case "missing":
          return slot.kind === "mega" ? false : missingSet.has(slot.dex);
        case "owned":
          return slot.kind === "mega"
            ? ownedMegaForms.has(slot.form.formKey)
            : ownedSpecies.has(slot.dex);
        case "needed":
          return slot.kind === "mega"
            ? !ownedMegaForms.has(slot.form.formKey)
            : !ownedSpecies.has(slot.dex);
      }
    });
  }, [allSlots, query, filter, missingSet, ownedSpecies, ownedMegaForms]);

  // Bucket for gen-grouped rendering. In appended mode (mode='pokedex' +
  // placement='appended'), Megas go into their own synthetic bucket below
  // gen 9; everywhere else they live alongside the gen they evolve from.
  const gens: Generation[] = useMemo(() => {
    const set = new Set<Generation>();
    for (const slot of filtered) {
      if (mode === "megas") set.add(slot.gen);
      else if (slot.kind === "dex") set.add(slot.gen);
      else if (megaPlacement === "inline") set.add(slot.gen);
      // appended Megas go in the synthetic group, not a real gen
    }
    return [...set].sort((a, b) => a - b);
  }, [filtered, mode, megaPlacement]);

  const slotsByGen = useMemo(() => {
    const map = new Map<Generation, Slot[]>();
    for (const slot of filtered) {
      if (mode !== "megas" && slot.kind === "mega" && megaPlacement === "appended") continue;
      const arr = map.get(slot.gen);
      if (arr) arr.push(slot);
      else map.set(slot.gen, [slot]);
    }
    return map;
  }, [filtered, mode, megaPlacement]);

  const appendedMegas = useMemo(() => {
    if (mode === "megas" || megaPlacement !== "appended" || !includeMegas) return [];
    return filtered.filter((s) => s.kind === "mega");
  }, [filtered, mode, megaPlacement, includeMegas]);

  // For the top-level "owned"/"all" counts in the FilterBar.
  const totalOwnedInView = useMemo(
    () =>
      filtered.filter((slot) =>
        slot.kind === "mega"
          ? ownedMegaForms.has(slot.form.formKey)
          : ownedSpecies.has(slot.dex),
      ).length,
    [filtered, ownedSpecies, ownedMegaForms],
  );

  const gap = cols <= 10 ? 8 : cols <= 18 ? 6 : 4;

  const renderSlot = (slot: Slot) => {
    if (slot.kind === "mega") {
      return <MegaCell key={slot.key} form={slot.form} />;
    }
    return (
      <PokemonCell
        key={slot.key}
        dex={slot.dex}
        isCovered={!missingSet.has(slot.dex)}
        onClick={onCellClick}
        selected={selectedDex?.has(slot.dex)}
        displayCard={displayCardByDex?.get(slot.dex)}
      />
    );
  };

  const renderGrid = (items: Slot[]) => (
    <div
      className="grid"
      style={{
        gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
        gap: `${gap}px`,
      }}
    >
      {items.map(renderSlot)}
    </div>
  );

  const minCols = 6;
  const maxCols = 40;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-3 border-b border-border pb-3">
        {showFilter && (
          <FilterBar
            value={filter}
            onChange={setFilter}
            options={
              isGuest
                ? [
                    { value: "all", label: "All", hint: "Every entry in the grid" },
                    { value: "covered", label: "Available", hint: "A card exists in the tracked sets" },
                    { value: "missing", label: "No card", hint: "No card exists for this Pokémon in the tracked sets" },
                  ]
                : undefined
            }
            counts={
              isGuest
                ? { all: filtered.length }
                : { all: filtered.length, owned: totalOwnedInView }
            }
          />
        )}
        {showSearch && (
          <div className="relative">
            <span className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-[11px] text-muted">⌕</span>
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={mode === "megas" ? "Name" : "Name or #"}
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

      {groupByGen && showGenToggle ? (
        <div className="space-y-7">
          {gens.map((g) => {
            const items = slotsByGen.get(g);
            if (!items || items.length === 0) return null;
            const [lo, hi] = GEN_RANGES[g];
            const ownedInGen = items.filter((s) =>
              s.kind === "mega"
                ? ownedMegaForms.has(s.form.formKey)
                : ownedSpecies.has(s.dex),
            ).length;
            // Denominator considers ALL slots that would belong to this
            // gen group (ignoring the current filter, so percentages stay
            // honest even when filtering down).
            const totalInGen = (() => {
              if (mode === "megas") {
                return MEGAS.filter((m) => m.gen === g).length;
              }
              const dexCount = restrict
                ? POKEDEX.filter((p) => restrict.has(p.dex) && p.gen === g).length
                : hi - lo + 1;
              const megaCount =
                includeMegas && megaPlacement === "inline"
                  ? MEGAS.filter((m) => m.gen === g).length
                  : 0;
              return dexCount + megaCount;
            })();
            const pct = totalInGen > 0 ? (ownedInGen / totalInGen) * 100 : 0;
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
                    {isGuest ? (
                      <div className="flex-1" />
                    ) : (
                      <>
                        <div className="relative h-[3px] flex-1 overflow-hidden rounded-full bg-border">
                          <div
                            className="absolute inset-y-0 left-0 rounded-full bg-owned transition-[width] duration-300 ease-out"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <span className="shrink-0 text-[11px] nums tabular-nums">
                          <span className="font-semibold text-owned">{ownedInGen}</span>
                          <span className="text-muted"> / {totalInGen}</span>
                        </span>
                      </>
                    )}
                    <ChevronRight
                      aria-hidden
                      className="ml-1 h-3.5 w-3.5 text-muted transition-transform group-open:rotate-90"
                    />
                  </div>
                </summary>
                <div>{renderGrid(items)}</div>
              </details>
            );
          })}
          {appendedMegas.length > 0 && (
            <details open className="group">
              <summary className="mb-3 flex cursor-pointer list-none items-end gap-4">
                <div className="flex items-baseline gap-2.5">
                  <span className="text-[10px] uppercase tracking-[0.18em] text-muted nums">
                    Bonus
                  </span>
                  <h2 className="text-base font-semibold tracking-tight">{MEGA_GROUP_LABEL}</h2>
                  <span className="text-[11px] text-muted nums">{MEGAS.length} forms</span>
                </div>
                <div className="flex flex-1 items-center gap-3">
                  {isGuest ? (
                    <div className="flex-1" />
                  ) : (
                    (() => {
                      const owned = appendedMegas.filter(
                        (s) => s.kind === "mega" && ownedMegaForms.has(s.form.formKey),
                      ).length;
                      const total = MEGAS.length;
                      const pct = total > 0 ? (owned / total) * 100 : 0;
                      return (
                        <>
                          <div className="relative h-[3px] flex-1 overflow-hidden rounded-full bg-border">
                            <div
                              className="absolute inset-y-0 left-0 rounded-full bg-mega transition-[width] duration-300 ease-out"
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                          <span className="shrink-0 text-[11px] nums tabular-nums">
                            <span className="font-semibold text-mega">{owned}</span>
                            <span className="text-muted"> / {total}</span>
                          </span>
                        </>
                      );
                    })()
                  )}
                  <ChevronRight
                    aria-hidden
                    className="ml-1 h-3.5 w-3.5 text-muted transition-transform group-open:rotate-90"
                  />
                </div>
              </summary>
              <div>{renderGrid(appendedMegas)}</div>
            </details>
          )}
        </div>
      ) : (
        renderGrid(filtered)
      )}

      {filtered.length === 0 && (
        <div className="rounded-md border border-dashed border-border bg-panel/40 px-4 py-10 text-center text-sm text-muted">
          No Pokémon match these filters.
        </div>
      )}
    </div>
  );
}
