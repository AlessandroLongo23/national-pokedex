import { getSupabaseServer } from "@/lib/supabase/server";
import { PRICE_SOURCES, type PriceSource } from "@/lib/pricing/pokemontcg";
import { MEGA_PLACEMENTS, type MegaPlacement } from "./mega-prefs";

export { MEGA_PLACEMENTS, type MegaPlacement };

const DEFAULT_PRICE_SOURCE: PriceSource = "tcgplayer";
const DEFAULT_MEGA_PLACEMENT: MegaPlacement = "appended";

export interface UserPreferences {
  priceSource: PriceSource;
  treatMegasAsSeparate: boolean;
  megaPlacement: MegaPlacement;
}

export async function loadUserPreferences(userId: string): Promise<UserPreferences> {
  const supabase = await getSupabaseServer();
  const { data } = await supabase
    .from("user_preferences")
    .select("price_source, treat_megas_as_separate, mega_placement")
    .eq("user_id", userId)
    .maybeSingle();
  const rawPrice = data?.price_source as string | undefined;
  const priceSource = PRICE_SOURCES.includes(rawPrice as PriceSource)
    ? (rawPrice as PriceSource)
    : DEFAULT_PRICE_SOURCE;
  const rawPlacement = data?.mega_placement as string | undefined;
  const megaPlacement = MEGA_PLACEMENTS.includes(rawPlacement as MegaPlacement)
    ? (rawPlacement as MegaPlacement)
    : DEFAULT_MEGA_PLACEMENT;
  return {
    priceSource,
    treatMegasAsSeparate: data?.treat_megas_as_separate === true,
    megaPlacement,
  };
}
