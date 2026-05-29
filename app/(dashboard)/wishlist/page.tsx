import { Suspense } from "react";
import { Heart } from "lucide-react";
import { getSupabaseServer } from "@/lib/supabase/server";
import { loadSetCards } from "@/lib/data";
import type { CardEntry } from "@/lib/data/types";
import { requireUserId } from "../_lib/current-user";
import { PageHeader } from "../_components/PageHeader";
import {
  WishlistPricedShell,
  WishlistUnpricedShell,
} from "./WishlistPricedShell";

// A wishlist can easily span 10+ sets; on cold caches that's 10+ upstream
// fetches before the function can return. Lift the platform default (10s
// on Vercel Hobby) so the streamed price subtree gets room to resolve.
export const maxDuration = 60;

async function loadCardsByIds(ids: string[]): Promise<CardEntry[]> {
  if (ids.length === 0) return [];
  const idSet = new Set(ids);
  const setIds = new Set(ids.map((id) => id.replace(/-[^-]+$/, "")));
  const out: CardEntry[] = [];
  for (const setId of setIds) {
    try {
      const cards = await loadSetCards(setId);
      for (const c of cards) if (idSet.has(c.id)) out.push(c);
    } catch {
      // skip missing per-set file
    }
  }
  return out;
}

export default async function WishlistPage() {
  const userId = await requireUserId();
  const supabase = await getSupabaseServer();
  const { data, error } = await supabase
    .from("wishlist_cards")
    .select("card_id, added_at")
    .eq("user_id", userId)
    .order("added_at", { ascending: false });

  if (error) throw new Error(`Failed to load wishlist: ${error.message}`);
  const cardIds = (data ?? []).map((r) => r.card_id as string);
  const cards = await loadCardsByIds(cardIds);

  // Distinct types and artists across the wishlist for the toolbar's
  // multi-select / combo controls. Cheap on a ~500-card list.
  const typeSet = new Set<string>();
  const artistSet = new Set<string>();
  for (const c of cards) {
    for (const t of c.types) typeSet.add(t);
    if (c.artist) artistSet.add(c.artist);
  }
  const types = [...typeSet].sort((a, b) => a.localeCompare(b));
  const artists = [...artistSet].sort((a, b) => a.localeCompare(b));

  return (
    <div className="mx-auto flex w-full min-h-0 max-w-[1280px] flex-1 flex-col gap-6">
      <div className="shrink-0">
        <PageHeader
          icon={Heart}
          title="Wishlist"
          subtitle={`${cards.length} card${cards.length === 1 ? "" : "s"} marked as wanted. Click a card's Own button to move it from wishlist into your collection.`}
        />
      </div>
      <div className="flex min-h-0 flex-1 flex-col">
        <Suspense
          fallback={
            <WishlistUnpricedShell cards={cards} types={types} artists={artists} />
          }
        >
          <WishlistPricedShell
            cards={cards}
            cardIds={cardIds}
            types={types}
            artists={artists}
          />
        </Suspense>
      </div>
    </div>
  );
}
