import { PackagePlus } from "lucide-react";
import { PRICE_SOURCE_CURRENCY } from "@/lib/pricing/pokemontcg";
import { PageHeader } from "../../_components/PageHeader";
import { LogPackFlow } from "../../_components/LogPackFlow";
import { requireUserId } from "../../_lib/current-user";
import { loadUserPreferences } from "../../_lib/user-preferences";

interface PageProps {
  searchParams: Promise<{ set?: string }>;
}

export default async function NewPackPage({ searchParams }: PageProps) {
  const { set } = await searchParams;
  const userId = await requireUserId();
  const prefs = await loadUserPreferences(userId);
  const defaultCurrency = PRICE_SOURCE_CURRENCY[prefs.priceSource];
  return (
    <div className="mx-auto max-w-[1280px] space-y-6">
      <PageHeader icon={PackagePlus} title="Log a pack" />
      <LogPackFlow initialSetId={set} defaultCurrency={defaultCurrency} />
    </div>
  );
}
