import { NextResponse } from "next/server";
import { CARD_INDEX_BY_VARIANT, loadSetCards } from "@/lib/data";
import type { CardEntry } from "@/lib/data/types";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ variantKey: string }> },
) {
  const { variantKey } = await params;
  if (!/^[a-z0-9-]+$/.test(variantKey)) {
    return NextResponse.json({ error: "invalid variantKey" }, { status: 400 });
  }

  const ids = CARD_INDEX_BY_VARIANT[variantKey] ?? [];
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

  out.sort((a, b) => a.setId.localeCompare(b.setId) || a.numberInt - b.numberInt);
  return NextResponse.json(out);
}
