"use client";

import { useState } from "react";
import { Globe2 } from "lucide-react";
import { VARIANTS } from "@/lib/data";
import { PageHeader } from "../../_components/PageHeader";
import { PokedexGrid } from "../../_components/PokedexGrid";
import { VariantCardPicker } from "../../_components/VariantCardPicker";
import { useOwnedCards } from "../../_lib/OwnedCardsContext";
import { useUser } from "../../_lib/UserContext";
import type { RegionalVariant } from "@/lib/data/types";

export function VariantsPageClient() {
  const [pickerVariant, setPickerVariant] = useState<RegionalVariant | null>(null);
  const { ownedVariantForms } = useOwnedCards();
  const { isGuest } = useUser();
  const total = VARIANTS.length;
  const owned = ownedVariantForms.size;
  const pct = total > 0 ? (owned / total) * 100 : 0;

  return (
    <div className="mx-auto w-full max-w-[1280px] space-y-6">
      <PageHeader
        icon={Globe2}
        title="Regional Variants"
        subtitle="Each Alolan, Galarian, Hisuian and Paldean form printed in the TCG, tracked separately from the base Pokédex."
        actions={
          isGuest ? null : (
            <div className="flex w-full flex-col gap-1.5 md:w-[260px]">
              <div className="flex items-baseline justify-between text-[11px]">
                <span className="uppercase tracking-wider text-muted">Variant progress</span>
                <span className="nums tabular-nums">
                  <span className="font-semibold text-variant">{owned}</span>
                  <span className="text-muted"> / {total}</span>
                  <span className="ml-1.5 text-muted">({pct.toFixed(1)}%)</span>
                </span>
              </div>
              <div className="relative h-1 overflow-hidden rounded-full bg-border">
                <div
                  className="absolute inset-y-0 left-0 rounded-full bg-variant transition-[width] duration-300 ease-out"
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
          )
        }
      />
      <PokedexGrid
        mode="variants"
        storageKey="variants"
        groupByGenDefault
        fitToViewport
        onVariantClick={(form) => setPickerVariant(form)}
      />
      <VariantCardPicker form={pickerVariant} onClose={() => setPickerVariant(null)} />
    </div>
  );
}
