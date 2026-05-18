import { PageHeader } from "../_components/PageHeader";

export default function BindersPage() {
  return (
    <div className="mx-auto max-w-[1280px] space-y-6">
      <PageHeader eyebrow="Workspace" title="Binders" subtitle="Coming soon" />
      <div className="rounded-lg border border-border bg-panel p-6 text-sm text-muted">
        Each binder gets its own dashboard — National Pokédex, master sets, by artist,
        by type, by motif. Multiple binders per account.
      </div>
    </div>
  );
}
