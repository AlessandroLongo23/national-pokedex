import { Suspense } from "react";
import Link from "next/link";
import { Notebook } from "lucide-react";
import { PageHeader } from "../_components/PageHeader";
import { requireUserId } from "../_lib/current-user";
import { loadUserPreferences } from "../_lib/user-preferences";
import { getSupabaseServer } from "@/lib/supabase/server";
import { getAllCards, type ScopeType, type ScopeParams } from "@/lib/data/binder-scope";
import { getLatestRatesFromEur } from "@/lib/pricing/exchange-rates";
import type { DisplayConversion } from "@/lib/pricing/pokemontcg";
import {
  BinderListPricedGrid,
  BinderListUnpricedGrid,
} from "./_components/BinderListPricedGrid";

// Many binders × many sets = many upstream price fetches on cold caches.
// Lift the platform default (10s on Vercel Hobby) so the streamed grid has
// room to resolve without truncating the response.
export const maxDuration = 60;

interface BinderRow {
  id: string;
  name: string;
  scope_type: ScopeType;
  scope_params: ScopeParams | Record<string, unknown>;
}

export default async function BindersPage() {
  const userId = await requireUserId();
  const supabase = await getSupabaseServer();
  const prefs = await loadUserPreferences(userId);

  const [bindersResult, ownedResult, latestRatesFromEur] = await Promise.all([
    supabase
      .from("binders")
      .select("id, name, scope_type, scope_params")
      .eq("user_id", userId)
      .order("created_at", { ascending: false }),
    supabase.from("owned_cards").select("card_id, quantity").eq("user_id", userId),
    getLatestRatesFromEur(),
  ]);
  const display: DisplayConversion = {
    displayCurrency: prefs.displayCurrency,
    latestRatesFromEur,
  };

  const binders = (bindersResult.data ?? []) as BinderRow[];
  const ownedQuantities = new Map<string, number>();
  for (const r of ownedResult.data ?? []) {
    ownedQuantities.set(r.card_id as string, (r.quantity as number | null) ?? 1);
  }

  const customBinderIds = binders
    .filter((b) => b.scope_type === "custom")
    .map((b) => b.id);
  const customCardsByBinder = new Map<string, string[]>();
  if (customBinderIds.length > 0) {
    const { data: customRows } = await supabase
      .from("binder_cards")
      .select("binder_id, card_id")
      .in("binder_id", customBinderIds);
    for (const row of customRows ?? []) {
      const bid = row.binder_id as string;
      const list = customCardsByBinder.get(bid) ?? [];
      list.push(row.card_id as string);
      customCardsByBinder.set(bid, list);
    }
  }

  const allCards = binders.length > 0 ? await getAllCards() : [];

  return (
    <div className="mx-auto flex w-full min-h-0 max-w-[1280px] flex-1 flex-col gap-6">
      <div className="shrink-0">
      <PageHeader
        icon={Notebook}
        title="Binders"
        subtitle="Track any slice of the TCG — a master set, an artist, a Pokémon, a hand-picked list."
        actions={
          <Link
            href="/binders/new"
            className="rounded-md border border-border bg-card px-3 py-1.5 text-sm font-medium transition hover:border-border-strong"
          >
            + New binder
          </Link>
        }
      />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto pr-1">
      {binders.length === 0 ? (
        <div className="rounded-lg border border-border bg-panel p-8 text-sm text-muted">
          <p className="text-base text-text">No binders yet.</p>
          <p className="mt-2">
            Create one to start tracking — a master set, every card by an artist, every card of
            a Pokémon, every #1 across sets, or a hand-picked list.
          </p>
          <Link
            href="/binders/new"
            className="mt-4 inline-block rounded-md border border-border bg-panel-2 px-3 py-1.5 text-sm font-medium text-text transition hover:border-border-strong"
          >
            Create your first binder
          </Link>
        </div>
      ) : (
        <Suspense
          fallback={
            <BinderListUnpricedGrid
              binders={binders}
              customCardsByBinder={customCardsByBinder}
              ownedQuantities={ownedQuantities}
              treatMegasAsSeparate={prefs.treatMegasAsSeparate}
              megaPlacement={prefs.megaPlacement}
              treatVariantsAsSeparate={prefs.treatVariantsAsSeparate}
              variantPlacement={prefs.variantPlacement}
              priceSource={prefs.priceSource}
              display={display}
              allCards={allCards}
            />
          }
        >
          <BinderListPricedGrid
            binders={binders}
            customCardsByBinder={customCardsByBinder}
            ownedQuantities={ownedQuantities}
            treatMegasAsSeparate={prefs.treatMegasAsSeparate}
            megaPlacement={prefs.megaPlacement}
            treatVariantsAsSeparate={prefs.treatVariantsAsSeparate}
            variantPlacement={prefs.variantPlacement}
            priceSource={prefs.priceSource}
            display={display}
          />
        </Suspense>
      )}
      </div>
    </div>
  );
}
