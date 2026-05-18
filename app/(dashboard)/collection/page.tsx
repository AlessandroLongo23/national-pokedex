import { requireUserId } from "../_lib/current-user";
import { getSupabaseServer } from "@/lib/supabase/server";
import { PageHeader } from "../_components/PageHeader";
import { CardRail } from "../_components/CardRail";
import { getAllCards } from "@/lib/data/binder-scope";
import { RARITY_ORDER } from "@/lib/data/types";
import type { CardEntry, Rarity } from "@/lib/data/types";

const RAIL_SIZE = 12;

export default async function CollectionPage() {
  const userId = await requireUserId();
  const supabase = await getSupabaseServer();

  const [ownedRes, favoritesRes, wishlistRes, allCards] = await Promise.all([
    supabase
      .from("owned_cards")
      .select("card_id, acquired_at")
      .eq("user_id", userId)
      .order("acquired_at", { ascending: false })
      .limit(500),
    supabase
      .from("user_favorites")
      .select("card_id, favorited_at")
      .eq("user_id", userId)
      .order("favorited_at", { ascending: false })
      .limit(200),
    supabase
      .from("wishlist_cards")
      .select("card_id, added_at")
      .eq("user_id", userId)
      .order("added_at", { ascending: false })
      .limit(200),
    getAllCards(),
  ]);

  const cardsById = new Map<string, CardEntry>(allCards.map((c) => [c.id, c]));

  const rarityRank: Record<Rarity, number> = Object.fromEntries(
    RARITY_ORDER.map((r, i) => [r, i]),
  ) as Record<Rarity, number>;

  function pluck(ids: { card_id: unknown }[]): CardEntry[] {
    const out: CardEntry[] = [];
    for (const row of ids) {
      const c = cardsById.get(row.card_id as string);
      if (c) out.push(c);
    }
    return out;
  }

  const ownedCards = pluck(ownedRes.data ?? []);
  const recentlyAdded = ownedCards.slice(0, RAIL_SIZE);
  const byRarity = [...ownedCards]
    .sort((a, b) => (rarityRank[b.rarity] ?? 0) - (rarityRank[a.rarity] ?? 0))
    .slice(0, RAIL_SIZE);
  const byFavorite = pluck(favoritesRes.data ?? []).slice(0, RAIL_SIZE);
  const byWishlist = pluck(wishlistRes.data ?? []).slice(0, RAIL_SIZE);

  return (
    <div className="mx-auto max-w-[1280px] space-y-8">
      <PageHeader
        eyebrow="Yours"
        title="Collection"
        subtitle="Everything you own, surfaced through rails."
      />

      <CardRail
        title="Recently added"
        subtitle="The latest cards added to your collection"
        cards={recentlyAdded}
        emptyMessage="You haven't added any cards yet."
        rail="recently-added"
      />

      <CardRail
        title="Top by rarity"
        subtitle="Your rarest pulls first"
        cards={byRarity}
        emptyMessage="Nothing to rank yet — add some cards."
        rail="by-rarity"
      />

      <CardRail
        title="Favorites"
        subtitle="Cards you've starred"
        cards={byFavorite}
        emptyMessage="Star a card from any tile to add it here."
        rail="favorites"
        href="/collection"
      />

      <CardRail
        title="Wishlist"
        subtitle="Cards you want next"
        cards={byWishlist}
        emptyMessage="Nothing on your wishlist yet."
        rail="wishlist"
        href="/wishlist"
      />

      <section
        className="rounded-md border border-dashed border-border p-6 text-center"
        data-rail="by-price"
      >
        <h3 className="text-sm font-semibold tracking-tight">Top by price</h3>
        <p className="mt-1 text-xs text-muted">
          Coming with price data — see BACKLOG section 7.
        </p>
      </section>
    </div>
  );
}
