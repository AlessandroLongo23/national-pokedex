"use client";

import { useEffect, useMemo, useState } from "react";
import type { CardEntry } from "@/lib/data/types";
import { sortCards, type CardSort } from "../../_lib/card-sort";
import { applyCardFilters } from "../../_lib/catalog-filter";
import { VirtualizedCardGrid } from "./VirtualizedCardGrid";
import {
  CardFiltersToolbar,
  emptyFilters,
  type CardsFilterState,
} from "../../_components/CardFiltersToolbar";

const SIZE_STORAGE_KEY = "cardgrid.size.cards-catalog";

function clampSize(n: number) {
  return Math.max(2, Math.min(10, Math.round(n)));
}

interface Props {
  cards: CardEntry[];
  artists: string[];
  types: string[];
}

export function CardsBrowser({ cards, artists, types }: Props) {
  const [filters, setFilters] = useState<CardsFilterState>(() => emptyFilters());
  const [sort, setSort] = useState<CardSort>("number");
  const [cols, setCols] = useState(5);
  const [mounted, setMounted] = useState(false);
  // Mobile keeps an independent density (own ".m" storage key + a lower
  // default of 3) so phones get tappable cells instead of inheriting the
  // desktop default of 5. Desktop reads the original key + default 5, so its
  // behaviour is byte-identical.
  const [isMobile, setIsMobile] = useState(false);
  const sizeKey = `${SIZE_STORAGE_KEY}${isMobile ? ".m" : ""}`;

  // Debounce search to avoid recomputing 20k filters on every keystroke.
  const [searchDebounced, setSearchDebounced] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setSearchDebounced(filters.search), 150);
    return () => clearTimeout(t);
  }, [filters.search]);

  // Persist cols across reloads, matching CardGrid's key scheme.
  useEffect(() => {
    const mobile =
      typeof window !== "undefined" &&
      window.matchMedia("(max-width: 767px)").matches;
    setIsMobile(mobile);
    const key = `${SIZE_STORAGE_KEY}${mobile ? ".m" : ""}`;
    const raw = window.localStorage.getItem(key);
    if (raw) {
      const n = parseInt(raw, 10);
      if (Number.isFinite(n)) setCols(clampSize(n));
    } else {
      setCols(mobile ? 3 : 5);
    }
    setMounted(true);
  }, []);
  useEffect(() => {
    if (mounted) window.localStorage.setItem(sizeKey, String(cols));
  }, [cols, sizeKey, mounted]);

  const filtered = useMemo(
    () => applyCardFilters(cards, filters, searchDebounced),
    [cards, filters, searchDebounced],
  );

  const sorted = useMemo(() => sortCards(filtered, sort), [filtered, sort]);

  // Document scroll: the page title scrolls away, the toolbar stays pinned, and
  // the grid virtualizes against the page's own scroll. Toolbar + grid share
  // this parent so the sticky toolbar holds for the whole list.
  return (
    <div className="space-y-3">
      <CardFiltersToolbar
        filters={filters}
        onFiltersChange={setFilters}
        sort={sort}
        onSortChange={setSort}
        cols={cols}
        onColsChange={setCols}
        resultCount={sorted.length}
        totalCount={cards.length}
        artists={artists}
        types={types}
      />
      <VirtualizedCardGrid cards={sorted} cols={cols} />
    </div>
  );
}
