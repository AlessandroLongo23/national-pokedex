import { Suspense } from "react";
import { requireUserId } from "../_lib/current-user";
import { getSupabaseServer } from "@/lib/supabase/server";
import { getAllCards } from "@/lib/data/binder-scope";
import type { CardEntry } from "@/lib/data/types";
import {
  CollectionPricedShell,
  CollectionUnpricedShell,
} from "./CollectionPricedShell";

// Pricing a large collection means many upstream per-set fetches on a cold
// cache; lift the platform default so the streamed price subtree can resolve.
export const maxDuration = 60;

export default async function CollectionPage() {
  const userId = await requireUserId();
  const supabase = await getSupabaseServer();

  const [ownedRes, allCards] = await Promise.all([
    supabase
      .from("owned_cards")
      .select("card_id, acquired_at")
      .eq("user_id", userId),
    getAllCards(),
  ]);
  if (ownedRes.error) {
    throw new Error(`Failed to load collection: ${ownedRes.error.message}`);
  }

  const cardsById = new Map<string, CardEntry>(allCards.map((c) => [c.id, c]));
  const cards: CardEntry[] = [];
  const addedAt: Record<string, number> = {};
  for (const row of (ownedRes.data ?? []) as {
    card_id: string;
    acquired_at: string | null;
  }[]) {
    const c = cardsById.get(row.card_id);
    if (!c) continue;
    cards.push(c);
    if (row.acquired_at) addedAt[c.id] = Date.parse(row.acquired_at);
  }
  const cardIds = cards.map((c) => c.id);

  // Distinct types and artists across the collection for the toolbar controls.
  const typeSet = new Set<string>();
  const artistSet = new Set<string>();
  for (const c of cards) {
    for (const t of c.types) typeSet.add(t);
    if (c.artist) artistSet.add(c.artist);
  }
  const types = [...typeSet].sort((a, b) => a.localeCompare(b));
  const artists = [...artistSet].sort((a, b) => a.localeCompare(b));

  return (
    <div className="mx-auto w-full max-w-[1280px]">
      <Suspense
        fallback={
          <CollectionUnpricedShell
            cards={cards}
            addedAt={addedAt}
            types={types}
            artists={artists}
          />
        }
      >
        <CollectionPricedShell
          cards={cards}
          cardIds={cardIds}
          addedAt={addedAt}
          types={types}
          artists={artists}
        />
      </Suspense>
    </div>
  );
}
