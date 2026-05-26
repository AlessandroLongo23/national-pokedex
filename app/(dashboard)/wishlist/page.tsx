import { getSupabaseServer } from "@/lib/supabase/server";
import { loadSetCards } from "@/lib/data";
import type { CardEntry } from "@/lib/data/types";
import { fetchPricesForCards } from "@/lib/pricing/pokemontcg";
import { requireUserId } from "../_lib/current-user";
import { PageHeader } from "../_components/PageHeader";
import type { CardPriceRecord } from "../_lib/CardPricesContext";
import { WishlistClient } from "./WishlistClient";

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

  const priceMap = await fetchPricesForCards(cardIds);
  const priceRecord: CardPriceRecord = {};
  for (const id of cardIds) {
    const p = priceMap.get(id);
    if (p) priceRecord[id] = p;
  }

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
    <div className="mx-auto max-w-[1280px] space-y-6">
      <PageHeader
        eyebrow="Want list"
        title="Wishlist"
        subtitle={
          <>
            {cards.length} card{cards.length === 1 ? "" : "s"} marked as wanted. Click a card's Own
            button to move it from wishlist into your collection.
          </>
        }
      />
      <WishlistClient
        cards={cards}
        prices={priceRecord}
        types={types}
        artists={artists}
      />
    </div>
  );
}
