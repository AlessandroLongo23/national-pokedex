import { PageHeader } from "../../_components/PageHeader";
import { LogPackFlow } from "../../_components/LogPackFlow";

interface PageProps {
  searchParams: Promise<{ set?: string }>;
}

export default async function NewPackPage({ searchParams }: PageProps) {
  const { set } = await searchParams;
  return (
    <div className="mx-auto max-w-[1280px] space-y-6">
      <PageHeader
        eyebrow="New pack"
        title="Log a pack"
        subtitle="Click each Pokémon you pulled. New ones will be auto-marked as owned."
      />
      <LogPackFlow initialSetId={set} />
    </div>
  );
}
