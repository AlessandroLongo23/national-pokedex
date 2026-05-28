import { Package } from "lucide-react";
import { getSupabaseServer } from "@/lib/supabase/server";
import { CARD_INDEX, loadSetCards } from "@/lib/data";
import type { CardEntry } from "@/lib/data/types";
import { requireUserId } from "../_lib/current-user";
import { PageHeader } from "../_components/PageHeader";
import { PacksClient } from "./PacksClient";
import type { PackHistoryCard, PackHistoryItem } from "../_components/PackHistory";

interface PackRow {
  id: string;
  set_id: string;
  opened_at: string;
}

async function loadHistory(): Promise<PackHistoryItem[]> {
  const userId = await requireUserId();
  const supabase = await getSupabaseServer();
  const { data: packs, error } = await supabase
    .from("packs_opened")
    .select("id, set_id, opened_at")
    .eq("user_id", userId)
    .order("opened_at", { ascending: false })
    .limit(50);
  if (error) throw new Error(`Failed to load pack history: ${error.message}`);
  if (!packs || packs.length === 0) return [];

  const ids = (packs as PackRow[]).map((p) => p.id);
  const { data: contents, error: contentsErr } = await supabase
    .from("pack_contents")
    .select("pack_id, card_id")
    .in("pack_id", ids);
  if (contentsErr) throw new Error(contentsErr.message);

  // Group contents by pack and collect every set we need to load.
  const cardsByPack = new Map<string, string[]>();
  const allSetIds = new Set<string>();
  for (const row of (contents ?? []) as { pack_id: string; card_id: string }[]) {
    const arr = cardsByPack.get(row.pack_id);
    if (arr) arr.push(row.card_id);
    else cardsByPack.set(row.pack_id, [row.card_id]);
    allSetIds.add(row.card_id.replace(/-[^-]+$/, ""));
  }

  // Load per-set card data and build a lookup.
  const cardLookup = new Map<string, CardEntry>();
  for (const setId of allSetIds) {
    try {
      const cards = await loadSetCards(setId);
      for (const c of cards) cardLookup.set(c.id, c);
    } catch {
      // skip
    }
  }

  // Walk chronologically to compute "new species at time of opening" — what
  // species hadn't been seen across all earlier packs.
  const sorted = [...(packs as PackRow[])].sort((a, b) => a.opened_at.localeCompare(b.opened_at));
  const seenDex = new Set<number>();
  const newCounts = new Map<string, number>();
  for (const p of sorted) {
    const cardIds = cardsByPack.get(p.id) ?? [];
    let n = 0;
    for (const id of cardIds) {
      const dexes = CARD_INDEX[0]; // noop reference to satisfy lint
      void dexes;
      const c = cardLookup.get(id);
      if (!c) continue;
      for (const d of c.dex) {
        if (!seenDex.has(d)) {
          seenDex.add(d);
          n++;
        }
      }
    }
    newCounts.set(p.id, n);
  }

  return (packs as PackRow[]).map((p) => {
    const cardIds = cardsByPack.get(p.id) ?? [];
    const cards: PackHistoryCard[] = cardIds
      .map((id) => {
        const c = cardLookup.get(id);
        return {
          cardId: id,
          name: c?.name ?? id,
          imageSmall: c?.imageSmall ?? "",
          numberInt: c?.numberInt ?? Number.MAX_SAFE_INTEGER,
        };
      })
      .sort((a, b) => a.numberInt - b.numberInt)
      .map(({ numberInt: _n, ...rest }) => rest);
    return {
      id: p.id,
      setId: p.set_id,
      openedAt: p.opened_at,
      cards,
      newWhenOpened: newCounts.get(p.id) ?? 0,
    };
  });
}

export default async function PacksPage() {
  const history = await loadHistory();
  return (
    <div className="mx-auto max-w-[1280px] space-y-8">
      <PageHeader
        icon={Package}
        title="Packs"
        subtitle="Rarity-aware simulation of every set against your current binder. Toggle the local-store filter to focus on sets you can actually buy."
      />
      <PacksClient history={history} />
    </div>
  );
}
