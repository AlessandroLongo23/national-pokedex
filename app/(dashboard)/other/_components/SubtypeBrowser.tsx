import { SETS, loadOtherSubtype } from "@/lib/data";
import { OTHER_SUBTYPE_META, type OtherSubtype } from "@/lib/data/other-subtypes";
import type { CardEntry } from "@/lib/data/types";
import { PageHeader } from "../../_components/PageHeader";
import { SeriesBadge } from "../../_components/SeriesBadge";
import { SubtypeSetGrid } from "./SubtypeSetGrid";

export async function SubtypeBrowser({ subtype }: { subtype: OtherSubtype }) {
  const meta = OTHER_SUBTYPE_META[subtype];
  const cards = await loadOtherSubtype(subtype);

  const cardsBySetId = new Map<string, CardEntry[]>();
  for (const card of cards) {
    const arr = cardsBySetId.get(card.setId);
    if (arr) arr.push(card);
    else cardsBySetId.set(card.setId, [card]);
  }

  const sectionSets = SETS.filter((s) => cardsBySetId.has(s.id));

  return (
    <div className="mx-auto max-w-[1280px] space-y-6">
      <PageHeader
        eyebrow="Other cards"
        title={meta.label}
        subtitle={`${cards.length} cards across ${sectionSets.length} sets · ${meta.blurb}`}
      />
      {cards.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border bg-panel/50 p-8 text-center text-sm text-muted">
          No {meta.label.toLowerCase()} in the catalog.
        </div>
      ) : (
        <div className="space-y-8">
          {sectionSets.map((set) => {
            const setCards = cardsBySetId.get(set.id)!;
            return (
              <section key={set.id} className="space-y-3">
                <header className="flex flex-wrap items-baseline gap-3">
                  <SeriesBadge series={set.series} full />
                  <h2 className="text-lg font-semibold tracking-tight">{set.name}</h2>
                  <span className="text-xs text-muted nums">
                    {set.releaseDate} · {setCards.length}{" "}
                    {setCards.length === 1 ? "card" : "cards"}
                  </span>
                </header>
                <SubtypeSetGrid cards={setCards} />
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
