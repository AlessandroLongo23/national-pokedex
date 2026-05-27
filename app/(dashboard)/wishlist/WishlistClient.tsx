"use client";

import { useEffect, useMemo, useState } from "react";
import type { CardEntry } from "@/lib/data/types";
import { genOf } from "@/lib/data/types";
import { pickPrice } from "@/lib/pricing/pokemontcg";
import { useWishlist } from "../_lib/WishlistContext";
import { useUser } from "../_lib/UserContext";
import {
  CardPricesProvider,
  type CardPriceRecord,
} from "../_lib/CardPricesContext";
import {
  emptyFilters,
  type CardsFilterState,
} from "../_components/filters/types";
import { ToolbarSheet } from "../_components/filters/ToolbarSheet";
import { ToolbarInline } from "../_components/filters/ToolbarInline";
import { ToolbarTiered } from "../_components/filters/ToolbarTiered";
import { priceBucketOf, regionalFormOf } from "../_lib/card-filters";
import { sortCards, type CardSort } from "../_lib/card-sort";
import { VirtualizedCardGrid } from "../cards/_components/VirtualizedCardGrid";

const SIZE_STORAGE_KEY = "cardgrid.size.wishlist";
const VARIANT_STORAGE_KEY = "wishlist.toolbar.variant";

type Variant = "sheet" | "inline" | "tiered";

const VARIANT_LABEL: Record<Variant, string> = {
  sheet: "Sheet",
  inline: "Inline",
  tiered: "Tiered",
};

const VARIANT_HINT: Record<Variant, string> = {
  sheet: "One Filters entry · side panel",
  inline: "All triggers visible · active chips below",
  tiered: "Primary inline · expand for more",
};

function clampSize(n: number) {
  return Math.max(2, Math.min(10, Math.round(n)));
}

function applyFilters(
  cards: CardEntry[],
  f: CardsFilterState,
  searchDebounced: string,
  prices: Map<string, { tcgplayer?: number; cardmarket?: number }>,
  source: "tcgplayer" | "cardmarket",
): CardEntry[] {
  const q = searchDebounced.trim().toLowerCase();
  const hasSetIds = f.setIds.size > 0;
  const hasRarities = f.rarities.size > 0;
  const hasTypes = f.types.size > 0;
  const hasDex = f.dexFrom !== null || f.dexTo !== null;
  const hasPriceBuckets = f.priceBuckets.size > 0;
  const hasGenerations = f.generations.size > 0;
  const hasRegionalForms = f.regionalForms.size > 0;
  const lo = f.dexFrom ?? 1;
  const hi = f.dexTo ?? 1025;
  const dexLo = Math.min(lo, hi);
  const dexHi = Math.max(lo, hi);

  return cards.filter((c) => {
    if (q && !c.name.toLowerCase().includes(q)) return false;
    if (f.supertype !== "all" && c.supertype !== f.supertype) return false;
    if (hasSetIds && !f.setIds.has(c.setId)) return false;
    if (hasRarities && !f.rarities.has(c.rarity)) return false;
    if (hasTypes) {
      let hit = false;
      for (const t of c.types) {
        if (f.types.has(t)) {
          hit = true;
          break;
        }
      }
      if (!hit) return false;
    }
    if (f.artist && c.artist !== f.artist) return false;
    if (hasDex) {
      let hit = false;
      for (const d of c.dex) {
        if (d >= dexLo && d <= dexHi) {
          hit = true;
          break;
        }
      }
      if (!hit) return false;
    }
    if (hasGenerations) {
      let hit = false;
      for (const d of c.dex) {
        if (f.generations.has(genOf(d))) {
          hit = true;
          break;
        }
      }
      if (!hit) return false;
    }
    if (hasRegionalForms) {
      const form = regionalFormOf(c);
      if (!form || !f.regionalForms.has(form)) return false;
    }
    if (hasPriceBuckets) {
      const price = pickPrice(prices.get(c.id), source);
      if (!f.priceBuckets.has(priceBucketOf(price))) return false;
    }
    return true;
  });
}

interface Props {
  cards: CardEntry[];
  prices: CardPriceRecord;
  types: string[];
  artists: string[];
}

