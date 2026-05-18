import { requireUserId } from "../_lib/current-user";
import { getSupabaseServer } from "@/lib/supabase/server";
import { PageHeader } from "../_components/PageHeader";
import { CardRail } from "../_components/CardRail";
import { CardsOverTimeChart } from "./_components/CardsOverTimeChart";
import { ValueOverTimePlaceholder } from "./_components/ValueOverTimePlaceholder";
import { PortfolioStats } from "./_components/PortfolioStats";
import { cumulativeByDay } from "@/lib/data/cumulative-acquisitions";
import { getAllCards } from "@/lib/data/binder-scope";

const RECENT_PACK_LIMIT = 12;

export default async function PortfolioPage() {
  const userId = await requireUserId();
  const supabase = await getSupabaseServer();

  const [ownedRes, packsRes, favRes, allCards] = await Promise.all([
    supabase
      .from("owned_cards")
      .select("card_id, acquired_at")
      .eq("user_id", userId)
      .order("acquired_at", { ascending: true }),
    supabase
      .from("packs_opened")
      .select("id, set_id, opened_at")
      .eq("user_id", userId)
      .order("opened_at", { ascending: false })
      .limit(RECENT_PACK_LIMIT),
    supabase.from("user_favorites").select("card_id").eq("user_id", userId),
    getAllCards(),
  ]);

  const owned = ownedRes.data ?? [];
  const points = cumulativeByDay(
    owned.map((r) => ({ acquired_at: r.acquired_at as string })),
  );
  const ownedIds = new Set(owned.map((r) => r.card_id as string));
  const distinctSpecies = new Set<number>();
  for (const c of allCards) {
    if (!ownedIds.has(c.id)) continue;
    for (const d of c.dex) distinctSpecies.add(d);
  }

  const packIds = (packsRes.data ?? []).map((p) => p.id as string);
  let recentPackCards: typeof allCards = [];
  if (packIds.length > 0) {
    const { data: contents } = await supabase
      .from("pack_contents")
      .select("card_id")
      .in("pack_id", packIds);
    const seen = new Set<string>();
    const ids: string[] = [];
    for (const r of contents ?? []) {
      const id = r.card_id as string;
      if (seen.has(id)) continue;
      seen.add(id);
      ids.push(id);
    }
    const byId = new Map(allCards.map((c) => [c.id, c]));
    recentPackCards = ids
      .map((id) => byId.get(id))
      .filter((c): c is (typeof allCards)[number] => Boolean(c))
      .slice(0, RECENT_PACK_LIMIT);
  }

  return (
    <div className="mx-auto max-w-[1280px] space-y-8">
      <PageHeader
        eyebrow="Portfolio"
        title="Your collection at a glance"
        subtitle="Lifetime stats, growth over time, and your latest pulls."
      />

      <PortfolioStats
        totalCards={owned.length}
        distinctSpecies={distinctSpecies.size}
        packsOpened={packsRes.data?.length ?? 0}
        favoritesCount={favRes.data?.length ?? 0}
      />

      <section className="space-y-3">
        <header>
          <h3 className="text-sm font-semibold tracking-tight">Cards owned over time</h3>
          <p className="text-xs text-muted">
            Every card you{"'"}ve added, plotted cumulatively by acquisition date.
          </p>
        </header>
        <CardsOverTimeChart points={points} />
      </section>

      <ValueOverTimePlaceholder />

      <CardRail
        title="Recent pack pulls"
        subtitle="Cards from your last few opened packs"
        cards={recentPackCards}
        emptyMessage="Log a pack to see pulls here."
        href="/packs"
        rail="recent-pack-pulls"
      />
    </div>
  );
}
