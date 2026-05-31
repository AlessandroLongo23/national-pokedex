"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { CardTile } from "../../_components/CardTile";
import { useScrollArea } from "@/lib/components/shell/ScrollAreaContext";
import type { CardEntry } from "@/lib/data/types";

// Tailwind `gap-2` = 0.5rem = 8px at the project's 16px root.
const GAP_PX = 8;
// CardTile caption block under the image:
// mt-1.5 (6px) + name line (~16px) + mt-0.5 (2px) + metadata row (~20px) ≈ 44px.
const CAPTION_PX = 44;
// TCG card aspect ratio — image height = width * 342/245.
const ASPECT = 342 / 245;

interface Props {
  cards: CardEntry[];
  cols: number;
}

export function VirtualizedCardGrid({ cards, cols }: Props) {
  // Document-scroll pages expose their scrolling panel via context. When it's
  // available the grid virtualizes against the *page* scroll — so the page
  // title and the sticky toolbar share one scroll region — and `scrollMargin`
  // accounts for everything stacked above the grid (top bar, header, toolbar).
  // Without context (embedded use), the grid owns a nested scroll container.
  const scrollArea = useScrollArea();
  const usePanel = scrollArea != null;

  const ownScrollRef = useRef<HTMLDivElement>(null);
  // The sizer/spacer element: measures the row width and (when populated) holds
  // the absolute-positioned virtual rows. A single stable node so the
  // ResizeObservers below never lose their target across empty↔populated.
  const listRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(0);
  const [scrollMargin, setScrollMargin] = useState(0);

  // Track the content width so we can compute pixel-precise row heights from
  // the card aspect ratio.
  useLayoutEffect(() => {
    const el = listRef.current;
    if (!el) return;
    const measure = () => setContainerWidth(el.offsetWidth);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // In panel mode, measure how far the grid sits below the panel's scroll
  // origin (top bar + page header + toolbar + gaps). Re-measure when the panel
  // resizes or when anything above the grid changes height (e.g. the toolbar's
  // "More filters" row expands, pushing the grid down).
  useLayoutEffect(() => {
    if (!usePanel) return;
    const scroller = scrollArea?.current;
    const list = listRef.current;
    if (!scroller || !list) return;
    const measure = () => {
      // Read fresh each call so the math survives any re-render of the sizer.
      const l = listRef.current;
      const s = scrollArea?.current;
      if (!l || !s) return;
      const top =
        l.getBoundingClientRect().top -
        s.getBoundingClientRect().top +
        s.scrollTop;
      setScrollMargin(Math.max(0, Math.round(top)));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(scroller);
    if (list.parentElement) ro.observe(list.parentElement);
    window.addEventListener("resize", measure);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [usePanel, scrollArea, cols]);

  const cardWidth =
    containerWidth > 0 ? (containerWidth - (cols - 1) * GAP_PX) / cols : 0;
  const rowHeight = useMemo(() => {
    if (cardWidth <= 0) return 320;
    return cardWidth * ASPECT + CAPTION_PX + GAP_PX;
  }, [cardWidth]);

  const rowCount = Math.ceil(cards.length / cols);

  const virtualizer = useVirtualizer({
    count: rowCount,
    getScrollElement: () =>
      usePanel ? (scrollArea?.current ?? null) : ownScrollRef.current,
    estimateSize: () => rowHeight,
    overscan: 4,
    scrollMargin: usePanel ? scrollMargin : 0,
  });

  // Re-measure rows when the computed row height, column count, or the grid's
  // offset within the page changes.
  useEffect(() => {
    virtualizer.measure();
  }, [rowHeight, cols, scrollMargin, virtualizer]);

  const totalSize = virtualizer.getTotalSize();
  const items = virtualizer.getVirtualItems();

  // A single stable sizer node (so the ResizeObservers never lose their
  // target). It carries the spacer height when populated, or the empty notice.
  const sizer = (
    <div
      ref={listRef}
      className="relative w-full"
      style={cards.length === 0 ? undefined : { height: totalSize }}
    >
      {cards.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border bg-panel/50 p-12 text-center text-sm text-muted">
          No cards match the current filters.
        </div>
      ) : (
        items.map((virtualRow) => {
          const start = virtualRow.index * cols;
          const rowCards = cards.slice(start, start + cols);
          return (
            <div
              key={virtualRow.key}
              className="absolute left-0 right-0 top-0 grid gap-2"
              style={{
                transform: `translateY(${virtualRow.start - scrollMargin}px)`,
                gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
              }}
            >
              {rowCards.map((card) => (
                <CardTile key={card.id} card={card} density="grid" />
              ))}
            </div>
          );
        })
      )}
    </div>
  );

  // Panel mode: render the sizer directly into the page's scroll flow.
  if (usePanel) return sizer;

  // Fallback: own a bounded scroll container (no AppShell scroll context).
  return (
    <div ref={ownScrollRef} className="min-h-0 flex-1 overflow-y-auto pr-1">
      {sizer}
    </div>
  );
}
