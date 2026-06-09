import { redirect } from "next/navigation";
import { requireUserId } from "../_lib/current-user";
import { loadUserPreferences } from "../_lib/user-preferences";
import { VariantsPageClient } from "./_components/VariantsPageClient";

export default async function VariantsPage() {
  const userId = await requireUserId();
  const prefs = await loadUserPreferences(userId);
  if (!prefs.treatVariantsAsSeparate || prefs.variantPlacement !== "separate") {
    redirect("/pokedex");
  }
  return <VariantsPageClient />;
}
