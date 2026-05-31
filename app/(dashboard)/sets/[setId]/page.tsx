import { notFound } from "next/navigation";
import { SETS, BOOSTERS, loadSetCards } from "@/lib/data";
import { CardGrid } from "../../_components/CardGrid";
import { SetDetailHeader } from "../../_components/SetDetailHeader";
import { getOptionalUser } from "../../_lib/current-user";

interface PageProps {
  params: Promise<{ setId: string }>;
}

export default async function SetDetailPage({ params }: PageProps) {
  const { setId } = await params;
  const set = SETS.find((s) => s.id === setId);
  if (!set) notFound();

  let cards: import("@/lib/data/types").CardEntry[] = [];
  try {
    cards = await loadSetCards(set.id);
  } catch {
    cards = [];
  }

  const user = await getOptionalUser();

  return (
    <div className="mx-auto max-w-[1280px] space-y-6">
      <SetDetailHeader set={set} wrappers={BOOSTERS[set.id] ?? []} isLoggedIn={!!user} />
      <CardGrid cards={cards} storageKey={`set-${set.id}`} initialSort="number" />
    </div>
  );
}

export function generateStaticParams() {
  return SETS.map((s) => ({ setId: s.id }));
}
