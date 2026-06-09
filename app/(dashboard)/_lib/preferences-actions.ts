"use server";

import { revalidatePath } from "next/cache";
import { getSupabaseServer } from "@/lib/supabase/server";
import { requireUserId } from "./current-user";
import { PRICE_SOURCES, type PriceSource } from "@/lib/pricing/pokemontcg";
import { isCurrency, type Currency } from "@/lib/pricing/currencies";
import { MEGA_PLACEMENTS, type MegaPlacement } from "./user-preferences";
import { VARIANT_PLACEMENTS, type VariantPlacement } from "./user-preferences";

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

export async function updateMegaSettings(
  treatAsSeparate: boolean,
  placement: MegaPlacement,
): Promise<void> {
  if (!MEGA_PLACEMENTS.includes(placement)) {
    throw new Error(`Invalid mega placement: ${placement}`);
  }
  const userId = await requireUserId();
  const supabase = await getSupabaseServer();
  const { error } = await supabase.from("user_preferences").upsert(
    {
      user_id: userId,
      treat_megas_as_separate: treatAsSeparate,
      mega_placement: placement,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" },
  );
  if (error) throw new Error(`Failed to update mega settings: ${error.message}`);
  // The toggle affects every page that derives coverage from owned cards.
  revalidatePath("/settings");
  revalidatePath("/pokedex");
  revalidatePath("/megas");
  revalidatePath("/binders");
  revalidatePath("/binders/[id]", "page");
  revalidatePath("/cards");
}

export async function updateVariantSettings(
  treatAsSeparate: boolean,
  placement: VariantPlacement,
): Promise<void> {
  if (!VARIANT_PLACEMENTS.includes(placement)) {
    throw new Error(`Invalid variant placement: ${placement}`);
  }
  const userId = await requireUserId();
  const supabase = await getSupabaseServer();
  const { error } = await supabase.from("user_preferences").upsert(
    {
      user_id: userId,
      treat_variants_as_separate: treatAsSeparate,
      variant_placement: placement,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" },
  );
  if (error) throw new Error(`Failed to update variant settings: ${error.message}`);
  // The toggle affects every page that derives coverage from owned cards.
  revalidatePath("/settings");
  revalidatePath("/pokedex");
  revalidatePath("/variants");
  revalidatePath("/binders");
  revalidatePath("/binders/[id]", "page");
  revalidatePath("/cards");
}

export async function updateDisplayCurrency(currency: Currency): Promise<void> {
  if (!isCurrency(currency)) {
    throw new Error(`Invalid currency: ${currency}`);
  }
  const userId = await requireUserId();
  const supabase = await getSupabaseServer();
  const { error } = await supabase.from("user_preferences").upsert(
    { user_id: userId, display_currency: currency, updated_at: new Date().toISOString() },
    { onConflict: "user_id" },
  );
  if (error) throw new Error(`Failed to update display currency: ${error.message}`);
  // Every page that shows a price reads from this preference.
  revalidatePath("/settings");
  revalidatePath("/transactions");
  revalidatePath("/portfolio");
  revalidatePath("/packs");
  revalidatePath("/binders");
  revalidatePath("/binders/[id]", "page");
  revalidatePath("/cards/[cardId]", "page");
  revalidatePath("/wishlist");
}
