import { getSupabaseServer } from "@/lib/supabase/server";
import { PRICE_SOURCES, type PriceSource } from "@/lib/pricing/pokemontcg";

const DEFAULT_PRICE_SOURCE: PriceSource = "tcgplayer";

export interface UserPreferences {
  priceSource: PriceSource;
}

export async function loadUserPreferences(userId: string): Promise<UserPreferences> {
  const supabase = await getSupabaseServer();
  const { data } = await supabase
    .from("user_preferences")
    .select("price_source")
    .eq("user_id", userId)
    .maybeSingle();
  const raw = data?.price_source as string | undefined;
  const priceSource = PRICE_SOURCES.includes(raw as PriceSource)
    ? (raw as PriceSource)
    : DEFAULT_PRICE_SOURCE;
  return { priceSource };
}
