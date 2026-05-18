"use server";

import { revalidatePath } from "next/cache";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requireUserId } from "./current-user";
import { PRICE_SOURCES, type PriceSource } from "@/lib/pricing/pokemontcg";

export async function updatePriceSource(source: PriceSource): Promise<void> {
  if (!PRICE_SOURCES.includes(source)) {
    throw new Error(`Invalid price source: ${source}`);
  }
  const userId = await requireUserId();
  const supabase = await getSupabaseServer();
  const { error } = await supabase
    .from("user_preferences")
    .upsert(
      { user_id: userId, price_source: source, updated_at: new Date().toISOString() },
      { onConflict: "user_id" },
    );
  if (error) throw new Error(`Failed to update price source: ${error.message}`);
  // Pricing surfaces are scattered across the app — purge them all rather
  // than enumerate. These pages are cheap to re-render.
  revalidatePath("/settings");
  revalidatePath("/portfolio");
  revalidatePath("/binders");
  revalidatePath("/binders/[id]", "page");
}
