"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, Search, X } from "lucide-react";
import { SETS } from "@/lib/data";
import {
  RARITY_LABEL,
  RARITY_ORDER,
  type Generation,
  type Rarity,
  type SetInfo,
  type Supertype,
} from "@/lib/data/types";
import { PRICE_SOURCE_CURRENCY } from "@/lib/pricing/pokemontcg";
import type { CardSort } from "../_lib/card-sort";
import {
  GENERATIONS,
  GENERATION_LABEL,
  PRICE_BUCKETS,
  REGIONAL_FORMS,
  priceBucketLabel,
  type PriceBucket,
  type RegionalForm,
} from "../_lib/card-filters";
import { useUser } from "../_lib/UserContext";

export type SupertypeFilter = "all" | Supertype;

export interface CardsFilterState {
  search: string;
  supertype: SupertypeFilter;
  setIds: Set<string>;
  rarities: Set<Rarity>;
  types: Set<string>;
  artist: string | null;
  dexFrom: number | null;
  dexTo: number | null;
  // New dimensions — only surfaced when the corresponding feature flag is on.
  // Always present on the state object so consumers don't have to null-check.
  priceBuckets: Set<PriceBucket>;
  generations: Set<Generation>;
  regionalForms: Set<RegionalForm>;
}

export interface CardFiltersFeatures {
  showPrice?: boolean;
  showGeneration?: boolean;
  showRegionalForm?: boolean;
}

interface Props {
  filters: CardsFilterState;
  onFiltersChange: (next: CardsFilterState) => void;
  sort: CardSort;
  onSortChange: (next: CardSort) => void;
  cols: number;
  onColsChange: (next: number) => void;
  resultCount: number;
  totalCount: number;
  artists: string[];
  types: string[];
  features?: CardFiltersFeatures;
}

const SUPERTYPES: { value: SupertypeFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "Pokémon", label: "Pokémon" },
  { value: "Trainer", label: "Trainer" },
  { value: "Energy", label: "Energy" },
];

const SORT_OPTIONS: { value: CardSort; label: string }[] = [
  { value: "number", label: "By #" },
  { value: "rarity", label: "By rarity" },
  { value: "pokemon", label: "By Pokédex #" },
  { value: "set", label: "By set" },
];

function isFiltersDirty(f: CardsFilterState): boolean {
  return (
    f.search.length > 0 ||
    f.supertype !== "all" ||
    f.setIds.size > 0 ||
    f.rarities.size > 0 ||
    f.types.size > 0 ||
    f.artist !== null ||
    f.dexFrom !== null ||
    f.dexTo !== null ||
    f.priceBuckets.size > 0 ||
    f.generations.size > 0 ||
    f.regionalForms.size > 0
  );
}

function clampSize(n: number) {
  return Math.max(2, Math.min(10, Math.round(n)));
}

export function emptyFilters(): CardsFilterState {
  return {
    search: "",
    supertype: "all",
    setIds: new Set(),
    rarities: new Set(),
    types: new Set(),
    artist: null,
    dexFrom: null,
    dexTo: null,
    priceBuckets: new Set(),
    generations: new Set(),
    regionalForms: new Set(),
  };
}

