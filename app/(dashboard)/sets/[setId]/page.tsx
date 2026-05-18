import Link from "next/link";
import { notFound } from "next/navigation";
import { SETS, loadSetCards } from "@/lib/data";
import { PageHeader } from "../../_components/PageHeader";
import { CardGrid } from "../../_components/CardGrid";
import { SeriesBadge } from "../../_components/SeriesBadge";
import { SetAvailabilityToggle } from "../../_components/SetAvailabilityToggle";

interface PageProps {
  params: Promise<{ setId: string }>;
}

export default async function SetDetailPage({ params }: PageProps) {
  const { setId } = await params;
  const set = SETS.find((s) => s.id === setId);
  if (!set) notFound();

  let cards: import("@/lib/data/types").CardEntry[] = [];
  try {
    cards = await loadSetCards(set.id);
  } catch {
    cards = [];
  }

  return (
    <div className="mx-auto max-w-[1280px] space-y-6">
      <PageHeader
        eyebrow={<SeriesBadge series={set.series} full />}
        title={set.name}
        subtitle={
          <>
            Released {set.releaseDate} · {set.cardCount} Pokémon cards · {set.distinctPokemonCount}{" "}
            distinct Pokémon · {set.uniqueCount} unique to this set
          </>
        }
        right={
          <div className="flex flex-wrap items-center gap-3">
            <SetAvailabilityToggle setId={set.id} />
            <Link
              href={`/packs/new?set=${set.id}`}
              className="rounded-md bg-accent px-3.5 py-2 text-sm font-semibold text-bg transition hover:opacity-90"
            >
              Log a pack from this set
            </Link>
          </div>
        }
      />
      <CardGrid cards={cards} storageKey={`set-${set.id}`} initialSort="number" />
    </div>
  );
}

export function generateStaticParams() {
  return SETS.map((s) => ({ setId: s.id }));
}
