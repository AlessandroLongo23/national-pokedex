import { getSupabaseServer } from "@/lib/supabase/server";
import { getLatestRatesFromEur } from "@/lib/pricing/exchange-rates";
import { getOptionalUser } from "./_lib/current-user";
import { Shell } from "./_components/Shell";
import { loadUserPreferences } from "./_lib/user-preferences";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const user = await getOptionalUser();

  if (!user) {
    const latestRatesFromEur = await getLatestRatesFromEur();
    return (
      <Shell
        userId=""
        email=""
        priceSource="tcgplayer"
        treatMegasAsSeparate={false}
        megaPlacement="appended"
        treatVariantsAsSeparate={false}
        variantPlacement="appended"
        displayCurrency="USD"
        latestRatesFromEur={latestRatesFromEur}
        initialOwned={[]}
        initialWishlist={[]}
        initialFavorites={[]}
        initialAvailability={[]}
      >
        {children}
      </Shell>
    );
  }

  const supabase = await getSupabaseServer();

  const [ownedRes, wishlistRes, favoritesRes, availabilityRes, prefs, latestRatesFromEur] =
    await Promise.all([
      supabase.from("owned_cards").select("card_id, quantity").eq("user_id", user.id),
      supabase.from("wishlist_cards").select("card_id").eq("user_id", user.id),
      supabase.from("user_favorites").select("card_id").eq("user_id", user.id),
      supabase.from("set_availability").select("set_id, available").eq("user_id", user.id),
      loadUserPreferences(user.id),
      getLatestRatesFromEur(),
    ]);

  if (ownedRes.error) throw new Error(`Failed to load owned: ${ownedRes.error.message}`);
  if (wishlistRes.error) throw new Error(`Failed to load wishlist: ${wishlistRes.error.message}`);
  if (favoritesRes.error) throw new Error(`Failed to load favorites: ${favoritesRes.error.message}`);
  if (availabilityRes.error)
    throw new Error(`Failed to load availability: ${availabilityRes.error.message}`);

  const initialOwned = (ownedRes.data ?? []).map((r) => ({
    cardId: r.card_id as string,
    quantity: (r.quantity as number | null) ?? 1,
  }));
  const initialWishlist = (wishlistRes.data ?? []).map((r) => r.card_id as string);
  const initialFavorites = (favoritesRes.data ?? []).map((r) => r.card_id as string);
  const initialAvailability = (availabilityRes.data ?? []).map((r) => ({
    setId: r.set_id as string,
    available: r.available as boolean,
  }));

  return (
    <Shell
      userId={user.id}
      email={user.email ?? ""}
      priceSource={prefs.priceSource}
      treatMegasAsSeparate={prefs.treatMegasAsSeparate}
      megaPlacement={prefs.megaPlacement}
      treatVariantsAsSeparate={prefs.treatVariantsAsSeparate}
      variantPlacement={prefs.variantPlacement}
      displayCurrency={prefs.displayCurrency}
      latestRatesFromEur={latestRatesFromEur}
      initialOwned={initialOwned}
      initialWishlist={initialWishlist}
      initialFavorites={initialFavorites}
      initialAvailability={initialAvailability}
    >
      {children}
    </Shell>
  );
}
