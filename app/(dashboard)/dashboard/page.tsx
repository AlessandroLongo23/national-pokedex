import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { PageHeader } from "../_components/PageHeader";
import { KpiCards } from "../_components/KpiCards";
import { CoverageByGen } from "../_components/CoverageByGen";

export default function DashboardPage() {
  return (
    <div className="mx-auto max-w-[1280px] space-y-6">
      <PageHeader
        eyebrow="Overview"
        title="Dashboard"
        subtitle="Your collection at a glance — National Pokédex coverage plus every binder you've built."
        right={
          <Link
            href="/packs"
            className="inline-flex items-center gap-1.5 rounded-md bg-accent px-3.5 py-2 text-sm font-semibold text-bg transition hover:opacity-90"
          >
            Best pack to open
            <ArrowRight className="h-4 w-4" aria-hidden />
          </Link>
        }
      />
      <KpiCards />
      <CoverageByGen />
    </div>
  );
}
