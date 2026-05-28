import Link from "next/link";
import { MoreHorizontal } from "lucide-react";
import { loadOtherCardsBySubtype } from "@/lib/data";
import {
  OTHER_SUBTYPES,
  OTHER_SUBTYPE_META,
  type OtherSubtype,
} from "@/lib/data/other-subtypes";
import { PageHeader } from "../_components/PageHeader";

export default async function OtherCardsHubPage() {
  const all = await loadOtherCardsBySubtype();
  const counts: Record<OtherSubtype, number> = {
    items: all.items.length,
    supporters: all.supporters.length,
    stadiums: all.stadiums.length,
    tools: all.tools.length,
    energies: all.energies.length,
  };

  return (
    <div className="mx-auto max-w-[1280px] space-y-6">
      <PageHeader
        icon={MoreHorizontal}
        title="Other cards"
        subtitle="Trainers and Energies — every set you can find them in. Less popular than Pokémon, but you still need them to complete a master set."
      />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {OTHER_SUBTYPES.map((slug) => {
          const meta = OTHER_SUBTYPE_META[slug];
          return (
            <Link
              key={slug}
              href={`/other/${slug}`}
              className="group flex flex-col gap-1.5 rounded-lg border border-border bg-panel p-4 transition hover:border-accent/60 hover:bg-panel-2"
            >
              <div className="flex items-baseline justify-between gap-2">
                <h2 className="text-base font-semibold tracking-tight group-hover:text-accent">
                  {meta.label}
                </h2>
                <span className="text-xs text-muted nums">{counts[slug]} cards</span>
              </div>
              <p className="text-sm text-muted">{meta.blurb}</p>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