export function WishlistClient({ cards, prices, types, artists }: Props) {
  const { wishlist } = useWishlist();
  const { priceSource } = useUser();
  const [filters, setFilters] = useState<CardsFilterState>(() => emptyFilters());
  const [sort, setSort] = useState<CardSort>("pokemon");
  const [cols, setCols] = useState(5);
  const [mounted, setMounted] = useState(false);
  const [variant, setVariant] = useState<Variant>("sheet");

  const [searchDebounced, setSearchDebounced] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setSearchDebounced(filters.search), 150);
    return () => clearTimeout(t);
  }, [filters.search]);

  useEffect(() => {
    const rawSize = window.localStorage.getItem(SIZE_STORAGE_KEY);
    if (rawSize) {
      const n = parseInt(rawSize, 10);
      if (Number.isFinite(n)) setCols(clampSize(n));
    }
    const url = new URL(window.location.href);
    const qp = url.searchParams.get("toolbar") as Variant | null;
    if (qp === "sheet" || qp === "inline" || qp === "tiered") {
      setVariant(qp);
    } else {
      const stored = window.localStorage.getItem(
        VARIANT_STORAGE_KEY,
      ) as Variant | null;
      if (stored === "sheet" || stored === "inline" || stored === "tiered") {
        setVariant(stored);
      }
    }
    setMounted(true);
  }, []);
  useEffect(() => {
    if (mounted) window.localStorage.setItem(SIZE_STORAGE_KEY, String(cols));
  }, [cols, mounted]);
  useEffect(() => {
    if (mounted) window.localStorage.setItem(VARIANT_STORAGE_KEY, variant);
  }, [variant, mounted]);

  const priceMap = useMemo(() => new Map(Object.entries(prices)), [prices]);

  const visible = useMemo(
    () => cards.filter((c) => wishlist.has(c.id)),
    [cards, wishlist],
  );

  const filtered = useMemo(
    () => applyFilters(visible, filters, searchDebounced, priceMap, priceSource),
    [visible, filters, searchDebounced, priceMap, priceSource],
  );

  const sorted = useMemo(() => sortCards(filtered, sort), [filtered, sort]);

  if (visible.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-panel/50 p-12 text-center">
        <p className="text-sm text-muted">
          Nothing here yet — wishlist a card from the Pokédex or any set page.
        </p>
      </div>
    );
  }

  const toolbarProps = {
    filters,
    onFiltersChange: setFilters,
    sort,
    onSortChange: setSort,
    cols,
    onColsChange: setCols,
    resultCount: sorted.length,
    totalCount: visible.length,
    artists,
    types,
    features: {
      showPrice: true,
      showGeneration: true,
      showRegionalForm: true,
    },
  };

  return (
    <CardPricesProvider prices={prices}>
      <div className="space-y-3">
        <VariantSwitcher value={variant} onChange={setVariant} />

        {variant === "sheet" && <ToolbarSheet {...toolbarProps} />}
        {variant === "inline" && <ToolbarInline {...toolbarProps} />}
        {variant === "tiered" && <ToolbarTiered {...toolbarProps} />}

        <VirtualizedCardGrid cards={sorted} cols={cols} />
      </div>
    </CardPricesProvider>
  );
}

function VariantSwitcher({
  value,
  onChange,
}: {
  value: Variant;
  onChange: (next: Variant) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-lg border border-dashed border-border-strong/60 bg-panel/40 px-3 py-2">
      <span className="text-[10px] uppercase tracking-[0.18em] text-muted">
        Toolbar variant
      </span>
      <div
        role="radiogroup"
        aria-label="Toolbar variant"
        className="inline-flex h-7 items-center rounded-md bg-panel-2 p-0.5"
      >
        {(["sheet", "inline", "tiered"] as const).map((v) => {
          const active = value === v;
          return (
            <button
              key={v}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => onChange(v)}
              className={[
                "h-6 rounded px-2.5 text-[11px] font-medium transition outline-none",
                "focus-visible:ring-2 focus-visible:ring-accent/60",
                active
                  ? "bg-panel-3 text-text shadow-[inset_0_0_0_1px_var(--color-border)]"
                  : "text-muted hover:text-text",
              ].join(" ")}
            >
              {VARIANT_LABEL[v]}
            </button>
          );
        })}
      </div>
      <span className="text-[11px] text-muted">{VARIANT_HINT[value]}</span>
    </div>
  );
}
