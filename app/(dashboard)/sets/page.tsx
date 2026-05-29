import { Layers } from "lucide-react";
import { SETS } from "@/lib/data";
import { getSupabaseServer } from "@/lib/supabase/server";
import { getOptionalUser } from "../_lib/current-user";
import { PageHeader } from "../_components/PageHeader";
import { SetsTable } from "../_components/SetsTable";

async function loadPackCountsBySet(): Promise<Record<string, number>> {
  const user = await getOptionalUser();
  if (!user) return {};
  const supabase = await getSupabaseServer();
  const { data, error } = await supabase
    .from("packs_opened")
    .select("set_id")
    .eq("user_id", user.id);
  if (error || !data) return {};
  const counts: Record<string, number> = {};
  for (const row of data as { set_id: string }[]) {
    counts[row.set_id] = (counts[row.set_id] ?? 0) + 1;
  }
  return counts;
}

export default async function SetsPage() {
  const packCountsBySet = await loadPackCountsBySet();
  return (
    <div className="mx-auto max-w-[1280px] space-y-6">
      <PageHeader
        icon={Layers}
        title="Sets"
        subtitle={`${SETS.length} sets in the catalog · click a set to view its cards and log a pack`}
      />
      <SetsTable packCountsBySet={packCountsBySet} />
    </div>
  );
}
