import Link from "next/link";
import { ArrowRight, LayoutDashboard } from "lucide-react";
import { PageHeader } from "../_components/PageHeader";
import { KpiCards } from "../_components/KpiCards";
import { CoverageByGen } from "../_components/CoverageByGen";
import { PublicHero } from "../_components/PublicHero";
import { getOptionalUser } from "../_lib/current-user";

export default async function DashboardPage() {
  const user = await getOptionalUser();
  if (!user) return <PublicHero />;

  return (
    <div className="mx-auto max-w-[1280px] space-y-6">
      <PageHeader
        icon={LayoutDashboard}
        title="Dashboard"
        subtitle="Your collection at a glance — National Pokédex coverage plus every binder you've built."
        actions={
          <Link
            href="/packs"
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3.5 py-2 text-sm font-semibold text-primary-foreground transition hover:opacity-90"
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
