"use client";

import type { CardEntry } from "@/lib/data/types";
import { CardTile } from "../../_components/CardTile";

export function SubtypeSetGrid({ cards }: { cards: CardEntry[] }) {
  return (
    <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6">
      {cards.map((c) => (
        <CardTile key={c.id} card={c} density="grid" />
      ))}
    </div>
  );
}
