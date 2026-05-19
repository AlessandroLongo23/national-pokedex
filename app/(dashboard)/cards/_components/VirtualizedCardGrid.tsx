"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useWindowVirtualizer } from "@tanstack/react-virtual";
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
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(0);
  const [scrollMargin, setScrollMargin] = useState(0);

  // Track container width + offset from the top of the document, so the
  // window-scroll virtualizer knows when rows are in view and so we can
  // compute pixel-precise row heights from the card aspect ratio.
  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const measure = () => {
      setContainerWidth(el.offsetWidth);
      const rect = el.getBoundingClientRect();
      setScrollMargin(rect.top + window.scrollY);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    window.addEventListener("resize", measure);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, []);

  const cardWidth =
    containerWidth > 0 ? (containerWidth - (cols - 1) * GAP_PX) / cols : 0;
  const rowHeight = useMemo(() => {
    if (cardWidth <= 0) return 320;
    return cardWidth * ASPECT + CAPTION_PX + GAP_PX;
  }, [cardWidth]);

  const rowCount = Math.ceil(cards.length / cols);

  const virtualizer = useWindowVirtualizer({
    count: rowCount,
    estimateSize: () => rowHeight,
    overscan: 4,
    scrollMargin,
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
        ref={containerRef}
        className="rounded-lg border border-dashed border-border bg-panel/50 p-12 text-center text-sm text-muted"
      >
        No cards match the current filters.
      </div>
    );
  }

  return (
    <div ref={containerRef} className="relative w-full" style={{ height: totalSize }}>
      {items.map((virtualRow) => {
        const start = virtualRow.index * cols;
        const rowCards = cards.slice(start, start + cols);
        return (
          <div
            key={virtualRow.key}
            className="absolute left-0 right-0 grid gap-2"
            style={{
              top: virtualRow.start - virtualizer.options.scrollMargin,
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
  );
}
