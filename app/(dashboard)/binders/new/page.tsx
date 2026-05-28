import { NotebookPen } from "lucide-react";
import { SETS, POKEDEX } from "@/lib/data";
import { listArtists, listNonPokemonNames } from "@/lib/data/binder-scope";
import { PageHeader } from "../../_components/PageHeader";
import { NewBinderFlow } from "../_components/NewBinderFlow";

export default async function NewBinderPage() {
  const [artists, cardNames] = await Promise.all([listArtists(), listNonPokemonNames()]);
  return (
    <div className="mx-auto max-w-[720px] space-y-6">
      <PageHeader
        icon={NotebookPen}
        title="New binder"
        subtitle="Pick a scope. The target card list is computed live — new releases will appear automatically."
      />
      <NewBinderFlow sets={SETS} pokedex={POKEDEX} artists={artists} cardNames={cardNames} />
    </div>
  );
}
