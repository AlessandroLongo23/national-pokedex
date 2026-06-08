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

  // Debounce search to avoid recomputing 20k filters on every keystroke.
  const [searchDebounced, setSearchDebounced] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setSearchDebounced(filters.search), 150);
    return () => clearTimeout(t);
  }, [filters.search]);

  // Persist cols across reloads, matching CardGrid's key scheme.
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
