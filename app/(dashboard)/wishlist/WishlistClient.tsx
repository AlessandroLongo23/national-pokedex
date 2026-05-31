"use client";

import { useEffect, useMemo, useState } from "react";
import { Heart } from "lucide-react";
import type { CardEntry } from "@/lib/data/types";
import { pickPrice } from "@/lib/pricing/pokemontcg";
import { useWishlist } from "../_lib/WishlistContext";
import { useOwnedCards } from "../_lib/OwnedCardsContext";
import { useUser } from "../_lib/UserContext";
import { selectWishlistCards } from "../_lib/wishlist-select";
import { applyCardFilters } from "../_lib/apply-card-filters";
import {
  CardPricesProvider,
  type CardPriceRecord,
} from "../_lib/CardPricesContext";
import {
  emptyFilters,
  type CardsFilterState,
} from "../_components/filters/types";
import { ToolbarTiered } from "../_components/filters/ToolbarTiered";
import type { CardView } from "../_components/filters/ToolbarShared";
import { PageHeader } from "../_components/PageHeader";
import { CardTile } from "../_components/CardTile";
import { sortCards, type CardSort, type SortDir } from "../_lib/card-sort";
import { WishlistRow } from "./WishlistRow";

const SIZE_STORAGE_KEY = "cardgrid.size.wishlist";
const VIEW_STORAGE_KEY = "wishlist.view";

function clampSize(n: number) {
  return Math.max(2, Math.min(10, Math.round(n)));
}

interface Props {
  cards: CardEntry[];
  prices: CardPriceRecord;
  types: string[];
  artists: string[];
}

export function WishlistClient({ cards, prices, types, artists }: Props) {
  const { wishlist } = useWishlist();
  const { ownedCards } = useOwnedCards();
  const { priceSource } = useUser();
  const [filters, setFilters] = useState<CardsFilterState>(() => emptyFilters());
  const [sort, setSort] = useState<CardSort>("pokemon");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
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

  // Owned cards never belong on the wishlist (a DB trigger prunes them); this
  // mirrors that optimistically so a card vanishes the instant it's marked owned.
  const visible = useMemo(
    () => selectWishlistCards(cards, wishlist, ownedCards),
    [cards, wishlist, ownedCards],
  );

  const filtered = useMemo(
    () => applyCardFilters(visible, filters, searchDebounced, priceMap, priceSource),
    [visible, filters, searchDebounced, priceMap, priceSource],
  );

  const sorted = useMemo(
    () =>
      sortCards(filtered, sort, sortDir, {
        priceOf: (c) => pickPrice(priceMap.get(c.id), priceSource),
      }),
    [filtered, sort, sortDir, priceMap, priceSource],
  );

  const count = visible.length;

  return (
    <CardPricesProvider prices={prices}>
      <PageHeader
        icon={Heart}
        title="Wishlist"
        subtitle={`${count} card${count === 1 ? "" : "s"} marked as wanted. Click a card's Own button to move it from wishlist into your collection.`}
      />

      {count === 0 ? (
        <div className="mt-6 rounded-xl border border-dashed border-border bg-panel/50 p-12 text-center">
          <p className="text-sm text-muted">
            Nothing here yet — wishlist a card from the Pokédex or any set page.
          </p>
        </div>
      ) : (
        // The toolbar and the card body MUST share this one tall parent: a
        // `sticky` element can only stay pinned while its containing block is
        // in view, so the body (which makes this wrapper tall) is what keeps
        // the toolbar fixed as the page scrolls.
        <div className="mt-5">
          <ToolbarTiered
            filters={filters}
            onFiltersChange={setFilters}
            sort={sort}
            onSortChange={setSort}
            sortDir={sortDir}
            onSortDirChange={setSortDir}
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
                style={{
                  gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
                }}
              >
                {sorted.map((card) => (
                  <CardTile key={card.id} card={card} density="grid" />
                ))}
              </div>
            ) : (
              <div className="flex flex-col gap-1.5">
                {sorted.map((card) => (
                  <WishlistRow key={card.id} card={card} />
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </CardPricesProvider>
  );
}
