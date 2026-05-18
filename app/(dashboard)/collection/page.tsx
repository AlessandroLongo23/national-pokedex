import Link from "next/link";
import { PageHeader } from "../_components/PageHeader";

export default function CollectionPage() {
  return (
    <div className="mx-auto max-w-[1280px] space-y-6">
      <PageHeader eyebrow="Yours" title="Collection" subtitle="Coming soon" />
      <div className="rounded-lg border border-border bg-panel p-6 text-sm text-muted">
        A single view of everything you own — top-N rails by favorites, rarity, price.
        Wishlist will live here too.
      </div>
      <Link
        href="/wishlist"
        className="inline-flex items-center gap-2 rounded-md border border-border bg-panel-2 px-3.5 py-2 text-sm font-semibold text-text transition hover:bg-panel-3"
      >
        Open Wishlist →
      </Link>
    </div>
  );
}
