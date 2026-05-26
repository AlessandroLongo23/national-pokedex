// TCGplayer-price fallback via tcgcsv.com — used when pokemontcg.io's
// nightly snapshot has no `tcgplayer.prices` for a card (typically brand-new
// sets where pokemontcg.io's pipeline hasn't ingested yet, e.g. Chaos
// Rising on release day).
//
// The setId→groupId and cardId→productId mappings are built at ingest time
// (see scripts/ingest/fetchTcgCsv.ts) and committed as tcgcsvMap.json, so
// at runtime we just do one fetch per set against tcgcsv's prices endpoint.
//
// Constraint from CLAUDE.md: only free sources allowed. tcgcsv.com is a
// free static mirror of TCGplayer's public prices feed — not Scrydex.

import { TCGCSV_MAP } from "@/lib/data";

const API = "https://tcgcsv.com/tcgplayer/3";
const REVALIDATE_SECONDS = 60 * 60 * 24;

interface TcCsvPriceRow {
  productId: number;
  lowPrice: number | null;
  midPrice: number | null;
  highPrice: number | null;
  marketPrice: number | null;
  directLowPrice: number | null;
  subTypeName: string;
}

// Same preference order as TCGPLAYER_VARIANT_ORDER in pokemontcg.ts, but
// using tcgcsv's `subTypeName` casing ("Holofoil" / "Reverse Holofoil" /
// "Normal" / "1st Edition Holofoil" / "1st Edition Normal").
const VARIANT_ORDER = [
  "Holofoil",
  "Reverse Holofoil",
  "Normal",
  "1st Edition Holofoil",
  "1st Edition Normal",
  "Unlimited Holofoil",
  "Unlimited",
];

function variantRank(subType: string): number {
  const i = VARIANT_ORDER.indexOf(subType);
  return i === -1 ? VARIANT_ORDER.length : i;
}

function pickMarketPrice(rows: TcCsvPriceRow[]): number | undefined {
  let best: TcCsvPriceRow | null = null;
  for (const row of rows) {
    const v = row.marketPrice ?? row.midPrice ?? row.lowPrice;
    if (typeof v !== "number" || v <= 0) continue;
    if (!best || variantRank(row.subTypeName) < variantRank(best.subTypeName)) {
      best = row;
    }
  }
  if (!best) return undefined;
  return best.marketPrice ?? best.midPrice ?? best.lowPrice ?? undefined;
}

async function fetchGroupPrices(groupId: number): Promise<Map<number, TcCsvPriceRow[]>> {
  const res = await fetch(`${API}/${groupId}/prices`, {
    headers: {
      Accept: "application/json",
      "User-Agent": "national-pokedex/0.1 (https://github.com/local; longoa02@gmail.com)",
    },
    next: { revalidate: REVALIDATE_SECONDS, tags: [`tcgcsv:${groupId}`] },
  });
  if (!res.ok) throw new Error(`tcgcsv ${res.status} for group ${groupId}`);
  const json = (await res.json()) as { results: TcCsvPriceRow[] };
  const byProduct = new Map<number, TcCsvPriceRow[]>();
  for (const row of json.results ?? []) {
    const list = byProduct.get(row.productId);
    if (list) list.push(row);
    else byProduct.set(row.productId, [row]);
  }
  return byProduct;
}

// Returns cardId → tcgplayer price (USD) for every card in `setId` that
// tcgcsv has data for. Empty map if the set isn't in our static map or the
// fetch fails — callers should treat absence as "no fallback available"
// and degrade gracefully.
export async function fetchSetTcgplayerFallback(setId: string): Promise<Map<string, number>> {
  const groupId = TCGCSV_MAP.groups[setId];
  if (!groupId) return new Map();

  let byProduct: Map<number, TcCsvPriceRow[]>;
  try {
    byProduct = await fetchGroupPrices(groupId);
  } catch (err) {
    console.warn(`[pricing] tcgcsv fallback for ${setId} failed:`, err);
    return new Map();
  }

  const out = new Map<string, number>();
  const setPrefix = `${setId}-`;
  for (const [cardId, productId] of Object.entries(TCGCSV_MAP.products)) {
    if (!cardId.startsWith(setPrefix)) continue;
    const rows = byProduct.get(productId);
    if (!rows) continue;
    const price = pickMarketPrice(rows);
    if (price != null) out.set(cardId, price);
  }
  return out;
}
