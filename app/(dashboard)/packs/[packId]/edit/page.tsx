import { notFound } from "next/navigation";
import { getSupabaseServer } from "@/lib/supabase/server";
import { SETS } from "@/lib/data";
import { isLedgerCurrency } from "@/lib/ledger/money";
import { requireUserId } from "../../../_lib/current-user";
import { loadUserPreferences } from "../../../_lib/user-preferences";
import { LogPackFlow } from "../../../_components/LogPackFlow";

interface PageProps {
  params: Promise<{ packId: string }>;
}

export default async function EditPackPage({ params }: PageProps) {
  const { packId } = await params;
  const userId = await requireUserId();
  const supabase = await getSupabaseServer();

  const { data: pack, error } = await supabase
    .from("packs_opened")
    .select("id, set_id, opened_at, cost_cents, currency")
    .eq("id", packId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!pack) notFound();

  const { data: contents, error: contentsErr } = await supabase
    .from("pack_contents")
    .select("card_id")
    .eq("pack_id", pack.id);
  if (contentsErr) throw new Error(contentsErr.message);

  const prefs = await loadUserPreferences(userId);
  const setId = pack.set_id as string;
  const set = SETS.find((s) => s.id === setId);
  const initialPickedIds = (contents ?? []).map((r) => r.card_id as string);
  const rawCurrency = pack.currency as string | null;
  const initialCurrency = isLedgerCurrency(rawCurrency) ? rawCurrency : null;

  return (
    <div className="mx-auto max-w-[1280px]">
      <LogPackFlow
        initialSetId={setId}
        defaultCurrency={prefs.displayCurrency}
        editingPackId={pack.id as string}
        editingSetName={set?.name ?? setId}
        editingSetSeries={set?.series}
        initialPickedIds={initialPickedIds}
        initialOpenedAt={pack.opened_at as string}
        initialCostCents={(pack.cost_cents as number | null) ?? null}
        initialCurrency={initialCurrency}
      />
    </div>
  );
}
