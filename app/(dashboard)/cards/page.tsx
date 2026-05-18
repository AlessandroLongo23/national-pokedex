import { PageHeader } from "../_components/PageHeader";

export default function CardsPage() {
  return (
    <div className="mx-auto max-w-[1280px] space-y-6">
      <PageHeader eyebrow="Catalog" title="Cards" subtitle="Coming soon" />
      <div className="rounded-lg border border-border bg-panel p-6 text-sm text-muted">
        A flat browse view across every card in the catalog — filter by set, rarity,
        artist, type, dex number. Lands with the multi-binder rollout.
      </div>
    </div>
  );
}