export function CardFiltersToolbar({
  filters,
  onFiltersChange,
  sort,
  onSortChange,
  cols,
  onColsChange,
  resultCount,
  totalCount,
  artists,
  types,
  features = {},
}: Props) {
  const update = (patch: Partial<CardsFilterState>) =>
    onFiltersChange({ ...filters, ...patch });

  const toggleRarity = (r: Rarity) => {
    const next = new Set(filters.rarities);
    if (next.has(r)) next.delete(r);
    else next.add(r);
    update({ rarities: next });
  };

  const toggleType = (t: string) => {
    const next = new Set(filters.types);
    if (next.has(t)) next.delete(t);
    else next.add(t);
    update({ types: next });
  };

  const togglePriceBucket = (b: PriceBucket) => {
    const next = new Set(filters.priceBuckets);
    if (next.has(b)) next.delete(b);
    else next.add(b);
    update({ priceBuckets: next });
  };

  const toggleGeneration = (g: Generation) => {
    const next = new Set(filters.generations);
    if (next.has(g)) next.delete(g);
    else next.add(g);
    update({ generations: next });
  };

  const toggleRegionalForm = (f: RegionalForm) => {
    const next = new Set(filters.regionalForms);
    if (next.has(f)) next.delete(f);
    else next.add(f);
    update({ regionalForms: next });
  };

  const dirty = isFiltersDirty(filters);
  const { priceSource } = useUser();
  const currencySymbol = PRICE_SOURCE_CURRENCY[priceSource] === "EUR" ? "€" : "$";
  const showRow3 =
    features.showPrice || features.showGeneration || features.showRegionalForm;

  return (
    <div className="sticky top-2 z-10 space-y-2 rounded-lg border border-border bg-panel/90 p-3 backdrop-blur shadow-[0_4px_16px_-8px_rgb(0_0_0/0.6)]">
      {/* Row 1: search · supertype · sort · size */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-0 flex-1 sm:min-w-[220px] sm:max-w-xs">
          <Search
            className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted"
            aria-hidden
          />
          <input
            type="search"
            value={filters.search}
            onChange={(e) => update({ search: e.target.value })}
            placeholder="Search by card name"
            className="h-8 w-full rounded-md border border-border bg-panel-2 pl-8 pr-7 text-xs text-text placeholder:text-muted focus:border-accent focus:outline-none"
          />
          {filters.search && (
            <button
              type="button"
              onClick={() => update({ search: "" })}
              aria-label="Clear search"
              className="absolute right-1.5 top-1/2 inline-flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded text-muted transition hover:text-text"
            >
              <X className="h-3 w-3" aria-hidden />
            </button>
          )}
        </div>

        <div className="inline-flex items-center gap-0.5 rounded-md border border-border bg-panel-2/60 p-0.5">
          {SUPERTYPES.map((opt) => {
            const active = filters.supertype === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => update({ supertype: opt.value })}
                className={[
                  "rounded px-2.5 py-1 text-xs font-medium transition",
                  active
                    ? "bg-text text-bg shadow-[0_1px_0_rgb(0_0_0/0.25)]"
                    : "text-muted hover:bg-panel-3/60 hover:text-text",
                ].join(" ")}
              >
                {opt.label}
              </button>
            );
          })}
        </div>

        <div className="flex gap-1.5">
          {SORT_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => onSortChange(opt.value)}
              className={[
                "rounded-md px-2.5 py-1 text-[11px] uppercase tracking-wider transition",
                sort === opt.value
                  ? "bg-accent/15 text-accent"
                  : "text-muted hover:bg-panel-2 hover:text-text",
              ].join(" ")}
            >
              {opt.label}
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
            onChange={(e) => onColsChange(clampSize(Number(e.target.value)))}
            className="h-1 w-28 cursor-pointer accent-[var(--color-accent)] sm:w-36"
            aria-label="Cards per row"
          />
          <span className="w-6 text-right text-[11px] nums">{cols}</span>
        </div>
      </div>

      {/* Row 2: rarity chips · set/artist dropdowns · dex range · type chips · clear */}
      <div className="flex flex-wrap items-center gap-2 border-t border-border pt-2">
        <div className="flex flex-wrap gap-1">
          {RARITY_ORDER.map((r) => {
            const active = filters.rarities.has(r);
            return (
              <button
                key={r}
                type="button"
                onClick={() => toggleRarity(r)}
                className={[
                  "rounded-md border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider transition",
                  active
                    ? "border-accent bg-accent/15 text-accent"
                    : "border-border bg-panel-2 text-muted hover:border-border-strong hover:text-text",
                ].join(" ")}
              >
                {RARITY_LABEL[r]}
              </button>
            );
          })}
        </div>

        <SetMultiSelect
          value={filters.setIds}
          onChange={(setIds) => update({ setIds })}
        />

        <ComboBox
          value={filters.artist}
          onChange={(artist) => update({ artist })}
          options={artists}
          placeholder="Any artist"
          width="w-44"
        />

        <TypeChips
          types={types}
          value={filters.types}
          onToggle={toggleType}
        />

        <DexRange
          from={filters.dexFrom}
          to={filters.dexTo}
          onChange={(dexFrom, dexTo) => update({ dexFrom, dexTo })}
        />

        <div className="ml-auto flex items-center gap-2 text-xs text-muted">
          <span className="nums">
            {resultCount.toLocaleString()}
            {resultCount !== totalCount && (
              <span className="text-muted/60"> / {totalCount.toLocaleString()}</span>
            )}{" "}
            cards
          </span>
          {dirty && (
            <button
              type="button"
              onClick={() => onFiltersChange(emptyFilters())}
              className="text-[11px] uppercase tracking-wider text-muted underline-offset-2 transition hover:text-text hover:underline"
            >
              Clear
            </button>
          )}
        </div>
      </div>

      {showRow3 && (
        <div className="flex flex-wrap items-center gap-2 border-t border-border pt-2">
          {features.showPrice && (
            <ChipGroup label="Price">
              {PRICE_BUCKETS.map((b) => {
                const active = filters.priceBuckets.has(b);
                return (
                  <button
                    key={b}
                    type="button"
                    onClick={() => togglePriceBucket(b)}
                    className={chipClass(active)}
                  >
                    {priceBucketLabel(b, currencySymbol)}
                  </button>
                );
              })}
            </ChipGroup>
          )}

          {features.showGeneration && (
            <ChipGroup label="Region">
              {GENERATIONS.map((g) => {
                const active = filters.generations.has(g);
                return (
                  <button
                    key={g}
                    type="button"
                    onClick={() => toggleGeneration(g)}
                    className={chipClass(active)}
                  >
                    {GENERATION_LABEL[g]}
                  </button>
                );
              })}
            </ChipGroup>
          )}

          {features.showRegionalForm && (
            <ChipGroup label="Form">
              {REGIONAL_FORMS.map((f) => {
                const active = filters.regionalForms.has(f);
                return (
                  <button
                    key={f}
                    type="button"
                    onClick={() => toggleRegionalForm(f)}
                    className={chipClass(active)}
                  >
                    {f}
                  </button>
                );
              })}
            </ChipGroup>
          )}
        </div>
      )}
    </div>
  );
}

