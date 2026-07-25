// Lightweight name-based card autocomplete for client UIs that need to
// resolve a free-text query into a specific card (singles purchase form,
// sale form, PSA submission flow). The full card index is server-side
// only — ~8MB of JSON cached after first call by getAllCards.

import { NextResponse } from "next/server";
import { getAllCards } from "@/lib/data/binder-scope";

// Safety valve, not a display cap. Two-character queries can match
// thousands of cards ("ch" hits 1627), and shipping all of those helps
// nobody — the response carries `total` so the UI can tell the user to
// keep typing. Anything specific enough to be a real card name lands
// well under this: "charizard" is 107, "pikachu" 177, "energy" 485.
const MAX_LIMIT = 500;
const DEFAULT_LIMIT = 500;

export async function GET(req: Request) {
  const url = new URL(req.url);
  const q = (url.searchParams.get("q") ?? "").trim().toLowerCase();
  const limitRaw = parseInt(url.searchParams.get("limit") ?? "", 10);
  const limit = Number.isFinite(limitRaw)
    ? Math.min(Math.max(limitRaw, 1), MAX_LIMIT)
    : DEFAULT_LIMIT;

  if (q.length < 2) {
    return NextResponse.json({ results: [], total: 0 });
  }

  const all = await getAllCards();
  // Two-pass ranking: prefix matches on name first, then substring
  // matches. Keeps "char" finding "Charizard" before random "Searcharizard"
  // type wildcards while still being forgiving.
  //
  // The whole catalogue is scanned deliberately. This loop used to break
  // once it had collected MAX_LIMIT * 4 candidates, which truncated the
  // scan itself rather than just the output: "charizard" stopped at card
  // 17329 of 20428, so prefix matches living in the last 3000 cards could
  // never be returned no matter what limit the caller asked for. 20k
  // startsWith/includes calls over a memoised array is sub-millisecond.
  const prefix: typeof all = [];
  const substring: typeof all = [];
  for (const c of all) {
    const name = c.name.toLowerCase();
    if (name.startsWith(q)) prefix.push(c);
    else if (name.includes(q)) substring.push(c);
  }
  const total = prefix.length + substring.length;
  const ranked = [...prefix, ...substring].slice(0, limit);
  const results = ranked.map((c) => ({
    id: c.id,
    name: c.name,
    setId: c.setId,
    number: c.number,
    imageSmall: c.imageSmall,
    imageLarge: c.imageLarge,
    rarity: c.rarity,
    regulationMark: c.regulationMark ?? null,
  }));
  // `total` is the full match count before slicing, so the UI can say it
  // is showing a subset instead of silently capping.
  return NextResponse.json({ results, total });
}
