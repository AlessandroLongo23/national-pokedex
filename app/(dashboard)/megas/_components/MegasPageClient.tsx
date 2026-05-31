"use client";

import { Sparkles } from "lucide-react";
import { MEGAS } from "@/lib/data";
import { PageHeader } from "../../_components/PageHeader";
import { PokedexGrid } from "../../_components/PokedexGrid";
import { useOwnedCards } from "../../_lib/OwnedCardsContext";
import { useUser } from "../../_lib/UserContext";

export function MegasPageClient() {
  const { ownedMegaForms } = useOwnedCards();
  const { isGuest } = useUser();
  const total = MEGAS.length;
  const owned = ownedMegaForms.size;
  const pct = total > 0 ? (owned / total) * 100 : 0;

  return (
    <div className="mx-auto w-full max-w-[1280px] space-y-6">
      <PageHeader
        icon={Sparkles}
        title="Mega Evolutions"
        subtitle="Each Mega and Primal form printed in the TCG, tracked separately from the base Pokédex."
        actions={
          isGuest ? null : (
            <div className="flex w-[260px] flex-col gap-1.5">
              <div className="flex items-baseline justify-between text-[11px]">
                <span className="uppercase tracking-wider text-muted">Mega progress</span>
                <span className="nums tabular-nums">
                  <span className="font-semibold text-mega">{owned}</span>
                  <span className="text-muted"> / {total}</span>
                  <span className="ml-1.5 text-muted">({pct.toFixed(1)}%)</span>
                </span>
              </div>
              <div className="relative h-1 overflow-hidden rounded-full bg-border">
                <div
                  className="absolute inset-y-0 left-0 rounded-full bg-mega transition-[width] duration-300 ease-out"
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
          )
        }
      />
      <PokedexGrid mode="megas" storageKey="megas" groupByGenDefault={true} fitToViewport />
    </div>
  );
}
