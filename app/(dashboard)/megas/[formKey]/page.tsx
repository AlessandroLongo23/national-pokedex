import { notFound } from "next/navigation";
import { CARD_INDEX_BY_MEGA, MEGAS, loadSetCards } from "@/lib/data";
import type { CardEntry } from "@/lib/data/types";
import { MegaHero } from "../../_components/MegaHero";
import { MegaPagination } from "../../_components/MegaPagination";
import { CardGrid } from "../../_components/CardGrid";
import { SetPageTitle } from "../../_components/SetPageTitle";

interface PageProps {
  params: Promise<{ formKey: string }>;
}

async function loadCardsForMega(formKey: string): Promise<CardEntry[]> {
  const ids = CARD_INDEX_BY_MEGA[formKey] ?? [];
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

export default async function MegaDetailPage({ params }: PageProps) {
  const { formKey } = await params;
  const form = MEGAS.find((m) => m.formKey === formKey);
  if (!form) notFound();

  const cards = await loadCardsForMega(form.formKey);

  return (
    <div className="mx-auto max-w-[1280px] space-y-6">
      <SetPageTitle
        title={form.displayName}
        detail={`#${String(form.baseDex).padStart(4, "0")}`}
      />
      <MegaPagination formKey={form.formKey} />
      <MegaHero form={form} />
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
          storageKey={`mega-${form.formKey}`}
          initialSort="number"
          hideDetailsLink
          emptyMessage={
            <>
              No <span className="font-semibold text-text">{form.displayName}</span> cards exist in
              the tracked sets.
            </>
          }
        />
      </div>
    </div>
  );
}
