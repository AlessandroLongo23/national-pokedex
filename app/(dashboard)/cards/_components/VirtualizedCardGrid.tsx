"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { CardTile } from "../../_components/CardTile";
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
  // The grid owns its own scroll container so it fits the viewport-bounded
  // shell (the document itself does not scroll). `scrollRef` is the scroll
  // element the virtualizer watches; `sizeRef` measures the row content width.
  const scrollRef = useRef<HTMLDivElement>(null);
  const sizeRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(0);

  // Track the content width so we can compute pixel-precise row heights from
  // the card aspect ratio. ResizeObserver on the inner sizing div reflects the
  // width available to a row (inside any scroll-container padding).
  useLayoutEffect(() => {
    const el = sizeRef.current;
    if (!el) return;
    const measure = () => setContainerWidth(el.offsetWidth);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const cardWidth =
    containerWidth > 0 ? (containerWidth - (cols - 1) * GAP_PX) / cols : 0;
  const rowHeight = useMemo(() => {
    if (cardWidth <= 0) return 320;
    return cardWidth * ASPECT + CAPTION_PX + GAP_PX;
  }, [cardWidth]);

  const rowCount = Math.ceil(cards.length / cols);

  const virtualizer = useVirtualizer({
    count: rowCount,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => rowHeight,
    overscan: 4,
  });

  // Re-measure rows when the computed row height changes (resize, col count).
  useEffect(() => {
    virtualizer.measure();
  }, [rowHeight, cols, virtualizer]);

  const totalSize = virtualizer.getTotalSize();
  const items = virtualizer.getVirtualItems();

  if (cards.length === 0) {
    return (
      <div
        ref={scrollRef}
        className="min-h-0 flex-1 overflow-y-auto"
      >
        <div
          ref={sizeRef}
          className="rounded-lg border border-dashed border-border bg-panel/50 p-12 text-center text-sm text-muted"
        >
          No cards match the current filters.
        </div>
      </div>
    );
  }

  return (
    <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto pr-1">
      <div ref={sizeRef} className="relative w-full" style={{ height: totalSize }}>
        {items.map((virtualRow) => {
          const start = virtualRow.index * cols;
          const rowCards = cards.slice(start, start + cols);
          return (
            <div
              key={virtualRow.key}
              className="absolute left-0 right-0 grid gap-2"
              style={{
                top: virtualRow.start,
                gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
              }}
            >
              {rowCards.map((card) => (
                <CardTile key={card.id} card={card} density="grid" />
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}
