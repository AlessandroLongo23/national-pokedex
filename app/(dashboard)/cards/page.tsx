import { Suspense } from "react";
import { CreditCard } from "lucide-react";
import { getAllCards, distinctArtists } from "@/lib/data/binder-scope";
import { PageHeader } from "../_components/PageHeader";
import { CardsBrowser } from "./_components/CardsBrowser";

async function CardsBrowserLoader() {
  const cards = await getAllCards();
  const artists = distinctArtists(cards);
  const typeSet = new Set<string>();
  for (const c of cards) for (const t of c.types) typeSet.add(t);
  const types = [...typeSet].sort((a, b) => a.localeCompare(b));
  return <CardsBrowser cards={cards} artists={artists} types={types} />;
}

function GridSkeleton() {
  return (
    <div className="space-y-3">
      <div className="h-16 rounded-lg border border-border bg-panel/60" />
      <div className="grid gap-2" style={{ gridTemplateColumns: "repeat(5, minmax(0, 1fr))" }}>
        {Array.from({ length: 20 }).map((_, i) => (
          <div
            key={i}
            className="animate-pulse rounded-[6px] bg-panel-2"
            style={{ aspectRatio: "245 / 342" }}
          />
        ))}
      </div>
    </div>
  );
}

export default function CardsPage() {
  return (
    <div className="mx-auto w-full max-w-[1280px] space-y-6">
      <PageHeader
        icon={CreditCard}
        title="Cards"
        subtitle="Every card across your tracked sets. Filter by set, rarity, type, artist, or dex range."
      />
      <Suspense fallback={<GridSkeleton />}>
        <CardsBrowserLoader />
      </Suspense>
    </div>
  );
}
