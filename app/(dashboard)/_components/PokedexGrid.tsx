"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronRight } from "lucide-react";
import { MEGAS, POKEDEX, VARIANTS } from "@/lib/data";
import {
  GEN_NAMES,
  GEN_RANGES,
  type CardEntry,
  type Generation,
  type MegaForm,
  type RegionalVariant,
} from "@/lib/data/types";
import { useOwnedCards } from "../_lib/OwnedCardsContext";
import { useUser } from "../_lib/UserContext";
import { FilterBar, type GridFilter } from "./FilterBar";
import { PokemonCell } from "./PokemonCell";
import { MegaCell } from "./MegaCell";
import { VariantCell } from "./VariantCell";

type Slot =
  | { kind: "dex"; key: string; dex: number; name: string; gen: Generation }
  | { kind: "mega"; key: string; form: MegaForm; gen: Generation }
  | { kind: "variant"; key: string; form: RegionalVariant; gen: Generation };

interface Props {
  /** Defaults to "pokedex" (renders the 1025 base species + optional Megas
   * and/or regional variants). When "megas", the grid renders ONLY mega
   * forms (the /megas route, placement === "separate"); when "variants", ONLY
   * regional-variant forms (the /variants route, placement === "separate"). */
  mode?: "pokedex" | "megas" | "variants";
  dexNumbers?: number[];
  groupByGenDefault?: boolean;
  showGenToggle?: boolean;
  showFilter?: boolean;
  showSearch?: boolean;
  storageKey?: string;
  /** Override click handler — used by pack-logging flow. Only fires for
   * dex slots; Mega slots never appear when this is set. */
  onCellClick?: (dex: number) => void;
  /** Click handler for Mega/Primal slots — opens the mega card-variant picker
   * on the Pokédex page. When omitted, Mega cells render but aren't clickable. */
  onMegaClick?: (form: MegaForm) => void;
  /** Click handler for regional-variant slots — opens the variant card-variant
   * picker. When omitted, variant cells render but aren't clickable. */
  onVariantClick?: (form: RegionalVariant) => void;
  /** Set of dex numbers visually selected (only used with onCellClick) */
  selectedDex?: Set<number>;
  /** Per-dex card art to show in the cell (letterboxed). Used by
   * pokedex-scope binders. Cells without an entry fall back to the official
   * artwork + amber-dot treatment. */
  displayCardByDex?: Map<number, CardEntry>;
  /** When true, the grid fills its (bounded-height) parent and owns its own
   * vertical scroll: the filter/density toolbar stays pinned while the cells
   * scroll. Used by the viewport-fit /pokedex and /megas pages. Off by default
   * so embedded uses (binder detail) keep flowing in the page's own scroll. */
  fitToViewport?: boolean;
}

