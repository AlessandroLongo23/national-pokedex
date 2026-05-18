import Link from "next/link";
import { PageHeader } from "../_components/PageHeader";
import { KpiCards } from "../_components/KpiCards";
import { CoverageByGen } from "../_components/CoverageByGen";

export default function DashboardPage() {
  return (
    <div className="mx-auto max-w-[1280px] space-y-6">
      <PageHeader
        eyebrow="Overview"
        title="Dashboard"
        subtitle="National Pokédex (#1–1025) — every English TCG set, your binder progress."
        right={
          <Link
            href="/packs"
            className="rounded-md bg-accent px-3.5 py-2 text-sm font-semibold text-bg transition hover:opacity-90"
          >
            Best pack to open →
          </Link>
        }
      />
      <KpiCards />
      <CoverageByGen />
    </div>
  );
}
