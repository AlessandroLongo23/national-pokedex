"use client";

import type { CardEntry } from "@/lib/data/types";
import { CardTile } from "../../../_components/CardTile";

interface Props {
  cards: CardEntry[];
  // Tile width in px. Strip rows are tighter than a grid; defaults to 132
  // (≈184px tall at the card 245/342 ratio) which scans well without
  // shouting next to the hero art.
  tileWidth?: number;
}

export function CardStrip({ cards, tileWidth = 132 }: Props) {
  return (
    <div className="-mx-1 overflow-x-auto px-1 pb-3">
      <div className="flex gap-3" style={{ minWidth: "min-content" }}>
        {cards.map((c) => (
          <div
            key={c.id}
            className="shrink-0"
            style={{ width: `${tileWidth}px` }}
          >
            <CardTile card={c} density="grid" hideActions />
          </div>
        ))}
      </div>
    </div>
  );
}
