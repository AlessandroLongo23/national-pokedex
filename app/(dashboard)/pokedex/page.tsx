"use client";

import { useState } from "react";
import { POKEDEX } from "@/lib/data";
import { PageHeader } from "../_components/PageHeader";
import { PokedexGrid } from "../_components/PokedexGrid";
import { CardVariantPicker } from "../_components/CardVariantPicker";
import { useOwnedCards } from "../_lib/OwnedCardsContext";

export default function PokedexPage() {
  const [pickerDex, setPickerDex] = useState<number | null>(null);
  const { ownedSpecies } = useOwnedCards();
  const total = POKEDEX.length;
  const owned = ownedSpecies.size;
  const pct = total > 0 ? (owned / total) * 100 : 0;

  return (
    <div className="mx-auto max-w-[1280px] space-y-6">
      <PageHeader
        eyebrow="Catalog"
        title="Pokédex"
        subtitle="Click a Pokémon to pick the card you own."
        right={
          <div className="flex w-[260px] flex-col gap-1.5">
            <div className="flex items-baseline justify-between text-[11px]">
              <span className="uppercase tracking-wider text-muted">Binder progress</span>
              <span className="nums tabular-nums">
                <span className="font-semibold text-owned">{owned}</span>
                <span className="text-muted"> / {total}</span>
                <span className="ml-1.5 text-muted">({pct.toFixed(1)}%)</span>
              </span>
            </div>
            <div className="relative h-1 overflow-hidden rounded-full bg-border">
              <div
                className="absolute inset-y-0 left-0 rounded-full bg-owned transition-[width] duration-300 ease-out"
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>
        }
      />
      <PokedexGrid
        storageKey="full"
        groupByGenDefault={true}
        onCellClick={(dex) => setPickerDex(dex)}
      />
      <CardVariantPicker dex={pickerDex} onClose={() => setPickerDex(null)} />
    </div>
  );
}
