import { NextResponse } from "next/server";
import { CARD_INDEX, loadSetCards } from "@/lib/data";
import type { CardEntry } from "@/lib/data/types";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ dex: string }> },
) {
  const { dex } = await params;
  const n = Number(dex);
  if (!Number.isInteger(n) || n < 1 || n > 1025) {
    return NextResponse.json({ error: "invalid dex" }, { status: 400 });
  }

  const ids = CARD_INDEX[n] ?? [];
  if (ids.length === 0) return NextResponse.json([]);

  const idSet = new Set(ids);
  const setIds = new Set(ids.map((id) => id.replace(/-[^-]+$/, "")));
  const out: CardEntry[] = [];

  for (const setId of setIds) {
    try {
      const cards = await loadSetCards(setId);
      for (const c of cards) {
        if (idSet.has(c.id)) out.push(c);
      }
    } catch {
      // skip missing per-set file
    }
  }

  // Stable ordering: by set release order (proxied by setId sort) then number.
  out.sort((a, b) => a.setId.localeCompare(b.setId) || a.numberInt - b.numberInt);
  return NextResponse.json(out);
}
