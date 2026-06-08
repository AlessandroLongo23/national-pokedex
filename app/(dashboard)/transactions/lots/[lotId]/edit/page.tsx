import { notFound } from "next/navigation";
import { getSupabaseServer } from "@/lib/supabase/server";
import { getAllCards, distinctArtists } from "@/lib/data/binder-scope";
import { isLedgerCurrency } from "@/lib/ledger/money";
import { requireUserId } from "../../../../_lib/current-user";
import { loadUserPreferences } from "../../../../_lib/user-preferences";
import { LogLotFlow } from "../../../../_components/LogLotFlow";

interface PageProps {
  params: Promise<{ lotId: string }>;
}

export default async function EditLotPage({ params }: PageProps) {
  const { lotId } = await params;
  const userId = await requireUserId();
  const supabase = await getSupabaseServer();

  const { data: lot, error } = await supabase
    .from("card_lots")
    .select("id, purchased_at, cost_cents, currency")
    .eq("id", lotId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!lot) notFound();

  const { data: contents, error: contentsErr } = await supabase
    .from("lot_contents")
    .select("card_id, quantity")
    .eq("lot_id", lot.id);
  if (contentsErr) throw new Error(contentsErr.message);

  const prefs = await loadUserPreferences(userId);
  const cards = await getAllCards();
  const artists = distinctArtists(cards);
  const typeSet = new Set<string>();
  for (const c of cards) for (const t of c.types) typeSet.add(t);
  const types = [...typeSet].sort((a, b) => a.localeCompare(b));

  const rawCurrency = lot.currency as string | null;
  const initialCurrency = isLedgerCurrency(rawCurrency) ? rawCurrency : null;

  return (
    <div className="mx-auto w-full max-w-[1280px] space-y-6">
      <LogLotFlow
        cards={cards}
        artists={artists}
        types={types}
        defaultCurrency={prefs.displayCurrency}
        editingLotId={lot.id as string}
        initialContents={(contents ?? []).map((r) => ({
          cardId: r.card_id as string,
          quantity: r.quantity as number,
        }))}
        initialPurchasedAt={lot.purchased_at as string}
        initialCostCents={(lot.cost_cents as number | null) ?? null}
        initialCurrency={initialCurrency}
      />
    </div>
  );
}
