// Lightweight name-based card autocomplete for client UIs that need to
// resolve a free-text query into a specific card (singles purchase form,
// future PSA submission flow, etc.). The full card index is server-side
// only — ~8MB of JSON cached after first call by getAllCards.

import { NextResponse } from "next/server";
import { getAllCards } from "@/lib/data/binder-scope";

const MAX_LIMIT = 25;
const DEFAULT_LIMIT = 12;

export async function GET(req: Request) {
  const url = new URL(req.url);
  const q = (url.searchParams.get("q") ?? "").trim().toLowerCase();
  const limitRaw = parseInt(url.searchParams.get("limit") ?? "", 10);
  const limit = Number.isFinite(limitRaw)
    ? Math.min(Math.max(limitRaw, 1), MAX_LIMIT)
    : DEFAULT_LIMIT;

  if (q.length < 2) {
    return NextResponse.json({ results: [] });
  }

  const all = await getAllCards();
  // Two-pass ranking: prefix matches on name first, then substring
  // matches. Keeps "char" finding "Charizard" before random "Searcharizard"
  // type wildcards while still being forgiving.
  const prefix: typeof all = [];
  const substring: typeof all = [];
  for (const c of all) {
    const name = c.name.toLowerCase();
    if (name.startsWith(q)) prefix.push(c);
    else if (name.includes(q)) substring.push(c);
    if (prefix.length + substring.length >= MAX_LIMIT * 4) break;
  }
  const ranked = [...prefix, ...substring].slice(0, limit);
  const results = ranked.map((c) => ({
    id: c.id,
    name: c.name,
    setId: c.setId,
    number: c.number,
    imageSmall: c.imageSmall,
  }));
  return NextResponse.json({ results });
}
