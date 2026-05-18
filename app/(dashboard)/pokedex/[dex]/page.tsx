import { notFound } from "next/navigation";
import { CARD_INDEX, SPECIES, loadSetCards } from "@/lib/data";
import type { CardEntry } from "@/lib/data/types";
import { SpeciesHero } from "../../_components/SpeciesHero";
import { CardGrid } from "../../_components/CardGrid";

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
      <SpeciesHero dex={n} />
      <div>
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="text-lg font-semibold">All cards</h2>
          <p className="text-xs text-muted nums">
            {cards.length} card{cards.length === 1 ? "" : "s"} across all sets
          </p>
        </div>
        <CardGrid
          cards={cards}
          storageKey={`pokedex-${n}`}
          initialSort="number"
          emptyMessage={
            <>
              No <span className="font-semibold text-text">{species.name}</span> cards exist in the
              tracked sets (Scarlet &amp; Violet · Mega Evolution).
              <br />
              <span className="text-xs">
                This Pokémon hasn’t been printed in this era yet — the binder slot will fill once a
                set includes it.
              </span>
            </>
          }
        />
      </div>
    </div>
  );
}
