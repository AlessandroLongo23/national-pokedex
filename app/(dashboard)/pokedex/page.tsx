"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { MEGAS, POKEDEX } from "@/lib/data";
import { PageHeader } from "../_components/PageHeader";
import { PokeballIcon } from "@/lib/components/ui/PokedexLogo";
import { PokedexGrid } from "../_components/PokedexGrid";
import { CardVariantPicker } from "../_components/CardVariantPicker";
import { MegaVariantPicker } from "../_components/MegaVariantPicker";
import { useOwnedCards } from "../_lib/OwnedCardsContext";
import { useUser } from "../_lib/UserContext";
import type { MegaForm } from "@/lib/data/types";

export default function PokedexPage() {
  const [pickerDex, setPickerDex] = useState<number | null>(null);
  const [pickerMega, setPickerMega] = useState<MegaForm | null>(null);
  const { ownedSpecies, ownedMegaForms } = useOwnedCards();
  const { isGuest, treatMegasAsSeparate, megaPlacement } = useUser();
  const showMegasInDex = treatMegasAsSeparate && megaPlacement !== "separate";
  const total = POKEDEX.length + (showMegasInDex ? MEGAS.length : 0);
  const owned = ownedSpecies.size + (showMegasInDex ? ownedMegaForms.size : 0);
  const pct = total > 0 ? (owned / total) * 100 : 0;

  return (
    <div className="mx-auto w-full max-w-[1280px] space-y-6">
      <PageHeader
        icon={PokeballIcon}
        title="Pokédex"
        subtitle={
          isGuest
            ? "Every National Pokédex entry, with the cards available across the tracked sets."
            : "Click a Pokémon to pick the card you own."
        }
        actions={
          isGuest ? (
            <Link
              href="/login"
              className="inline-flex items-center gap-1.5 rounded-md border border-border bg-panel-2 px-3.5 py-2 text-xs font-medium text-muted transition hover:border-accent hover:text-accent"
            >
              Sign in to track
              <ArrowRight className="h-3.5 w-3.5" aria-hidden />
            </Link>
          ) : (
            <div className="flex w-full flex-col gap-1.5 md:w-[260px]">
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
          )
        }
      />
      <PokedexGrid
        fitToViewport
        storageKey="full"
        groupByGenDefault={true}
        onCellClick={(dex) => setPickerDex(dex)}
        onMegaClick={(form) => setPickerMega(form)}
      />
      <CardVariantPicker dex={pickerDex} onClose={() => setPickerDex(null)} />
      <MegaVariantPicker form={pickerMega} onClose={() => setPickerMega(null)} />
    </div>
  );
}
