"use client";

import { useEffect, useMemo, useState } from "react";
import { FolderOpen } from "lucide-react";
import type { CardEntry } from "@/lib/data/types";
import { pickPrice } from "@/lib/pricing/pokemontcg";
import { useOwnedCards } from "../_lib/OwnedCardsContext";
import { useFavorites } from "../_lib/FavoritesContext";
import { useUser } from "../_lib/UserContext";
import { applyCardFilters } from "../_lib/apply-card-filters";
import {
  CardPricesProvider,
  type CardPriceRecord,
} from "../_lib/CardPricesContext";
import { emptyFilters, type CardsFilterState } from "../_components/filters/types";
import { ToolbarTiered } from "../_components/filters/ToolbarTiered";
import type { CardView } from "../_components/filters/ToolbarShared";
import { PageHeader } from "../_components/PageHeader";
import { CardTile } from "../_components/CardTile";
import { sortCards, type CardSort, type SortDir } from "../_lib/card-sort";
import { CollectionRow } from "./CollectionRow";

const SIZE_STORAGE_KEY = "cardgrid.size.collection";
const VIEW_STORAGE_KEY = "collection.view";

// "Recently added" and "top by …" are reachable by picking the matching sort,
// so Date-added · Newest is the natural landing order.
const SORT_OPTIONS: CardSort[] = [
  "added",
  "rarity",
  "price",
  "pokemon",
  "number",
  "set",
];

function clampSize(n: number) {
  return Math.max(2, Math.min(10, Math.round(n)));
}

interface Props {
  cards: CardEntry[];
  /** card-id → acquired-at epoch ms, for the Date-added sort. */
  addedAt: Record<string, number>;
  prices: CardPriceRecord;
  types: string[];
  artists: string[];
}

export function CollectionClient({ cards, addedAt, prices, types, artists }: Props) {
  const { ownedCards } = useOwnedCards();
  const { favorites } = useFavorites();
  const { priceSource } = useUser();
  const [filters, setFilters] = useState<CardsFilterState>(() => emptyFilters());
  const [sort, setSort] = useState<CardSort>("added");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [cols, setCols] = useState(5);
  const [view, setView] = useState<CardView>("grid");
  const [mounted, setMounted] = useState(false);

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
    const storedView = window.localStorage.getItem(VIEW_STORAGE_KEY);
    if (storedView === "grid" || storedView === "list") setView(storedView);
    setMounted(true);
  }, []);
  useEffect(() => {
    if (mounted) window.localStorage.setItem(SIZE_STORAGE_KEY, String(cols));
  }, [cols, mounted]);
  useEffect(() => {
    if (mounted) window.localStorage.setItem(VIEW_STORAGE_KEY, view);
  }, [view, mounted]);

  const priceMap = useMemo(() => new Map(Object.entries(prices)), [prices]);

  // Owned cards only. Reads the optimistic owned set so removing a card's last
  // copy drops it from the view immediately.
  const visible = useMemo(
    () => cards.filter((c) => ownedCards.has(c.id)),
    [cards, ownedCards],
  );

  const filtered = useMemo(() => {
    const base = applyCardFilters(visible, filters, searchDebounced, priceMap, priceSource);
    return filters.favoritesOnly ? base.filter((c) => favorites.has(c.id)) : base;
  }, [visible, filters, searchDebounced, priceMap, priceSource, favorites]);

  const sorted = useMemo(
    () =>
      sortCards(filtered, sort, sortDir, {
        priceOf: (c) => pickPrice(priceMap.get(c.id), priceSource),
        addedAtOf: (c) => addedAt[c.id],
      }),
    [filtered, sort, sortDir, priceMap, priceSource, addedAt],
  );

  const count = visible.length;

  return (
    <CardPricesProvider prices={prices}>
      <PageHeader
        icon={FolderOpen}
        title="Collection"
        subtitle={`${count} card${count === 1 ? "" : "s"} you own. Sort by date added, rarity, or price; filter to favorites, sets, types, and more.`}
      />

      {count === 0 ? (
        <div className="mt-6 rounded-xl border border-dashed border-border bg-panel/50 p-12 text-center">
          <p className="text-sm text-muted">
            Nothing here yet — mark cards as owned from the Pokédex, a set page, or by logging a pack.
          </p>
        </div>
      ) : (
        // Toolbar + body share this one tall parent so the sticky toolbar stays
        // pinned while the page scrolls.
        <div className="mt-5">
          <ToolbarTiered
            filters={filters}
            onFiltersChange={setFilters}
            sort={sort}
            onSortChange={setSort}
            sortDir={sortDir}
            onSortDirChange={setSortDir}
            sortOptions={SORT_OPTIONS}
            cols={cols}
            onColsChange={setCols}
            resultCount={sorted.length}
            totalCount={count}
            artists={artists}
            types={types}
            features={{
              showPrice: true,
              showGeneration: true,
              showRegionalForm: true,
              showFavorites: true,
            }}
            view={view}
            onViewChange={setView}
          />

          <div className="mt-3">
            {sorted.length === 0 ? (
              <div className="rounded-lg border border-dashed border-border bg-panel/50 p-12 text-center text-sm text-muted">
                No cards match the current filters.
              </div>
            ) : view === "grid" ? (
              <div
                className="grid gap-2"
                style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
              >
                {sorted.map((card) => (
                  <CardTile key={card.id} card={card} density="grid" />
                ))}
              </div>
            ) : (
              <div className="flex flex-col gap-1.5">
                {sorted.map((card) => (
                  <CollectionRow key={card.id} card={card} />
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </CardPricesProvider>
  );
}
