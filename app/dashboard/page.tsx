import { getSupabaseServer } from "@/lib/supabase/server";
import { DashboardClient } from "./DashboardClient";
import { DEV_USER_ID } from "./dev";

export default async function DashboardPage() {
  const supabase = await getSupabaseServer();

  const { data: rows, error } = await supabase
    .from("owned_pokemon")
    .select("dex_number")
    .eq("user_id", DEV_USER_ID);

  if (error) throw new Error(`Failed to load owned: ${error.message}`);
  const owned = (rows ?? []).map((r) => r.dex_number as number);

  return <DashboardClient initialOwned={owned} />;
}