const COLS_KEY_PREFIX = "pokedex.cols";
const GROUP_KEY_PREFIX = "pokedex.groupByGen";
const MEGA_GROUP_LABEL = "Mega Evolutions";
const VARIANT_GROUP_LABEL = "Regional Variants";

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
  onMegaClick,
  onVariantClick,
  selectedDex,
  displayCardByDex,
  fitToViewport = false,
}: Props) {
  const { ownedSpecies, ownedMegaForms, ownedVariantForms } = useOwnedCards();
  const {
    isGuest,
    treatMegasAsSeparate,
    megaPlacement,
    treatVariantsAsSeparate,
    variantPlacement,
  } = useUser();
  const [filter, setFilter] = useState<GridFilter>("all");
  const [query, setQuery] = useState("");
  const [cols, setCols] = useState(20);
  const [groupByGen, setGroupByGen] = useState(groupByGenDefault);
  const [mounted, setMounted] = useState(false);
  // Mobile keeps an independent density (own storage key + a much lower
  // default) so phones get tappable ~40px cells instead of inheriting the
  // desktop default of 20 columns (~18px cells, untappable). Desktop reads
  // the original key + default 20, so its behaviour is byte-identical.
  const [isMobile, setIsMobile] = useState(false);
  const colsKey = `${COLS_KEY_PREFIX}.${storageKey}${isMobile ? ".m" : ""}`;

  useEffect(() => {
    const mobile =
      typeof window !== "undefined" &&
      window.matchMedia("(max-width: 767px)").matches;
    setIsMobile(mobile);
    const key = `${COLS_KEY_PREFIX}.${storageKey}${mobile ? ".m" : ""}`;
    setCols(loadInt(key, mobile ? 8 : 20));
    if (showGenToggle) {
      setGroupByGen(loadBool(`${GROUP_KEY_PREFIX}.${storageKey}`, groupByGenDefault));
    }
    setMounted(true);
  }, [storageKey, groupByGenDefault, showGenToggle]);

  useEffect(() => {
    if (mounted) window.localStorage.setItem(colsKey, String(cols));
  }, [cols, colsKey, mounted]);

  useEffect(() => {
    if (mounted) {
      window.localStorage.setItem(
        `${GROUP_KEY_PREFIX}.${storageKey}`,
        groupByGen ? "1" : "0",
      );
    }
  }, [groupByGen, storageKey, mounted]);

  const restrict = useMemo(() => (dexNumbers ? new Set(dexNumbers) : null), [dexNumbers]);

  // Restricted views (pack-logging, pokedex-scope binders) target specific
  // dex numbers and never show Megas. The Pokédex page sets `onCellClick`
  // to open a variant picker — that's fine; we still want Megas there.
  // `displayCardByDex` is the binder-only signal.
  const includeMegas =
    mode === "megas"
      ? true
      : mode === "variants"
      ? false
      : !restrict &&
        !displayCardByDex &&
        treatMegasAsSeparate &&
        megaPlacement !== "separate";

  const includeVariants =
    mode === "variants"
      ? true
      : mode === "megas"
      ? false
      : !restrict &&
        !displayCardByDex &&
        treatVariantsAsSeparate &&
        variantPlacement !== "separate";

  const allSlots: Slot[] = useMemo(() => {
    if (mode === "megas") {
      return MEGAS.map((form) => ({
        kind: "mega" as const,
        key: `mega:${form.formKey}`,
        form,
        gen: form.gen,
      }));
    }
    if (mode === "variants") {
      return VARIANTS.map((form) => ({
        kind: "variant" as const,
        key: `variant:${form.variantKey}`,
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

    if (!includeMegas && !includeVariants) return baseDex;

    const megaSlots: Slot[] = includeMegas
      ? MEGAS.map((form) => ({
          kind: "mega" as const,
          key: `mega:${form.formKey}`,
          form,
          gen: form.gen,
        }))
      : [];

    const variantSlots: Slot[] = includeVariants
      ? VARIANTS.map((form) => ({
          kind: "variant" as const,
          key: `variant:${form.variantKey}`,
          form,
          gen: form.gen,
        }))
      : [];

    const megaInline = includeMegas && megaPlacement === "inline";
    const variantInline = includeVariants && variantPlacement === "inline";

    if (megaInline || variantInline) {
      // Insert each inline Mega/variant slot immediately after the slots for
      // its baseDex. Order per dex is base → mega(s) → variant(s); megas and
      // variants are each already in their canonical render order.
      const megasByBaseDex = new Map<number, Slot[]>();
      if (megaInline) {
        for (const m of megaSlots) {
          const dex = m.kind === "mega" ? m.form.baseDex : -1;
          const arr = megasByBaseDex.get(dex);
          if (arr) arr.push(m);
          else megasByBaseDex.set(dex, [m]);
        }
      }
      const variantsByBaseDex = new Map<number, Slot[]>();
      if (variantInline) {
        for (const v of variantSlots) {
          const dex = v.kind === "variant" ? v.form.baseDex : -1;
          const arr = variantsByBaseDex.get(dex);
          if (arr) arr.push(v);
          else variantsByBaseDex.set(dex, [v]);
        }
      }
      const out: Slot[] = [];
      for (const slot of baseDex) {
        out.push(slot);
        if (slot.kind === "dex") {
          const megas = megasByBaseDex.get(slot.dex);
          if (megas) out.push(...megas);
          const variants = variantsByBaseDex.get(slot.dex);
          if (variants) out.push(...variants);
        }
      }
      // Any non-inline (appended) megas/variants still tack on at the end.
      const appended: Slot[] = [];
      if (includeMegas && !megaInline) appended.push(...megaSlots);
      if (includeVariants && !variantInline) appended.push(...variantSlots);
      return [...out, ...appended];
    }

    // Both appended (or only one feature on, appended) → tack on at the end,
    // megas before variants.
    return [...baseDex, ...megaSlots, ...variantSlots];
  }, [
    mode,
    restrict,
    includeMegas,
    includeVariants,
    megaPlacement,
    variantPlacement,
  ]);

  const slotOwned = useCallback(
    (slot: Slot) =>
      slot.kind === "mega"
        ? ownedMegaForms.has(slot.form.formKey)
        : slot.kind === "variant"
        ? ownedVariantForms.has(slot.form.variantKey)
        : ownedSpecies.has(slot.dex),
    [ownedMegaForms, ownedVariantForms, ownedSpecies],
  );

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
          // Numeric searches don't apply to Megas/variants (no dex#).
          if (isNumeric) return false;
          if (!slot.form.displayName.toLowerCase().includes(needle)) return false;
        }
      }
      switch (filter) {
        case "all":
          return true;
        case "owned":
          return slotOwned(slot);
        case "needed":
          return !slotOwned(slot);
      }
    });
  }, [allSlots, query, filter, slotOwned]);

  // Bucket for gen-grouped rendering. In appended mode (mode='pokedex' +
  // placement='appended'), Megas go into their own synthetic bucket below
  // gen 9; everywhere else they live alongside the gen they evolve from.
  const gens: Generation[] = useMemo(() => {
    const set = new Set<Generation>();
    for (const slot of filtered) {
      if (mode === "megas" || mode === "variants") set.add(slot.gen);
      else if (slot.kind === "dex") set.add(slot.gen);
      else if (slot.kind === "mega" && megaPlacement === "inline") set.add(slot.gen);
      else if (slot.kind === "variant" && variantPlacement === "inline") set.add(slot.gen);
      // appended Megas/variants go in their synthetic groups, not a real gen
    }
    return [...set].sort((a, b) => a - b);
  }, [filtered, mode, megaPlacement, variantPlacement]);

  const slotsByGen = useMemo(() => {
    const map = new Map<Generation, Slot[]>();
    for (const slot of filtered) {
      if (mode === "pokedex" && slot.kind === "mega" && megaPlacement === "appended") continue;
      if (mode === "pokedex" && slot.kind === "variant" && variantPlacement === "appended")
        continue;
      const arr = map.get(slot.gen);
      if (arr) arr.push(slot);
      else map.set(slot.gen, [slot]);
    }
    return map;
  }, [filtered, mode, megaPlacement, variantPlacement]);

  const appendedMegas = useMemo(() => {
    if (mode !== "pokedex" || megaPlacement !== "appended" || !includeMegas) return [];
    return filtered.filter((s) => s.kind === "mega");
  }, [filtered, mode, megaPlacement, includeMegas]);

  const appendedVariants = useMemo(() => {
    if (mode !== "pokedex" || variantPlacement !== "appended" || !includeVariants) return [];
    return filtered.filter((s) => s.kind === "variant");
  }, [filtered, mode, variantPlacement, includeVariants]);

  // For the top-level "owned"/"all" counts in the FilterBar.
  const totalOwnedInView = useMemo(
    () => filtered.filter(slotOwned).length,
    [filtered, slotOwned],
  );

  const gap = cols <= 10 ? 8 : cols <= 18 ? 6 : 4;

  const renderSlot = (slot: Slot) => {
    if (slot.kind === "mega") {
      return <MegaCell key={slot.key} form={slot.form} onClick={onMegaClick} />;
    }
    if (slot.kind === "variant") {
      return <VariantCell key={slot.key} form={slot.form} onClick={onVariantClick} />;
    }
    return (
      <PokemonCell
        key={slot.key}
        dex={slot.dex}
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

  const toolbar = (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-3 border-b border-border pb-3">
        {showFilter && (
          <FilterBar
            value={filter}
            onChange={setFilter}
            options={
              isGuest
                ? [{ value: "all", label: "All", hint: "Every entry in the grid" }]
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
              placeholder={mode === "megas" || mode === "variants" ? "Name" : "Name or #"}
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
  );

  const body = (
    <>
      {groupByGen && showGenToggle ? (
        <div className="space-y-7">
          {gens.map((g) => {
            const items = slotsByGen.get(g);
            if (!items || items.length === 0) return null;
            const [lo, hi] = GEN_RANGES[g];
            const ownedInGen = items.filter(slotOwned).length;
            // Denominator considers ALL slots that would belong to this
            // gen group (ignoring the current filter, so percentages stay
            // honest even when filtering down).
            const totalInGen = (() => {
              if (mode === "megas") {
                return MEGAS.filter((m) => m.gen === g).length;
              }
              if (mode === "variants") {
                return VARIANTS.filter((v) => v.gen === g).length;
              }
              const dexCount = restrict
                ? POKEDEX.filter((p) => restrict.has(p.dex) && p.gen === g).length
                : hi - lo + 1;
              const megaCount =
                includeMegas && megaPlacement === "inline"
                  ? MEGAS.filter((m) => m.gen === g).length
                  : 0;
              const variantCount =
                includeVariants && variantPlacement === "inline"
                  ? VARIANTS.filter((v) => v.gen === g).length
                  : 0;
              return dexCount + megaCount + variantCount;
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
          {appendedVariants.length > 0 && (
            <details open className="group">
              <summary className="mb-3 flex cursor-pointer list-none items-end gap-4">
                <div className="flex items-baseline gap-2.5">
                  <span className="text-[10px] uppercase tracking-[0.18em] text-muted nums">
                    Bonus
                  </span>
                  <h2 className="text-base font-semibold tracking-tight">{VARIANT_GROUP_LABEL}</h2>
                  <span className="text-[11px] text-muted nums">{VARIANTS.length} forms</span>
                </div>
                <div className="flex flex-1 items-center gap-3">
                  {isGuest ? (
                    <div className="flex-1" />
                  ) : (
                    (() => {
                      const owned = appendedVariants.filter(
                        (s) => s.kind === "variant" && ownedVariantForms.has(s.form.variantKey),
                      ).length;
                      const total = VARIANTS.length;
                      const pct = total > 0 ? (owned / total) * 100 : 0;
                      return (
                        <>
                          <div className="relative h-[3px] flex-1 overflow-hidden rounded-full bg-border">
                            <div
                              className="absolute inset-y-0 left-0 rounded-full bg-variant transition-[width] duration-300 ease-out"
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                          <span className="shrink-0 text-[11px] nums tabular-nums">
                            <span className="font-semibold text-variant">{owned}</span>
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
              <div>{renderGrid(appendedVariants)}</div>
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
    </>
  );

  if (fitToViewport) {
    // The page scrolls as a document; the filter/density bar stays pinned just
    // below the app top bar (`top-16`) while the cells scroll past. The toolbar
    // and body share this one parent so the sticky bar stays pinned for the
    // whole grid (a `sticky` element only holds within its containing block).
    return (
      <div className="space-y-5">
        <div className="sticky top-16 z-sticky bg-white/85 pt-3 backdrop-blur-md dark:bg-zinc-950/85">
          {toolbar}
        </div>
        <div className="space-y-5">{body}</div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {toolbar}
      {body}
    </div>
  );
}
