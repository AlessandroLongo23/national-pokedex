import { redirect } from "next/navigation";
import { requireUserId } from "../_lib/current-user";
import { loadUserPreferences } from "../_lib/user-preferences";
import { MegasPageClient } from "./_components/MegasPageClient";

export default async function MegasPage() {
  const userId = await requireUserId();
  const prefs = await loadUserPreferences(userId);
  if (!prefs.treatMegasAsSeparate || prefs.megaPlacement !== "separate") {
    redirect("/pokedex");
  }
  return <MegasPageClient />;
}
