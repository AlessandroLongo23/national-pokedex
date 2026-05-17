import { redirect } from "next/navigation";
import { getSupabaseServer } from "@/lib/supabase/server";
import { DashboardClient } from "./DashboardClient";

export default async function DashboardPage() {
  const supabase = await getSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: rows, error } = await supabase
    .from("owned_pokemon")
    .select("dex_number")
    .eq("user_id", user.id);

  if (error) throw new Error(`Failed to load owned: ${error.message}`);
  const owned = (rows ?? []).map((r) => r.dex_number as number);

  return <DashboardClient initialOwned={owned} />;
}
