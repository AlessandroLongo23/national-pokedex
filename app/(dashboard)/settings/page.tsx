import { PageHeader } from "../_components/PageHeader";

export default function SettingsPage() {
  return (
    <>
      <PageHeader eyebrow="Account" title="Settings" subtitle="Coming soon" />
      <div className="rounded-lg border border-border bg-panel p-6 text-sm text-muted">
        Nothing to configure yet. Real settings land alongside accounts and
        multi-binder support.
      </div>
    </>
  );
}
