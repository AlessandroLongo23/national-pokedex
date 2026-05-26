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
  CardFiltersToolbar,
  emptyFilters,
  type CardsFilterState,
} from "../_components/CardFiltersToolbar";
import { priceBucketOf, regionalFormOf } from "../_lib/card-filters";
import { sortCards, type CardSort } from "../_lib/card-sort";
import { VirtualizedCardGrid } from "../cards/_components/VirtualizedCardGrid";

const SIZE_STORAGE_KEY = "cardgrid.size.wishlist";

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

// Wishlist server-rendered data + client live state need to reconcile. The
// server fetched the user's wishlist row IDs, then loaded the card data for
// those IDs. The context keeps the wishlist live across realtime updates. We
// only render cards whose IDs are still in the live wishlist set.
export function WishlistClient({ cards, prices, types, artists }: Props) {
  const { wishlist } = useWishlist();
  const { priceSource } = useUser();
  const [filters, setFilters] = useState<CardsFilterState>(() => emptyFilters());
  const [sort, setSort] = useState<CardSort>("pokemon");
  const [cols, setCols] = useState(5);
  const [mounted, setMounted] = useState(false);

  // Debounce search to avoid recomputing filters on every keystroke.
  const [searchDebounced, setSearchDebounced] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setSearchDebounced(filters.search), 150);
    return () => clearTimeout(t);
  }, [filters.search]);

  useEffect(() => {
    const raw = window.localStorage.getItem(SIZE_STORAGE_KEY);
    if (raw) {
      const n = parseInt(raw, 10);
      if (Number.isFinite(n)) setCols(clampSize(n));
    }
    setMounted(true);
  }, []);
  useEffect(() => {
    if (mounted) window.localStorage.setItem(SIZE_STORAGE_KEY, String(cols));
  }, [cols, mounted]);

  const priceMap = useMemo(() => new Map(Object.entries(prices)), [prices]);

  // Reconcile against live wishlist set first, then run user filters.
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

  return (
    <CardPricesProvider prices={prices}>
      <div className="space-y-3">
        <CardFiltersToolbar
          filters={filters}
          onFiltersChange={setFilters}
          sort={sort}
          onSortChange={setSort}
          cols={cols}
          onColsChange={setCols}
          resultCount={sorted.length}
          totalCount={visible.length}
          artists={artists}
          types={types}
          features={{
            showPrice: true,
            showGeneration: true,
            showRegionalForm: true,
          }}
        />
        <VirtualizedCardGrid cards={sorted} cols={cols} />
      </div>
    </CardPricesProvider>
  );
}