function chipClass(active: boolean): string {
  return [
    "rounded-md border px-2 py-0.5 text-[11px] font-medium transition",
    active
      ? "border-accent bg-accent/15 text-accent"
      : "border-border bg-panel-2 text-muted hover:border-border-strong hover:text-text",
  ].join(" ");
}

function ChipGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-1">
      <span className="mr-1 text-[10px] font-semibold uppercase tracking-wider text-muted/80">
        {label}
      </span>
      {children}
    </div>
  );
}

/* ---- subcomponents ---- */

function useClickOutside(open: boolean, onClose: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!ref.current) return;
      if (!ref.current.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);
  return ref;
}

function SetMultiSelect({
  value,
  onChange,
}: {
  value: Set<string>;
  onChange: (next: Set<string>) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useClickOutside(open, () => setOpen(false));

  // Group sets by series, ordered newest series first (alphabetical inside).
  const grouped = useMemo(() => {
    const byseries = new Map<string, SetInfo[]>();
    for (const s of SETS) {
      const arr = byseries.get(s.series);
      if (arr) arr.push(s);
      else byseries.set(s.series, [s]);
    }
    return [...byseries.entries()].map(
      ([series, sets]) =>
        [
          series,
          [...sets].sort((a, b) => b.releaseDate.localeCompare(a.releaseDate)),
        ] as const,
    );
  }, []);

  const toggle = (id: string) => {
    const next = new Set(value);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onChange(next);
  };

  const label = value.size === 0 ? "Any set" : `${value.size} sets`;

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={[
          "inline-flex h-7 items-center gap-1.5 rounded-md border px-2.5 text-xs transition",
          value.size > 0
            ? "border-accent bg-accent/10 text-accent"
            : "border-border bg-panel-2 text-muted hover:border-border-strong hover:text-text",
        ].join(" ")}
      >
        <span>{label}</span>
        <ChevronDown className="h-3 w-3" aria-hidden />
      </button>
      {open && (
        <div className="absolute left-0 top-full z-20 mt-1 max-h-[60vh] w-[min(92vw,420px)] overflow-y-auto rounded-md border border-border bg-panel p-2 shadow-lg">
          <div className="flex items-center justify-between px-1 pb-2">
            <span className="text-[11px] uppercase tracking-wider text-muted">
              Sets
            </span>
            {value.size > 0 && (
              <button
                type="button"
                onClick={() => onChange(new Set())}
                className="text-[10px] uppercase tracking-wider text-muted hover:text-text"
              >
                Clear
              </button>
            )}
          </div>
          {grouped.map(([series, sets]) => (
            <div key={series} className="mb-2 last:mb-0">
              <div className="px-1 pb-1 text-[10px] font-semibold uppercase tracking-wider text-muted/80">
                {series}
              </div>
              <div className="space-y-0.5">
                {sets.map((s) => {
                  const active = value.has(s.id);
                  return (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => toggle(s.id)}
                      className={[
                        "flex w-full items-center justify-between gap-2 rounded px-2 py-1 text-left text-xs transition",
                        active
                          ? "bg-accent/15 text-accent"
                          : "text-text hover:bg-panel-2",
                      ].join(" ")}
                    >
                      <span className="flex items-baseline gap-2 truncate">
                        <span
                          className={[
                            "shrink-0 rounded-sm px-1 py-px text-[10px] font-medium uppercase tracking-wider",
                            active
                              ? "bg-accent/20 text-accent"
                              : "bg-panel-2 text-muted",
                          ].join(" ")}
                        >
                          {s.id}
                        </span>
                        <span className="truncate">{s.name}</span>
                      </span>
                      <span className="shrink-0 text-[10px] text-muted nums">
                        {s.cardCount}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ComboBox({
  value,
  onChange,
  options,
  placeholder,
  width,
}: {
  value: string | null;
  onChange: (next: string | null) => void;
  options: string[];
  placeholder: string;
  width: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const ref = useClickOutside(open, () => setOpen(false));

  const filtered = useMemo(() => {
    if (!query) return options.slice(0, 80);
    const q = query.toLowerCase();
    return options.filter((o) => o.toLowerCase().includes(q)).slice(0, 80);
  }, [query, options]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={[
          "inline-flex h-7 items-center gap-1.5 rounded-md border px-2.5 text-xs transition",
          width,
          value
            ? "border-accent bg-accent/10 text-accent"
            : "border-border bg-panel-2 text-muted hover:border-border-strong hover:text-text",
        ].join(" ")}
      >
        <span className="flex-1 truncate text-left">{value ?? placeholder}</span>
        <ChevronDown className="h-3 w-3 shrink-0" aria-hidden />
      </button>
      {open && (
        <div className="absolute left-0 top-full z-20 mt-1 w-[min(92vw,320px)] overflow-hidden rounded-md border border-border bg-panel shadow-lg">
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter…"
            className="block w-full border-b border-border bg-panel px-3 py-2 text-xs text-text placeholder:text-muted focus:outline-none"
          />
          <div className="max-h-64 overflow-y-auto p-1">
            {value && (
              <button
                type="button"
                onClick={() => {
                  onChange(null);
                  setOpen(false);
                }}
                className="block w-full rounded px-2 py-1 text-left text-xs text-muted transition hover:bg-panel-2 hover:text-text"
              >
                {placeholder} (clear)
              </button>
            )}
            {filtered.length === 0 && (
              <div className="px-2 py-2 text-xs text-muted">No match.</div>
            )}
            {filtered.map((opt) => {
              const active = value === opt;
              return (
                <button
                  key={opt}
                  type="button"
                  onClick={() => {
                    onChange(opt);
                    setOpen(false);
                  }}
                  className={[
                    "block w-full truncate rounded px-2 py-1 text-left text-xs transition",
                    active
                      ? "bg-accent/15 text-accent"
                      : "text-text hover:bg-panel-2",
                  ].join(" ")}
                >
                  {opt}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function TypeChips({
  types,
  value,
  onToggle,
}: {
  types: string[];
  value: Set<string>;
  onToggle: (t: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useClickOutside(open, () => setOpen(false));

  if (types.length === 0) return null;

  const label = value.size === 0 ? "Any type" : `${value.size} types`;

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={[
          "inline-flex h-7 items-center gap-1.5 rounded-md border px-2.5 text-xs transition",
          value.size > 0
            ? "border-accent bg-accent/10 text-accent"
            : "border-border bg-panel-2 text-muted hover:border-border-strong hover:text-text",
        ].join(" ")}
      >
        <span>{label}</span>
        <ChevronDown className="h-3 w-3" aria-hidden />
      </button>
      {open && (
        <div className="absolute left-0 top-full z-20 mt-1 w-[min(92vw,260px)] rounded-md border border-border bg-panel p-2 shadow-lg">
          <div className="flex flex-wrap gap-1">
            {types.map((t) => {
              const active = value.has(t);
              return (
                <button
                  key={t}
                  type="button"
                  onClick={() => onToggle(t)}
                  className={[
                    "rounded-md border px-2 py-0.5 text-[11px] transition",
                    active
                      ? "border-accent bg-accent/15 text-accent"
                      : "border-border bg-panel-2 text-muted hover:border-border-strong hover:text-text",
                  ].join(" ")}
                >
                  {t}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function DexRange({
  from,
  to,
  onChange,
}: {
  from: number | null;
  to: number | null;
  onChange: (from: number | null, to: number | null) => void;
}) {
  const parse = (v: string): number | null => {
    if (v.trim() === "") return null;
    const n = parseInt(v, 10);
    if (!Number.isFinite(n)) return null;
    return Math.max(1, Math.min(1025, n));
  };
  const active = from !== null || to !== null;
  return (
    <div
      className={[
        "inline-flex h-7 items-center gap-1.5 rounded-md border px-2 text-xs",
        active
          ? "border-accent bg-accent/10 text-accent"
          : "border-border bg-panel-2 text-muted",
      ].join(" ")}
    >
      <span className="text-[10px] uppercase tracking-wider">Dex</span>
      <input
        type="number"
        min={1}
        max={1025}
        value={from ?? ""}
        onChange={(e) => onChange(parse(e.target.value), to)}
        placeholder="1"
        className="h-5 w-12 rounded-sm bg-transparent text-center nums focus:outline-none"
        aria-label="Dex from"
      />
      <span aria-hidden>–</span>
      <input
        type="number"
        min={1}
        max={1025}
        value={to ?? ""}
        onChange={(e) => onChange(from, parse(e.target.value))}
        placeholder="1025"
        className="h-5 w-14 rounded-sm bg-transparent text-center nums focus:outline-none"
        aria-label="Dex to"
      />
    </div>
  );
}
