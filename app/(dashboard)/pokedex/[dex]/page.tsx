import { notFound } from "next/navigation";
import { CARD_INDEX, SPECIES, loadSetCards } from "@/lib/data";
import type { CardEntry } from "@/lib/data/types";
import { SpeciesHero } from "../../_components/SpeciesHero";
import { SpeciesPagination } from "../../_components/SpeciesPagination";
import { CardGrid } from "../../_components/CardGrid";
import { SetPageTitle } from "../../_components/SetPageTitle";

interface PageProps {
  params: Promise<{ dex: string }>;
}

async function loadCardsForDex(dex: number): Promise<CardEntry[]> {
  const ids = CARD_INDEX[dex] ?? [];
  if (ids.length === 0) return [];
  const idSet = new Set(ids);
  const setIds = new Set(ids.map((id) => id.replace(/-[^-]+$/, "")));
  const out: CardEntry[] = [];
  for (const setId of setIds) {
    try {
      const cards = await loadSetCards(setId);
      for (const c of cards) {
        if (idSet.has(c.id)) out.push(c);
      }
    } catch {
      // skip
    }
  }
  return out;
}

export default async function PokemonDetailPage({ params }: PageProps) {
  const { dex } = await params;
  const n = Number(dex);
  if (!Number.isInteger(n) || n < 1 || n > 1025) notFound();
  if (!SPECIES[n]) notFound();

  const cards = await loadCardsForDex(n);

  const species = SPECIES[n]!;

  return (
    <div className="mx-auto max-w-[1280px] space-y-6">
      <SetPageTitle
        title={species.name}
        detail={`#${String(n).padStart(4, "0")}`}
      />
      <SpeciesPagination dex={n} />
      <SpeciesHero dex={n} />
      <div>
        <div className="mb-3 flex items-end justify-between gap-4">
          <div className="space-y-1">
            <div className="eyebrow">Catalog</div>
            <h2 className="text-xl font-semibold tracking-tight">All cards</h2>
          </div>
          <p className="text-xs text-muted nums">
            {cards.length} card{cards.length === 1 ? "" : "s"} across all sets
          </p>
        </div>
        <CardGrid
          cards={cards}
          storageKey={`pokedex-${n}`}
          initialSort="number"
          hideDetailsLink
          emptyMessage={
            <>
              No <span className="font-semibold text-text">{species.name}</span> cards exist in the
              tracked sets.
              <br />
              <span className="text-xs">
                This Pokémon hasn’t been printed in any tracked set — the binder slot will fill once
                one does.
              </span>
            </>
          }
        />
      </div>
    </div>
  );
}
