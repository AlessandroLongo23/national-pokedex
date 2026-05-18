import { getSupabaseServer } from "@/lib/supabase/server";
import { DEV_USER_ID } from "./_lib/dev";
import { Shell } from "./_components/Shell";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = await getSupabaseServer();

  const [ownedRes, wishlistRes, availabilityRes] = await Promise.all([
    supabase.from("owned_cards").select("card_id").eq("user_id", DEV_USER_ID),
    supabase.from("wishlist_cards").select("card_id").eq("user_id", DEV_USER_ID),
    supabase.from("set_availability").select("set_id, available").eq("user_id", DEV_USER_ID),
  ]);

  if (ownedRes.error) throw new Error(`Failed to load owned: ${ownedRes.error.message}`);
  if (wishlistRes.error) throw new Error(`Failed to load wishlist: ${wishlistRes.error.message}`);
  if (availabilityRes.error)
    throw new Error(`Failed to load availability: ${availabilityRes.error.message}`);

  const initialOwned = (ownedRes.data ?? []).map((r) => r.card_id as string);
  const initialWishlist = (wishlistRes.data ?? []).map((r) => r.card_id as string);
  const initialAvailability = (availabilityRes.data ?? []).map((r) => ({
    setId: r.set_id as string,
    available: r.available as boolean,
  }));

  return (
    <Shell
      initialOwned={initialOwned}
      initialWishlist={initialWishlist}
      initialAvailability={initialAvailability}
    >
      {children}
    </Shell>
  );
}
