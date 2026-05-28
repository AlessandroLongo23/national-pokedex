import { getSupabaseServer } from "@/lib/supabase/server";
import { PRICE_SOURCES, type PriceSource } from "@/lib/pricing/pokemontcg";
import { isCurrency, type Currency } from "@/lib/pricing/currencies";
import { MEGA_PLACEMENTS, type MegaPlacement } from "./mega-prefs";

export { MEGA_PLACEMENTS, type MegaPlacement };

const DEFAULT_PRICE_SOURCE: PriceSource = "tcgplayer";
const DEFAULT_MEGA_PLACEMENT: MegaPlacement = "appended";
// Matches the DB default in 20260528120000_multi_currency.sql so a fresh
// account sees the same currency the app shipped with.
const DEFAULT_DISPLAY_CURRENCY: Currency = "USD";

export interface UserPreferences {
  priceSource: PriceSource;
  treatMegasAsSeparate: boolean;
  megaPlacement: MegaPlacement;
  displayCurrency: Currency;
}

export async function loadUserPreferences(userId: string): Promise<UserPreferences> {
  const supabase = await getSupabaseServer();
  const { data } = await supabase
    .from("user_preferences")
    .select("price_source, treat_megas_as_separate, mega_placement, display_currency")
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
  const rawCurrency = data?.display_currency as string | undefined;
  const displayCurrency = isCurrency(rawCurrency) ? rawCurrency : DEFAULT_DISPLAY_CURRENCY;
  return {
    priceSource,
    treatMegasAsSeparate: data?.treat_megas_as_separate === true,
    megaPlacement,
    displayCurrency,
  };
}
