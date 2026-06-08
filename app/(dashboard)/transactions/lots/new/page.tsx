import { Layers } from "lucide-react";
import { getAllCards, distinctArtists } from "@/lib/data/binder-scope";
import { PageHeader } from "../../../_components/PageHeader";
import { LogLotFlow } from "../../../_components/LogLotFlow";
import { requireUserId } from "../../../_lib/current-user";
import { loadUserPreferences } from "../../../_lib/user-preferences";

export default async function NewLotPage() {
  const userId = await requireUserId();
  const prefs = await loadUserPreferences(userId);
  const cards = await getAllCards();
  const artists = distinctArtists(cards);
  const typeSet = new Set<string>();
  for (const c of cards) for (const t of c.types) typeSet.add(t);
  const types = [...typeSet].sort((a, b) => a.localeCompare(b));

  return (
    <div className="mx-auto w-full max-w-[1280px] space-y-6">
      <PageHeader icon={Layers} title="Log a bulk lot" />
      <LogLotFlow
        cards={cards}
        artists={artists}
        types={types}
        defaultCurrency={prefs.displayCurrency}
      />
    </div>
  );
}
